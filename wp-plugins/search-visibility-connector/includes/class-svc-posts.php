<?php
/**
 * Post listing, draft creation, content read/write, status, internal links.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Project a WP_Post into the platform-facing shape. Content is only included
 * when explicitly requested; the platform imports via content_hash.
 *
 * @param WP_Post $post            Post object.
 * @param bool    $include_content Whether to include the raw content.
 * @return array
 */
function svc_post_to_array( $post, $include_content = false ) {
	$seo = svc_rank_math_read( $post->ID );

	$data = array(
		'id'             => (int) $post->ID,
		'wp_post_id'     => (int) $post->ID,
		'post_type'      => $post->post_type,
		'url'            => get_permalink( $post ),
		'slug'           => $post->post_name,
		'status'         => $post->post_status,
		'title'          => $post->post_title,
		'excerpt'        => $post->post_excerpt,
		'modified'       => mysql2date( 'c', $post->post_modified_gmt ),
		'modified_ts'    => (int) strtotime( $post->post_modified_gmt . ' UTC' ),
		'content_hash'   => svc_content_hash( $post->post_content ),
		'seo'            => array(
			'available'      => $seo['available'],
			'title'          => $seo['title'],
			'description'    => $seo['description'],
			'canonical'      => $seo['canonical'],
			'robots'         => $seo['robots'],
			'focus_keywords' => $seo['focus_keywords'],
			'schema'         => $seo['schema'],
		),
	);

	if ( $include_content ) {
		$data['content'] = $post->post_content;
	}

	return $data;
}

/**
 * List posts/pages/custom public post types with pagination.
 *
 * @param array $args Query arguments.
 * @return array
 */
function svc_list_posts( $args ) {
	$types  = svc_public_post_types( isset( $args['post_type'] ) ? $args['post_type'] : null );
	$status = isset( $args['status'] ) ? svc_string( $args['status'] ) : '';
	$page   = isset( $args['page'] ) ? max( 1, (int) $args['page'] ) : 1;
	$per_page = isset( $args['per_page'] ) ? min( 100, max( 1, (int) $args['per_page'] ) ) : 50;
	$include_content = svc_bool( isset( $args['include_content'] ) ? $args['include_content'] : false );

	if ( '' === $status || ! in_array( $status, get_post_stati(), true ) ) {
		$status = 'publish';
	}

	$query = new WP_Query(
		array(
			'post_type'      => $types,
			'post_status'    => $status,
			'posts_per_page' => $per_page,
			'paged'          => $page,
			'fields'         => 'ids',
		)
	);

	$posts = array();
	foreach ( $query->posts as $post_id ) {
		$posts[] = svc_post_to_array( get_post( $post_id ), $include_content );
	}

	return array(
		'items'       => $posts,
		'total'       => (int) $query->found_posts,
		'page'        => $page,
		'per_page'    => $per_page,
		'total_pages' => max( 1, (int) $query->max_num_pages ),
	);
}

/**
 * Create a draft (or publish directly with an explicit status).
 *
 * @param array $payload Title, content, post_type, status, slug, excerpt.
 * @return WP_Post|WP_Error
 */
function svc_create_post( $payload ) {
	$post_type = isset( $payload['post_type'] ) ? sanitize_key( svc_string( $payload['post_type'] ) ) : 'post';
	$type      = get_post_type_object( $post_type );
	if ( ! $type || empty( $type->public ) ) {
		return svc_error( 'svc_invalid_post_type', sprintf( 'Unsupported post type: %s', $post_type ), 400 );
	}

	$status = isset( $payload['status'] ) ? svc_string( $payload['status'] ) : 'draft';
	if ( ! in_array( $status, get_post_stati(), true ) ) {
		return svc_error( 'svc_invalid_status', sprintf( 'Unsupported post status: %s', $status ), 400 );
	}
	if ( ! current_user_can( $type->cap->edit_posts ) ) {
		return svc_error( 'svc_cannot_edit', 'Authenticated user cannot create posts of this type.', 403 );
	}

	$title   = isset( $payload['title'] ) ? sanitize_text_field( svc_string( $payload['title'] ) ) : '';
	$content = isset( $payload['content'] ) ? wp_kses_post( (string) $payload['content'] ) : '';

	$post_data = array(
		'post_title'   => $title,
		'post_content' => $content,
		'post_status'  => $status,
		'post_type'    => $post_type,
	);

	if ( isset( $payload['slug'] ) ) {
		$post_data['post_name'] = sanitize_title( svc_string( $payload['slug'] ) );
	}
	if ( isset( $payload['excerpt'] ) ) {
		$post_data['post_excerpt'] = wp_kses_post( (string) $payload['excerpt'] );
	}

	$post_id = wp_insert_post( wp_slash( $post_data ), true );
	if ( is_wp_error( $post_id ) ) {
		return $post_id;
	}

	return get_post( $post_id );
}

