<?php
/**
 * REST controller that exposes the connector endpoints.
 *
 * Every route uses the same permission_callback so unauthenticated or
 * low-privilege requests are rejected before any handler runs. Write routes
 * additionally check the concrete capability inside their handler.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class SVC_Rest_Controller {

	/**
	 * Register all routes for the namespace.
	 *
	 * @return void
	 */
	public function register_routes() {
		$read = array(
			'permission_callback' => array( $this, 'permission_callback' ),
		);

		// --- Platform onboarding -------------------------------------------------
		register_rest_route(
			SVC_REST_NAMESPACE,
			'/health',
			array(
				array_merge( $read, array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_health' ),
				) ),
			)
		);

		register_rest_route(
			SVC_REST_NAMESPACE,
			'/info',
			array(
				array_merge( $read, array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_info' ),
				) ),
			)
		);

		register_rest_route(
			SVC_REST_NAMESPACE,
			'/plugins',
			array(
				array_merge( $read, array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_plugins' ),
				) ),
			)
		);

		register_rest_route(
			SVC_REST_NAMESPACE,
			'/rank-math',
			array(
				array_merge( $read, array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_rank_math' ),
				) ),
			)
		);

		register_rest_route(
			SVC_REST_NAMESPACE,
			'/permissions',
			array(
				array_merge( $read, array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_permissions' ),
				) ),
			)
		);

		register_rest_route(
			SVC_REST_NAMESPACE,
			'/post-types',
			array(
				array_merge( $read, array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_post_types' ),
				) ),
			)
		);

		// --- Posts / content ------------------------------------------------------
		register_rest_route(
			SVC_REST_NAMESPACE,
			'/posts',
			array(
				array_merge( $read, array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_posts' ),
					'args'                => $this->posts_args(),
				) ),
				array_merge( $read, array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'create_post' ),
					'args'                => $this->create_post_args(),
				) ),
			)
		);

		register_rest_route(
			SVC_REST_NAMESPACE,
			'/posts/(?P<id>[\d]+)',
			array(
				array_merge( $read, array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_post' ),
					'args'                => $this->id_args(),
				) ),
				array_merge( $read, array(
					'methods'             => WP_REST_Server::EDITABLE,
					'callback'            => array( $this, 'update_post' ),
					'args'                => $this->update_post_args(),
				) ),
			)
		);

		register_rest_route(
			SVC_REST_NAMESPACE,
			'/posts/(?P<id>[\d]+)/status',
			array(
				array_merge( $read, array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_post_status' ),
					'args'                => $this->id_args(),
				) ),
				array_merge( $read, array(
					'methods'             => WP_REST_Server::EDITABLE,
					'callback'            => array( $this, 'update_post_status' ),
					'args'                => array_merge(
						$this->id_args(),
						array( 'status' => $this->status_arg() )
					),
				) ),
			)
		);

		register_rest_route(
			SVC_REST_NAMESPACE,
			'/content/(?P<id>[\d]+)',
			array(
				array_merge( $read, array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_content' ),
					'args'                => $this->id_args(),
				) ),
				array_merge( $read, array(
					'methods'             => WP_REST_Server::EDITABLE,
					'callback'            => array( $this, 'update_content' ),
					'args'                => array_merge(
						$this->id_args(),
						array( 'content' => $this->content_arg() )
					),
				) ),
			)
		);

		register_rest_route(
			SVC_REST_NAMESPACE,
			'/content/(?P<id>[\d]+)/internal-links',
			array(
				array_merge( $read, array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_internal_links' ),
					'args'                => $this->id_args(),
				) ),
			)
		);

		// --- Rank Math SEO metadata ------------------------------------------------
		register_rest_route(
			SVC_REST_NAMESPACE,
			'/seo/(?P<id>[\d]+)',
			array(
				array_merge( $read, array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_seo' ),
					'args'                => $this->id_args(),
				) ),
				array_merge( $read, array(
					'methods'             => WP_REST_Server::EDITABLE,
					'callback'            => array( $this, 'update_seo' ),
					'args'                => array_merge( $this->id_args(), $this->seo_args() ),
				) ),
			)
		);

		$this->register_seo_field_routes();
	}

	/**
	 * Permission callback shared by every route.
	 *
	 * @return bool
	 */
	public function permission_callback() {
		return svc_user_is_authorized();
	}

	/**
	 * GET /health
	 *
	 * @return WP_REST_Response
	 */
	public function get_health() {
		global $wpdb, $wp_version;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$db_ok = (bool) $wpdb->get_var( 'SELECT 1' );

		return rest_ensure_response(
			array(
				'status'        => 'ok',
				'connector'     => SVC_PLUGIN_VERSION,
				'namespace'     => SVC_REST_NAMESPACE,
				'wp_version'    => $wp_version,
				'php_version'   => PHP_VERSION,
				'database'      => $db_ok ? 'up' : 'down',
				'time'          => gmdate( 'c' ),
				'unix_time'     => time(),
			)
		);
	}

	/**
	 * GET /info
	 *
	 * @return WP_REST_Response
	 */
	public function get_info() {
		return rest_ensure_response( svc_site_info() );
	}

	/**
	 * GET /plugins
	 *
	 * @return WP_REST_Response
	 */
	public function get_plugins() {
		return rest_ensure_response(
			array(
				'plugins' => svc_active_plugins(),
				'total'   => count( svc_active_plugins() ),
			)
		);
	}

	/**
	 * GET /rank-math
	 *
	 * @return WP_REST_Response
	 */
	public function get_rank_math() {
		return rest_ensure_response( svc_rank_math_detection() );
	}

	/**
	 * GET /permissions
	 *
	 * @return WP_REST_Response
	 */
	public function get_permissions() {
		return rest_ensure_response( svc_user_abilities() );
	}

	/**
	 * GET /post-types
	 *
	 * @return WP_REST_Response
	 */
	public function get_post_types() {
		return rest_ensure_response(
			array(
				'post_types' => svc_public_post_types_info(),
				'total'      => count( svc_public_post_types_info() ),
			)
		);
	}

	/**
	 * GET /posts
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public function get_posts( $request ) {
		$result = svc_list_posts(
			array(
				'post_type'       => $request->get_param( 'post_type' ),
				'status'          => $request->get_param( 'status' ),
				'page'            => $request->get_param( 'page' ),
				'per_page'        => $request->get_param( 'per_page' ),
				'include_content' => $request->get_param( 'include_content' ),
			)
		);
		$response = rest_ensure_response( $result );
		$response->header( 'X-SVC-Total', (string) $result['total'] );
		return $response;
	}

	/**
	 * POST /posts — create a draft.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public function create_post( $request ) {
		$post = svc_create_post(
			array(
				'title'     => $request->get_param( 'title' ),
				'content'   => $request->get_param( 'content' ),
				'post_type' => $request->get_param( 'post_type' ),
				'status'    => $request->get_param( 'status' ),
				'slug'      => $request->get_param( 'slug' ),
				'excerpt'   => $request->get_param( 'excerpt' ),
			)
		);
		if ( is_wp_error( $post ) ) {
			return $post;
		}
		return rest_ensure_response( svc_post_to_array( $post, true ) );
	}

	/**
	 * GET /posts/{id}
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public function get_post( $request ) {
		$post = svc_get_post_or_error( (int) $request['id'] );
		if ( is_wp_error( $post ) ) {
			return $post;
		}
		return rest_ensure_response(
			svc_post_to_array( $post, svc_bool( $request->get_param( 'include_content' ) ) )
		);
	}

	/**
	 * PATCH /posts/{id} — update content, title, slug, status.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public function update_post( $request ) {
		$post = svc_update_post(
			(int) $request['id'],
			array(
				'content' => $request->get_param( 'content' ),
				'title'   => $request->get_param( 'title' ),
				'slug'    => $request->get_param( 'slug' ),
				'excerpt' => $request->get_param( 'excerpt' ),
				'status'  => $request->get_param( 'status' ),
			)
		);
		if ( is_wp_error( $post ) ) {
			return $post;
		}
		return rest_ensure_response( svc_post_to_array( $post, true ) );
	}

	/**
	 * GET /posts/{id}/status
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public function get_post_status( $request ) {
		$post = svc_get_post_or_error( (int) $request['id'] );
		if ( is_wp_error( $post ) ) {
			return $post;
		}
		return rest_ensure_response(
			array(
				'id'     => (int) $post->ID,
				'status' => $post->post_status,
			)
		);
	}

	/**
	 * PATCH /posts/{id}/status
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public function update_post_status( $request ) {
		$post = svc_update_post_status( (int) $request['id'], $request->get_param( 'status' ) );
		if ( is_wp_error( $post ) ) {
			return $post;
		}
		return rest_ensure_response(
			array(
				'id'     => (int) $post->ID,
				'status' => $post->post_status,
			)
		);
	}

	/**
	 * GET /content/{id}
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public function get_content( $request ) {
		$post = svc_get_post_or_error( (int) $request['id'] );
		if ( is_wp_error( $post ) ) {
			return $post;
		}
		return rest_ensure_response(
			array(
				'id'      => (int) $post->ID,
				'content' => $post->post_content,
				'excerpt' => $post->post_excerpt,
				'content_hash' => svc_content_hash( $post->post_content ),
			)
		);
	}

	/**
	 * PUT /content/{id} — content write.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public function update_content( $request ) {
		$post = svc_update_post( (int) $request['id'], array( 'content' => $request->get_param( 'content' ) ) );
		if ( is_wp_error( $post ) ) {
			return $post;
		}
		return rest_ensure_response(
			array(
				'id'      => (int) $post->ID,
				'content' => $post->post_content,
				'content_hash' => svc_content_hash( $post->post_content ),
			)
		);
	}

	/**
	 * GET /content/{id}/internal-links
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public function get_internal_links( $request ) {
		$result = svc_internal_links( (int) $request['id'] );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		return rest_ensure_response( $result );
	}

	/**
	 * GET /seo/{id}
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public function get_seo( $request ) {
		$post = svc_get_post_or_error( (int) $request['id'] );
		if ( is_wp_error( $post ) ) {
			return $post;
		}
		$seo = svc_rank_math_read( $post->ID );
		return rest_ensure_response(
			array(
				'id'      => (int) $post->ID,
				'rank_math' => $seo,
			)
		);
	}

	/**
	 * PUT /seo/{id} — write Rank Math metadata.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public function update_seo( $request ) {
		$post = svc_get_post_or_error( (int) $request['id'] );
		if ( is_wp_error( $post ) ) {
			return $post;
		}

		$payload = array();
		foreach ( array( 'title', 'description', 'canonical', 'robots', 'focus_keywords', 'schema' ) as $field ) {
			if ( $request->has_param( $field ) ) {
				$payload[ $field ] = $request->get_param( $field );
			}
		}

		$result = svc_rank_math_write( $post->ID, $payload );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		return rest_ensure_response( $result );
	}

	/**
	 * Register the granular per-field SEO routes.
	 *
	 * @return void
	 */
	protected function register_seo_field_routes() {
		$read = array(
			'permission_callback' => array( $this, 'permission_callback' ),
		);

		$fields = array(
			'title'           => 'title',
			'meta-description' => 'description',
			'canonical'       => 'canonical',
			'robots'          => 'robots',
			'focus-keywords'  => 'focus_keywords',
			'schema'          => 'schema',
		);

		foreach ( $fields as $route => $field ) {
			register_rest_route(
				SVC_REST_NAMESPACE,
				'/seo/(?P<id>[\d]+)/' . $route,
				array(
					array_merge( $read, array(
						'methods'  => WP_REST_Server::READABLE,
						'callback' => function ( $request ) use ( $field ) {
							$post = svc_get_post_or_error( (int) $request['id'] );
							if ( is_wp_error( $post ) ) {
								return $post;
							}
							$seo = svc_rank_math_read( $post->ID );
							return rest_ensure_response(
								array(
									'id'       => (int) $post->ID,
									'field'    => $field,
									'value'    => $seo[ $field ],
									'available' => $seo['available'],
								)
							);
						},
						'args' => $this->id_args(),
					) ),
					array_merge( $read, array(
						'methods'  => WP_REST_Server::EDITABLE,
						'callback' => function ( $request ) use ( $field ) {
							$post = svc_get_post_or_error( (int) $request['id'] );
							if ( is_wp_error( $post ) ) {
								return $post;
							}
							$value = $request->get_param( 'value' );
							$result = svc_rank_math_write( $post->ID, array( $field => $value ) );
							if ( is_wp_error( $result ) ) {
								return $result;
							}
							return rest_ensure_response( $result );
						},
						'args' => array_merge(
							$this->id_args(),
							array( 'value' => array(
								'required'          => true,
								'validate_callback' => static function () {
									return true;
								},
							) )
						),
					) ),
				)
			);
		}
	}

	/**
	 * Shared arg schemas.
	 *
	 * @return array
	 */
	protected function id_args() {
		return array(
			'id' => array(
				'required'          => true,
				'validate_callback' => 'svc_is_positive_int',
				'sanitize_callback' => 'absint',
			),
		);
	}

	protected function posts_args() {
		return array(
			'post_type' => array(
				'required'          => false,
				'sanitize_callback' => 'sanitize_text_field',
			),
			'status' => array(
				'required'          => false,
				'sanitize_callback' => 'sanitize_key',
			),
			'page' => array(
				'required'          => false,
				'validate_callback' => 'svc_is_positive_int',
				'sanitize_callback' => 'absint',
				'default'           => 1,
			),
			'per_page' => array(
				'required'          => false,
				'validate_callback' => 'svc_is_positive_int',
				'sanitize_callback' => 'absint',
				'default'           => 50,
			),
			'include_content' => array(
				'required'          => false,
				'sanitize_callback' => 'rest_sanitize_boolean',
				'default'           => false,
			),
		);
	}

	protected function create_post_args() {
		return array(
			'title' => array(
				'required'          => true,
				'sanitize_callback' => 'sanitize_text_field',
			),
			'content' => array(
				'required'          => false,
				'default'           => '',
			),
			'post_type' => array(
				'required'          => false,
				'sanitize_callback' => 'sanitize_key',
				'default'           => 'post',
			),
			'status' => array(
				'required'          => false,
				'sanitize_callback' => 'sanitize_key',
				'default'           => 'draft',
			),
			'slug' => array(
				'required'          => false,
				'sanitize_callback' => 'sanitize_title',
			),
			'excerpt' => array(
				'required'          => false,
			),
		);
	}

	protected function update_post_args() {
		return array(
			'content' => array(
				'required'          => false,
			),
			'title' => array(
				'required'          => false,
				'sanitize_callback' => 'sanitize_text_field',
			),
			'slug' => array(
				'required'          => false,
				'sanitize_callback' => 'sanitize_title',
			),
			'excerpt' => array(
				'required'          => false,
			),
			'status' => array(
				'required'          => false,
				'sanitize_callback' => 'sanitize_key',
			),
		);
	}

	protected function status_arg() {
		return array(
			'required'          => true,
			'sanitize_callback' => 'sanitize_key',
		);
	}

	protected function content_arg() {
		return array(
			'required'          => true,
		);
	}

	protected function seo_args() {
		return array(
			'title' => array(
				'required'          => false,
				'sanitize_callback' => 'sanitize_text_field',
			),
			'description' => array(
				'required'          => false,
				'sanitize_callback' => 'sanitize_textarea_field',
			),
			'canonical' => array(
				'required'          => false,
				'sanitize_callback' => 'esc_url_raw',
			),
			'robots' => array(
				'required'          => false,
			),
			'focus_keywords' => array(
				'required'          => false,
				'sanitize_callback' => 'sanitize_text_field',
			),
			'schema' => array(
				'required'          => false,
			),
		);
	}
}
