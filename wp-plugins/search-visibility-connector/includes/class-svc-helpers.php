<?php
/**
 * Shared helpers: capability checks, sanitisation, and pure utilities.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Capability required to use the connector.
 *
 * Filterable so operators can scope access to a dedicated role/app-password
 * user instead of giving away manage_options.
 *
 * @return string
 */
function svc_required_capability() {
	return apply_filters( 'svc_required_capability', 'manage_options' );
}

/**
 * True when the current request is authenticated as a user with the required
 * capability. Application Passwords authenticate via Basic auth; logged-in
 * admins via cookies work too.
 *
 * @return bool
 */
function svc_user_is_authorized() {
	if ( ! is_user_logged_in() ) {
		return false;
	}
	return current_user_can( svc_required_capability() );
}

/**
 * Ability flags reported to the platform so onboarding can validate that the
 * authenticated user can actually read and write content.
 *
 * @return array
 */
function svc_user_abilities() {
	if ( ! svc_user_is_authorized() ) {
		return array(
			'authenticated'  => false,
			'can_read'       => false,
			'can_write'      => false,
			'can_manage'     => false,
			'capability'     => svc_required_capability(),
			'display_name'   => '',
			'user_email'     => '',
		);
	}

	$user = wp_get_current_user();

	return array(
		'authenticated'  => true,
		'can_read'       => current_user_can( 'read' ),
		'can_write'      => current_user_can( 'edit_posts' ),
		'can_manage'     => current_user_can( svc_required_capability() ),
		'capability'     => svc_required_capability(),
		'display_name'   => $user->display_name,
		'user_email'     => $user->user_email,
	);
}

/**
 * Normalise an arbitrary value into a trimmed string, or '' when not a string.
 *
 * @param mixed $value Raw value.
 * @return string
 */
function svc_string( $value ) {
	if ( is_string( $value ) ) {
		return trim( $value );
	}
	if ( is_numeric( $value ) ) {
		return trim( (string) $value );
	}
	return '';
}

/**
 * Strict boolean coercion for "1" / "true" / 1 / true.
 *
 * @param mixed $value Raw value.
 * @return bool
 */
function svc_bool( $value ) {
	if ( is_bool( $value ) ) {
		return $value;
	}
	if ( is_string( $value ) ) {
		return in_array( strtolower( $value ), array( '1', 'true', 'yes' ), true );
	}
	return (int) $value === 1;
}

/**
 * SHA-1 content hash used by the platform to detect content changes without
 * transferring the full body.
 *
 * @param string $content Raw post content.
 * @return string
 */
function svc_content_hash( $content ) {
	return hash( 'sha1', (string) $content );
}

/**
 * Validate a REST request argument that must be a positive integer.
 *
 * @param mixed $value Candidate value.
 * @return bool
 */
function svc_is_positive_int( $value ) {
	return is_numeric( $value ) && (int) $value > 0;
}

/**
 * Coerce a post-type filter (comma separated) into a validated array of
 * existing public post types. Falls back to post/page when empty.
 *
 * @param mixed $value Raw value.
 * @return array
 */
function svc_public_post_types( $value = null ) {
	$public_types = get_post_types( array( 'public' => true ), 'objects' );
	$names        = array_keys( $public_types );

	if ( svc_string( $value ) !== '' ) {
		$wanted = array();
		foreach ( explode( ',', svc_string( $value ) ) as $type ) {
			$type = sanitize_key( trim( $type ) );
			if ( in_array( $type, $names, true ) ) {
				$wanted[] = $type;
			}
		}
		if ( ! empty( $wanted ) ) {
			return $wanted;
		}
	}

	return array( 'post', 'page' );
}

/**
 * Allowed values for Rank Math robots rules.
 *
 * @return array
 */
function svc_allowed_robots_rules() {
	return array(
		'index',
		'noindex',
		'nofollow',
		'noarchive',
		'noimageindex',
		'nosnippet',
		'notranslate',
		'max-snippet',
		'max-image-preview',
		'max-video-preview',
	);
}

/**
 * Validate and sanitise a robots array for Rank Math.
 *
 * @param mixed $value Raw value.
 * @return WP_Error|array Sanitised rules or WP_Error on invalid input.
 */
function svc_sanitize_robots( $value ) {
	if ( ! is_array( $value ) ) {
		return new WP_Error( 'svc_invalid_robots', 'robots must be an array of rule strings.', array( 'status' => 400 ) );
	}
	$allowed = svc_allowed_robots_rules();
	$clean   = array();
	foreach ( $value as $rule ) {
		$rule = sanitize_key( (string) $rule );
		if ( '' === $rule ) {
			continue;
		}
		if ( ! in_array( $rule, $allowed, true ) ) {
			return new WP_Error( 'svc_invalid_robots', sprintf( 'Unsupported robots rule: %s', $rule ), array( 'status' => 400 ) );
		}
		$clean[] = $rule;
	}
	return array_values( array_unique( $clean ) );
}

/**
 * Build a normalized WP_Error for common failures.
 *
 * @param string $code   Error code.
 * @param string $message Human readable message.
 * @param int    $status HTTP status.
 * @return WP_Error
 */
function svc_error( $code, $message, $status = 400 ) {
	return new WP_Error( $code, $message, array( 'status' => $status ) );
}

/**
 * Locate a post by ID and return it, or a WP_Error when it does not exist.
 *
 * @param int $post_id Post ID.
 * @return WP_Post|WP_Error
 */
function svc_get_post_or_error( $post_id ) {
	$post = get_post( (int) $post_id );
	if ( ! $post ) {
		return svc_error( 'svc_post_not_found', 'Post not found.', 404 );
	}
	$type = get_post_type_object( $post->post_type );
	if ( ! $type || empty( $type->public ) ) {
		return svc_error( 'svc_post_type_not_public', 'Post type is not public and cannot be managed via the connector.', 403 );
	}
	return $post;
}
