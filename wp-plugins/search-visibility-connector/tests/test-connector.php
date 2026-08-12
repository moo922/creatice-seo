<?php
/**
 * Core connector tests: route registration, auth gating, helpers, and the
 * request/response contract used by the Creative SEO platform onboarding.
 */

/**
 * @group search-visibility-connector
 */
class SVC_Connector_Test extends WP_UnitTestCase {

	public function set_up() {
		parent::set_up();
		$this->server = rest_get_server();
		$this->user   = $this->factory->user->create( array( 'role' => 'administrator' ) );
		wp_set_current_user( $this->user );
	}

	public function test_plugin_header_is_loaded() {
		$this->assertTrue( defined( 'SVC_REST_NAMESPACE' ) );
		$this->assertSame( 'search-visibility-connector/v1', SVC_REST_NAMESPACE );
	}

	public function test_all_routes_are_registered() {
		$routes = $this->server->get_routes( SVC_REST_NAMESPACE );
		foreach ( array(
			'/health',
			'/info',
			'/plugins',
			'/rank-math',
			'/permissions',
			'/post-types',
			'/posts',
			'/posts/(?P<id>[\d]+)',
			'/posts/(?P<id>[\d]+)/status',
			'/content/(?P<id>[\d]+)',
			'/content/(?P<id>[\d]+)/internal-links',
			'/seo/(?P<id>[\d]+)',
			'/seo/(?P<id>[\d]+)/title',
			'/seo/(?P<id>[\d]+)/meta-description',
			'/seo/(?P<id>[\d]+)/canonical',
			'/seo/(?P<id>[\d]+)/robots',
			'/seo/(?P<id>[\d]+)/focus-keywords',
			'/seo/(?P<id>[\d]+)/schema',
		) as $route ) {
			$this->assertArrayHasKey( SVC_REST_NAMESPACE . $route, $routes, 'Missing route: ' . $route );
		}
	}

	public function test_unauthenticated_request_is_rejected() {
		wp_set_current_user( 0 );
		$request  = new WP_REST_Request( 'GET', '/' . SVC_REST_NAMESPACE . '/health' );
		$response = $this->server->dispatch( $request );
		$this->assertSame( 401, $response->get_status() );
	}

	public function test_health_endpoint_returns_ok() {
		$request  = new WP_REST_Request( 'GET', '/' . SVC_REST_NAMESPACE . '/health' );
		$response = $this->server->dispatch( $request );
		$this->assertSame( 200, $response->get_status() );
		$data = $response->get_data();
		$this->assertSame( 'ok', $data['status'] );
		$this->assertSame( SVC_PLUGIN_VERSION, $data['connector'] );
		$this->assertSame( 'up', $data['database'] );
		$this->assertArrayHasKey( 'unix_time', $data );
	}

	public function test_permissions_endpoint_reflects_abilities() {
		$request  = new WP_REST_Request( 'GET', '/' . SVC_REST_NAMESPACE . '/permissions' );
		$response = $this->server->dispatch( $request );
		$data     = $response->get_data();
		$this->assertTrue( $data['authenticated'] );
		$this->assertTrue( $data['can_read'] );
		$this->assertTrue( $data['can_write'] );
		$this->assertTrue( $data['can_manage'] );
	}

	public function test_rank_math_detection_shape() {
		$request  = new WP_REST_Request( 'GET', '/' . SVC_REST_NAMESPACE . '/rank-math' );
		$response = $this->server->dispatch( $request );
		$data     = $response->get_data();
		$this->assertArrayHasKey( 'detected', $data );
		$this->assertIsBool( $data['detected'] );
		$this->assertArrayHasKey( 'version', $data );
		$this->assertArrayHasKey( 'meta_keys', $data );
	}

	public function test_posts_listing_contract() {
		$this->factory->post->create_many(
			3,
			array( 'post_status' => 'publish', 'post_type' => 'post', 'post_content' => 'Hello <a href="/about">About</a>' )
		);

		$request  = new WP_REST_Request( 'GET', '/' . SVC_REST_NAMESPACE . '/posts' );
		$response = $this->server->dispatch( $request );
		$this->assertSame( 200, $response->get_status() );

		$data = $response->get_data();
		$this->assertSame( 3, $data['total'] );
		$this->assertArrayHasKey( 'items', $data );
		$this->assertArrayHasKey( 'total_pages', $data );

		$item = $data['items'][0];
		foreach ( array( 'wp_post_id', 'post_type', 'url', 'slug', 'status', 'title', 'content_hash', 'modified', 'seo' ) as $key ) {
			$this->assertArrayHasKey( $key, $item, 'Missing key: ' . $key );
		}
		// Initial import never leaks raw content.
		$this->assertArrayNotHasKey( 'content', $item );
		$this->assertSame( 40, strlen( $item['content_hash'] ) );
	}

