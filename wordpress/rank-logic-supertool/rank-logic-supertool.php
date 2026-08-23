<?php
/**
 * Plugin Name:       Rank Logic SuperTool
 * Plugin URI:        https://ranklogicsupertool.com/docs/wordpress
 * Description:       Connects your site to Rank Logic SuperTool: one-click publishing with schema, AI-referral attribution, and Elementor widgets showing live answer-engine visibility.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Rank Logic
 * Author URI:        https://ranklogicsupertool.com
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       rank-logic-supertool
 *
 * Design notes:
 * - Adds no front-end CSS and enqueues no libraries.
 * - Writes SEO fields through Yoast or Rank Math when present rather than
 *   replacing them, so the site's existing SEO configuration stays authoritative.
 * - The attribution snippet sets no cookies. It does send the full document
 * referrer, which can contain query parameters, so it is not claimed to be
 * free of personal data.
 */

defined( 'ABSPATH' ) || exit;

define( 'RLST_VERSION', '1.0.0' );
define( 'RLST_FILE', __FILE__ );
define( 'RLST_PATH', plugin_dir_path( __FILE__ ) );
define( 'RLST_URL', plugin_dir_url( __FILE__ ) );
define( 'RLST_OPTION', 'rlst_settings' );

require_once RLST_PATH . 'includes/class-rlst-api-client.php';
require_once RLST_PATH . 'includes/class-rlst-settings.php';
require_once RLST_PATH . 'includes/class-rlst-seo-bridge.php';
require_once RLST_PATH . 'includes/class-rlst-schema.php';
require_once RLST_PATH . 'includes/class-rlst-attribution.php';
require_once RLST_PATH . 'includes/class-rlst-rest.php';
require_once RLST_PATH . 'includes/class-rlst-elementor.php';

/**
 * Returns a plugin setting, falling back to $default.
 *
 * @param string $key     Setting key.
 * @param mixed  $default Value to return when unset.
 * @return mixed
 */
function rlst_option( $key, $default = '' ) {
	$settings = get_option( RLST_OPTION, array() );
	return isset( $settings[ $key ] ) && '' !== $settings[ $key ] ? $settings[ $key ] : $default;
}

/**
 * Boots the plugin once all other plugins have loaded, so Yoast, Rank Math
 * and Elementor can all be detected reliably.
 */
function rlst_bootstrap() {
	RLST_Settings::instance();
	RLST_SEO_Bridge::instance();
	RLST_Schema::instance();
	RLST_Attribution::instance();
	RLST_REST::instance();
	RLST_Elementor::instance();
}
add_action( 'plugins_loaded', 'rlst_bootstrap' );

/**
 * Stores default settings on activation. Never overwrites an existing config,
 * so deactivate/reactivate does not wipe a working connection.
 */
function rlst_activate() {
	if ( false === get_option( RLST_OPTION ) ) {
		add_option(
			RLST_OPTION,
			array(
				'api_key'      => '',
				'api_base'     => 'https://ranklogicsupertool.com',
				'attribution'  => 1,
				'schema'       => 1,
				'project_name' => '',
			)
		);
	}
}
register_activation_hook( __FILE__, 'rlst_activate' );

/** Clears cached API responses on deactivation. */
function rlst_deactivate() {
	RLST_Api_Client::flush_cache();
}
register_deactivation_hook( __FILE__, 'rlst_deactivate' );