/**
 * Update content (and optionally slug/excerpt/status) of an existing post.
 *
 * @param int   $post_id Post ID.
 * @param array $payload Fields to update.
 * @return WP_Post|WP_Error
 */
function svc_update_post( $post_id, $payload ) {
	$post = svc_get_post_or_error( $post_id );
	if ( is_wp_error( $post ) ) {
		return $post;
	}
	if ( ! current_user_can( 'edit_post', $post->ID ) ) {
		return svc_error( 'svc_cannot_edit', 'Authenticated user cannot edit this post.', 403 );
	}

	$post_data = array( 'ID' => $post->ID );

	if ( isset( $payload['content'] ) ) {
		$post_data['post_content'] = wp_kses_post( (string) $payload['content'] );
	}
	if ( isset( $payload['title'] ) ) {
		$post_data['post_title'] = sanitize_text_field( svc_string( $payload['title'] ) );
	}
	if ( isset( $payload['slug'] ) ) {
		$post_data['post_name'] = sanitize_title( svc_string( $payload['slug'] ) );
	}
	if ( isset( $payload['excerpt'] ) ) {
		$post_data['post_excerpt'] = wp_kses_post( (string) $payload['excerpt'] );
	}
	if ( isset( $payload['status'] ) ) {
		$status = svc_string( $payload['status'] );
		if ( ! in_array( $status, get_post_stati(), true ) ) {
			return svc_error( 'svc_invalid_status', sprintf( 'Unsupported post status: %s', $status ), 400 );
		}
		$post_data['post_status'] = $status;
	}

	$updated_id = wp_update_post( wp_slash( $post_data ), true );
	if ( is_wp_error( $updated_id ) ) {
		return $updated_id;
	}

	return get_post( $updated_id );
}

/**
 * Update the status of a post.
 *
 * @param int    $post_id Post ID.
 * @param string $status  Target status.
 * @return WP_Post|WP_Error
 */
function svc_update_post_status( $post_id, $status ) {
	return svc_update_post( $post_id, array( 'status' => $status ) );
}

/**
 * Extract internal links (same-site hrefs) from a post's content.
 *
 * @param int $post_id Post ID.
 * @return array
 */
function svc_internal_links( $post_id ) {
	$post = svc_get_post_or_error( $post_id );
	if ( is_wp_error( $post ) ) {
		return $post;
	}

	$home   = trailingslashit( get_home_url() );
	$links  = array();
	$titles = array();

	if ( preg_match_all( '/<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)<\/a>/is', $post->post_content, $matches, PREG_SET_ORDER ) ) {
		foreach ( $matches as $match ) {
			$url  = trim( html_entity_decode( $match[1], ENT_QUOTES, 'UTF-8' ) );
			$text = trim( wp_strip_all_tags( $match[2] ) );

			if ( '' === $url || 0 === strpos( $url, '#' ) ) {
				continue;
			}

			$internal = 0 === strpos( $url, $home )
				|| ( 0 === strpos( $url, '/' ) && 0 !== strpos( $url, '//' ) );

			if ( ! $internal ) {
				continue;
			}

			$full_url = $url;
			if ( 0 === strpos( $url, '/' ) ) {
				$full_url = rtrim( $home, '/' ) . $url;
			}

			$links[] = array(
				'url'  => esc_url_raw( $full_url ),
				'text' => mb_substr( $text, 0, 200 ),
				'hash' => hash( 'sha1', $full_url ),
			);
		}
	}

	// De-duplicate by URL, keep first occurrence.
	$seen = array();
	$unique = array();
	foreach ( $links as $link ) {
		if ( isset( $seen[ $link['hash'] ] ) ) {
			continue;
		}
		$seen[ $link['hash'] ] = true;
		$unique[] = $link;
	}

	return array(
		'post_id' => (int) $post_id,
		'total'   => count( $unique ),
		'links'   => $unique,
	);
}