	public function test_content_only_included_on_request() {
		$post_id = $this->factory->post->create( array( 'post_content' => '<p>Secret body</p>' ) );

		$request  = new WP_REST_Request( 'GET', '/' . SVC_REST_NAMESPACE . '/content/' . $post_id );
		$response = $this->server->dispatch( $request );
		$data     = $response->get_data();
		$this->assertSame( '<p>Secret body</p>', $data['content'] );
		$this->assertSame( svc_content_hash( '<p>Secret body</p>' ), $data['content_hash'] );
	}

	public function test_draft_creation_and_status_update() {
		$request = new WP_REST_Request( 'POST', '/' . SVC_REST_NAMESPACE . '/posts' );
		$request->set_body_params(
			array(
				'title'     => 'Draft from platform',
				'content'   => '<p>Body</p>',
				'status'    => 'draft',
				'post_type' => 'post',
			)
		);
		$response = $this->server->dispatch( $request );
		$this->assertSame( 201, $response->get_status() );
		$post_id = $response->get_data()['wp_post_id'];

		$status_request  = new WP_REST_Request( 'PATCH', '/' . SVC_REST_NAMESPACE . '/posts/' . $post_id . '/status' );
		$status_request->set_body_params( array( 'status' => 'publish' ) );
		$status_response = $this->server->dispatch( $status_request );
		$this->assertSame( 200, $status_response->get_status() );
		$this->assertSame( 'publish', $status_response->get_data()['status'] );
	}

	public function test_content_write_roundtrip() {
		$post_id = $this->factory->post->create( array( 'post_content' => 'Old' ) );

		$request = new WP_REST_Request( 'PUT', '/' . SVC_REST_NAMESPACE . '/content/' . $post_id );
		$request->set_body_params( array( 'content' => '<p>New body</p>' ) );
		$response = $this->server->dispatch( $request );
		$this->assertSame( 200, $response->get_status() );
		$this->assertSame( '<p>New body</p>', $response->get_data()['content'] );
		$this->assertSame( svc_content_hash( '<p>New body</p>' ), $response->get_data()['content_hash'] );
	}

	public function test_seo_metadata_roundtrip_requires_rank_math() {
		$post_id = $this->factory->post->create();

		$request = new WP_REST_Request( 'PUT', '/' . SVC_REST_NAMESPACE . '/seo/' . $post_id );
		$request->set_body_params( array( 'title' => 'SEO Title' ) );
		$response = $this->server->dispatch( $request );

		$detection = svc_rank_math_detection();
		if ( $detection['detected'] ) {
			$this->assertSame( 200, $response->get_status() );
			$this->assertSame( 'SEO Title', get_post_meta( $post_id, 'rank_math_title', true ) );
		} else {
			$this->assertSame( 409, $response->get_status() );
		}
	}

	public function test_internal_links_endpoint() {
		$post_id = $this->factory->post->create(
			array(
				'post_content' => '<a href="/about">About</a> <a href="https://example.com/external">External</a>',
			)
		);

		$request  = new WP_REST_Request( 'GET', '/' . SVC_REST_NAMESPACE . '/content/' . $post_id . '/internal-links' );
		$response = $this->server->dispatch( $request );
		$data     = $response->get_data();

		$this->assertSame( 1, $data['total'] );
		$this->assertSame( 1, count( $data['links'] ) );
		$this->assertStringContainsString( 'about', $data['links'][0]['url'] );
	}

	public function test_invalid_robots_are_rejected() {
		$result = svc_sanitize_robots( array( 'noindex', 'bogus-rule' ) );
		$this->assertWPError( $result );
		$this->assertSame( 'svc_invalid_robots', $result->get_error_code() );
	}

	public function test_valid_robots_are_deduplicated() {
		$result = svc_sanitize_robots( array( 'noindex', 'noindex', 'nofollow' ) );
		$this->assertNotWPError( $result );
		$this->assertSame( array( 'noindex', 'nofollow' ), $result );
	}
}
