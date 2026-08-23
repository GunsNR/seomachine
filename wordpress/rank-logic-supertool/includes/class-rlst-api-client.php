<?php
/**
 * Talks to the SuperTool API.
 *
 * Every response is cached in a transient so a page rendering three widgets
 * makes at most one request, and a slow or unreachable API degrades to stale
 * data rather than blocking the render.
 *
 * @package RankLogicSuperTool
 */

defined( 'ABSPATH' ) || exit;

class RLST_Api_Client {

	const CACHE_PREFIX = 'rlst_cache_';
	const CACHE_TTL    = 300;

	/** Cache keys this plugin creates, so they can be cleared together. */
	const CACHE_KEYS = array( 'visibility', 'citations' );

	/**
	 * Returns the configured API base URL without a trailing slash.
	 *
	 * @return string
	 */
	public static function base_url() {
		return untrailingslashit( rlst_option( 'api_base', 'https://ranklogicsupertool.com' ) );
	}

	/**
	 * Performs a request against the SuperTool API.
	 *
	 * @param string $method HTTP method.
	 * @param string $path   Path beginning with a slash.
	 * @param array  $body   Optional JSON body.
	 * @return array|WP_Error Decoded response array, or WP_Error on failure.
	 */
	public static function request( $method, $path, $body = null ) {
		$api_key = rlst_option( 'api_key' );
		if ( empty( $api_key ) ) {
			return new WP_Error( 'rlst_no_key', __( 'No SuperTool project key is configured.', 'rank-logic-supertool' ) );
		}

		$args = array(
			'method'  => $method,
			'timeout' => 15,
			'headers' => array(
				'Content-Type'    => 'application/json',
				'Accept'          => 'application/json',
				'X-SuperTool-Key' => $api_key,
				'User-Agent'      => 'RankLogicSuperTool-WP/' . RLST_VERSION . '; ' . home_url(),
			),
		);

		if ( null !== $body ) {
			$args['body'] = wp_json_encode( $body );
		}

		$response = wp_remote_request( self::base_url() . $path, $args );

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code    = (int) wp_remote_retrieve_response_code( $response );
		$decoded = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( $code < 200 || $code >= 300 ) {
			$message = is_array( $decoded ) && isset( $decoded['error'] )
				? $decoded['error']
				/* translators: %d: HTTP status code. */
				: sprintf( __( 'SuperTool returned HTTP %d.', 'rank-logic-supertool' ), $code );
			return new WP_Error( 'rlst_http_error', $message, array( 'status' => $code ) );
		}

		return is_array( $decoded ) ? $decoded : array();
	}

	/**
	 * GET with transient caching.
	 *
	 * @param string $key   Cache key suffix.
	 * @param string $path  API path.
	 * @param bool   $force Bypass the cache.
	 * @return array|WP_Error
	 */
	public static function get_cached( $key, $path, $force = false ) {
		$transient = self::CACHE_PREFIX . $key;

		if ( ! $force ) {
			$cached = get_transient( $transient );
			if ( false !== $cached ) {
				return $cached;
			}
		}

		$result = self::request( 'GET', $path );

		if ( is_wp_error( $result ) ) {
			// Serve stale data rather than an error box if we have any.
			$stale = get_option( $transient . '_stale' );
			return $stale ? $stale : $result;
		}

		set_transient( $transient, $result, self::CACHE_TTL );
		update_option( $transient . '_stale', $result, false );

		return $result;
	}

	/**
	 * Verifies the configured key and records the site URL.
	 *
	 * @return array|WP_Error
	 */
	public static function verify() {
		return self::request( 'POST', '/api/v1/wordpress/verify', array( 'siteUrl' => home_url() ) );
	}

	/**
	 * Current AI visibility figures for the connected project.
	 *
	 * @param bool $force Bypass the cache.
	 * @return array|WP_Error
	 */
	public static function visibility( $force = false ) {
		return self::get_cached( 'visibility', '/api/v1/wordpress/visibility', $force );
	}

	/**
	 * Recent citations for the connected project.
	 *
	 * @param int  $limit Maximum rows.
	 * @param bool $force Bypass the cache.
	 * @return array|WP_Error
	 */
	public static function citations( $limit = 10, $force = false ) {
		$limit = max( 1, min( 50, (int) $limit ) );
		return self::get_cached( 'citations', '/api/v1/wordpress/citations?limit=' . $limit, $force );
	}

	/** Deletes every cached response this plugin stores. */
	public static function flush_cache() {
		foreach ( self::CACHE_KEYS as $key ) {
			delete_transient( self::CACHE_PREFIX . $key );
		}
	}
}
