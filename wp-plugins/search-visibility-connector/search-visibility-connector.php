<?php
/**
 * Plugin Name:       Search Visibility Connector
 * Plugin URI:        https://github.com/creative-seo/search-visibility-connector
 * Description:       Authenticated REST endpoints for the Creative SEO platform. Enables health checks, site/plugin/Rank Math detection, post & content import, and Rank Math SEO metadata read/write. No Yoast support.
 * Version:           0.1.0
 * Requires at least: 5.6
 * Requires PHP:      7.2
 * Author:            Creative SEO
 * License:           GPL-2.0-or-later
 * Text Domain:       search-visibility-connector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'SVC_PLUGIN_VERSION', '0.1.0' );
define( 'SVC_PLUGIN_FILE', __FILE__ );
define( 'SVC_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'SVC_REST_NAMESPACE', 'search-visibility-connector/v1' );

require_once SVC_PLUGIN_DIR . 'includes/class-svc-helpers.php';
require_once SVC_PLUGIN_DIR . 'includes/class-svc-site.php';
require_once SVC_PLUGIN_DIR . 'includes/class-svc-seo.php';
require_once SVC_PLUGIN_DIR . 'includes/class-svc-posts.php';
require_once SVC_PLUGIN_DIR . 'includes/class-svc-rest-controller.php';

/**
 * Register the REST routes once the REST API is initialised.
 *
 * @return void
 */
function svc_register_rest_routes() {
	$controller = new SVC_Rest_Controller();
	$controller->register_routes();
}
add_action( 'rest_api_init', 'svc_register_rest_routes' );

/**
 * Deactivation handler: flushes permalinks so the REST namespace stays clean.
 *
 * @return void
 */
function svc_deactivate() {
	// Nothing persisted at plugin level; flush for safety.
	if ( function_exists( 'flush_rewrite_rules' ) ) {
		flush_rewrite_rules();
	}
}
register_deactivation_hook( __FILE__, 'svc_deactivate' );
