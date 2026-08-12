<?php
/**
 * Site information, plugin detection, and Rank Math detection.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Snapshot of the WordPress site for the platform's onboarding.
 *
 * @return array
 */
function svc_site_info() {
	global $wp_version;

	return array(
		'name'            => get_bloginfo( 'name' ),
		'description'     => get_bloginfo( 'description' ),
		'url'             => get_site_url(),
		'home_url'        => get_home_url(),
		'locale'          => get_locale(),
		'language'        => get_bloginfo( 'language' ),
		'wp_version'      => $wp_version,
		'php_version'     => PHP_VERSION,
		'environment'     => wp_get_environment_type(),
		'timezone'        => wp_timezone_string(),
		'multisite'       => is_multisite(),
		'admin_email'     => get_option( 'admin_email' ),
		'active_plugins'  => count( get_option( 'active_plugins', array() ) ),
		'connector'       => array(
			'name'    => 'search-visibility-connector',
			'version' => SVC_PLUGIN_VERSION,
			'namespace' => SVC_REST_NAMESPACE,
		),
	);
}

/**
 * List of active plugins with enough detail for the platform to detect and
 * version the installed SEO stack. Rank Math ships in this list too.
 *
 * @return array
 */
function svc_active_plugins() {
	if ( ! function_exists( 'get_plugins' ) ) {
		require_once ABSPATH . 'wp-admin/includes/plugin.php';
	}

	$active  = get_option( 'active_plugins', array() );
	$plugins = get_plugins();

	$result = array();
	foreach ( $active as $plugin_file ) {
		$data = isset( $plugins[ $plugin_file ] ) ? $plugins[ $plugin_file ] : null;
		if ( ! $data ) {
			continue;
		}
		$slug = dirname( $plugin_file );
		$result[] = array(
			'file'       => $plugin_file,
			'slug'       => ( '.' === $slug ) ? basename( $plugin_file, '.php' ) : $slug,
			'name'       => $data['Name'],
			'version'    => $data['Version'],
			'active'     => true,
		);
	}
	usort( $result, static function ( $a, $b ) {
		return strcmp( strtolower( $a['slug'] ), strtolower( $b['slug'] ) );
	} );
	return $result;
}

/**
 * Detect Rank Math: is the plugin active, and which version is installed.
 *
 * @return array
 */
function svc_rank_math_detection() {
	$detected = false;
	$version  = null;

	if ( defined( 'RANK_MATH_VERSION' ) ) {
		$detected = true;
		$version  = RANK_MATH_VERSION;
	} else {
		foreach ( svc_active_plugins() as $plugin ) {
			if ( 'rank-math' === $plugin['slug'] ) {
				$detected = true;
				$version  = $plugin['version'];
				break;
			}
		}
	}

	// Some Rank Math builds expose the version helper without the constant.
	if ( $detected && null === $version && class_exists( 'RankMath\\Helper' ) && method_exists( 'RankMath\\Helper', 'get_version' ) ) {
		$version = \RankMath\Helper::get_version();
	}

	return array(
		'detected'  => $detected,
		'version'   => $detected ? $version : null,
		'meta_keys' => $detected
			? array(
				'title'            => 'rank_math_title',
				'description'      => 'rank_math_description',
				'canonical'        => 'rank_math_canonical_url',
				'robots'           => 'rank_math_robots',
				'focus_keywords'   => 'rank_math_focus_keyword',
				'schema_type'      => 'rank_math_schema_type',
			)
			: array(),
	);
}

/**
 * Public post types (including custom) with REST-relevant metadata.
 *
 * @return array
 */
function svc_public_post_types_info() {
	$types = get_post_types( array( 'public' => true ), 'objects' );

	$result = array();
	foreach ( $types as $type ) {
		$supports = get_all_post_type_supports( $type->name );
		$result[] = array(
			'name'         => $type->name,
			'label'        => $type->label,
			'rest_base'    => $type->rest_base,
			'rest_controller' => $type->rest_controller_class,
			'public'       => (bool) $type->public,
			'hierarchical' => (bool) $type->hierarchical,
			'supports'     => is_array( $supports ) ? array_keys( $supports ) : array(),
		);
	}
	usort( $result, static function ( $a, $b ) {
		return strcmp( $a['name'], $b['name'] );
	} );
	return $result;
}
