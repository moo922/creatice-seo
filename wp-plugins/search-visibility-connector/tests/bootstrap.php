<?php
/**
 * PHPUnit bootstrap for the WordPress test suite.
 *
 * Bootstraps the plugin within the WordPress core test suite (the one created
 * by `wp scaffold plugin-tests search-visibility-connector`). Requires the
 * WP_DEVELOP_DIR / WP_TESTS_DIR environment to point at a WordPress develop
 * checkout, e.g.:
 *
 *   WP_TESTS_DIR=/path/to/wordpress-develop/tests/phpunit ./vendor/bin/phpunit
 */

$_tests_dir = getenv( 'WP_TESTS_DIR' );

if ( ! $_tests_dir ) {
	$_tests_dir = rtrim( sys_get_temp_dir(), '/\\' ) . '/wordpress-tests-lib';
}

if ( ! file_exists( $_tests_dir . '/includes/functions.php' ) ) {
	echo "Could not find the WordPress test library.\n";
	echo "Set the WP_TESTS_DIR environment variable, or run: wp scaffold plugin-tests search-visibility-connector\n";
	exit( 1 );
}

// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_trigger_error
trigger_error( sprintf( 'Running against WordPress test library: %s', $_tests_dir ), E_USER_NOTICE );

// Boot the plugin.
function _manually_load_plugin() {
	require dirname( __DIR__ ) . '/search-visibility-connector.php';
}
tests_add_filter( 'muplugins_loaded', '_manually_load_plugin' );

// Start up the WP testing environment.
require $_tests_dir . '/includes/bootstrap.php';
