<?php
/**
 * Rank Math SEO metadata read/write. Only ever touches Rank Math meta keys;
 * Yoast is intentionally unsupported.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * True when Rank Math is active and its metadata functions are available.
 *
 * @return bool
 */
function svc_rank_math_active() {
	$detection = svc_rank_math_detection();
	return $detection['detected'];
}

/**
 * Read the full Rank Math metadata for a post.
 *
 * @param int $post_id Post ID.
 * @return array
 */
function svc_rank_math_read( $post_id ) {
	$post_id   = (int) $post_id;
	$available = svc_rank_math_active();

	$data = array(
		'available'      => $available,
		'title'          => '',
		'description'    => '',
		'canonical'      => '',
		'robots'         => array(),
		'focus_keywords' => '',
		'schema'         => null,
	);

	if ( ! $available ) {
		return $data;
	}

	$data['title']          = (string) get_post_meta( $post_id, 'rank_math_title', true );
	$data['description']    = (string) get_post_meta( $post_id, 'rank_math_description', true );
	$data['canonical']      = (string) get_post_meta( $post_id, 'rank_math_canonical_url', true );
	$data['focus_keywords'] = (string) get_post_meta( $post_id, 'rank_math_focus_keyword', true );

	$robots = get_post_meta( $post_id, 'rank_math_robots', true );
	$data['robots'] = is_array( $robots ) ? array_values( array_filter( $robots, 'is_string' ) ) : array();

	$data['schema'] = svc_rank_math_read_schema( $post_id );

	return $data;
}

/**
 * Write Rank Math metadata. Only whitelisted keys are accepted; unknown keys
 * are ignored so a platform bug can never clobber unrelated post meta.
 *
 * @param int   $post_id Post ID.
 * @param array $payload Fields: title, description, canonical, robots,
 *                       focus_keywords, schema.
 * @return array|WP_Error
 */
function svc_rank_math_write( $post_id, $payload ) {
	if ( ! svc_rank_math_active() ) {
		return svc_error( 'svc_rank_math_not_active', 'Rank Math is not active on this site.', 409 );
	}

	$post_id = (int) $post_id;
	$updated = array();

	if ( array_key_exists( 'title', $payload ) ) {
		update_post_meta( $post_id, 'rank_math_title', sanitize_text_field( svc_string( $payload['title'] ) ) );
		$updated[] = 'title';
	}

	if ( array_key_exists( 'description', $payload ) ) {
		update_post_meta( $post_id, 'rank_math_description', sanitize_textarea_field( svc_string( $payload['description'] ) ) );
		$updated[] = 'description';
	}

	if ( array_key_exists( 'canonical', $payload ) ) {
		$canonical = esc_url_raw( svc_string( $payload['canonical'] ) );
		if ( '' !== $canonical && ! preg_match( '/^https?:\/\//i', $canonical ) ) {
			return svc_error( 'svc_invalid_canonical', 'canonical must be an absolute http(s) URL.', 400 );
		}
		update_post_meta( $post_id, 'rank_math_canonical_url', $canonical );
		$updated[] = 'canonical';
	}

	if ( array_key_exists( 'robots', $payload ) ) {
		$robots = svc_sanitize_robots( $payload['robots'] );
		if ( is_wp_error( $robots ) ) {
			return $robots;
		}
		update_post_meta( $post_id, 'rank_math_robots', $robots );
		$updated[] = 'robots';
	}

	if ( array_key_exists( 'focus_keywords', $payload ) ) {
		update_post_meta( $post_id, 'rank_math_focus_keyword', sanitize_text_field( svc_string( $payload['focus_keywords'] ) ) );
		$updated[] = 'focus_keywords';
	}

	if ( array_key_exists( 'schema', $payload ) ) {
		$schema_result = svc_rank_math_write_schema( $post_id, $payload['schema'] );
		if ( is_wp_error( $schema_result ) ) {
			return $schema_result;
		}
		$updated[] = 'schema';
	}

	/**
	 * Fires after Rank Math metadata is written via the connector.
	 *
	 * @param int   $post_id Post ID.
	 * @param array $payload Raw payload that was applied.
	 */
	do_action( 'svc_rank_math_written', $post_id, $payload );

	return array(
		'updated'   => $updated,
		'post_id'   => $post_id,
		'seo'       => svc_rank_math_read( $post_id ),
	);
}

/**
 * Read Rank Math schema metadata for a post.
 *
 * Schema is the most version-variant surface of Rank Math, so it is exposed
 * as an opaque "type + per-type values" structure that survives upgrades.
 *
 * @param int $post_id Post ID.
 * @return array|null null when Rank Math is not active.
 */
function svc_rank_math_read_schema( $post_id ) {
	if ( ! svc_rank_math_active() ) {
		return null;
	}

	$type   = get_post_meta( $post_id, 'rank_math_schema_type', true );
	$schemas = array();
	$meta    = get_post_meta( $post_id );

	foreach ( $meta as $key => $values ) {
		if ( 0 !== strpos( $key, 'rank_math_schema_' ) ) {
			continue;
		}
		foreach ( (array) $values as $value ) {
			$decoded = json_decode( (string) $value, true );
			$schemas[ substr( $key, strlen( 'rank_math_schema_' ) ) ] = ( null !== $decoded ) ? $decoded : $value;
		}
	}

	return array(
		'type'    => $type ? (string) $type : '',
		'schemas' => $schemas,
	);
}

/**
 * Write Rank Math schema metadata.
 *
 * Accepts either a bare array under the default key or a {"type", "schemas"}
 * object. Values are JSON-encoded before storage, mirroring Rank Math.
 *
 * @param int   $post_id Post ID.
 * @param mixed $value   Schema payload.
 * @return bool|WP_Error
 */
function svc_rank_math_write_schema( $post_id, $value ) {
	if ( ! is_array( $value ) ) {
		return svc_error( 'svc_invalid_schema', 'schema must be an object.', 400 );
	}

	$default_type = array_key_exists( 'type', $value ) ? sanitize_key( (string) $value['type'] ) : '';
	$schemas      = array_key_exists( 'schemas', $value ) && is_array( $value['schemas'] ) ? $value['schemas'] : $value;

	if ( isset( $value['type'] ) && isset( $value['schemas'] ) ) {
		update_post_meta( $post_id, 'rank_math_schema_type', $default_type );
	}

	foreach ( $schemas as $key => $schema_value ) {
		$key = sanitize_key( (string) $key );
		if ( '' === $key ) {
			continue;
		}
		if ( null === $schema_value ) {
			delete_post_meta( $post_id, 'rank_math_schema_' . $key );
			continue;
		}
		$encoded = is_string( $schema_value ) ? $schema_value : wp_json_encode( $schema_value );
		update_post_meta( $post_id, 'rank_math_schema_' . $key, $encoded );
	}

	return true;
}
