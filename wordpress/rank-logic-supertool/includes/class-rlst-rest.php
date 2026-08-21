<?php
/**
 * The site's own REST routes.
 *
 * The browser talks to these; only the server talks to SuperTool. That keeps
 * the project key server-side, where it belongs.
 *
 * @package RankLogicSuperTool
 */

defined( 'ABSPATH' ) || exit;

class RLST_REST {

	private static $instance = null;

	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	public function register_routes() {
		register_rest_route(
			'rank-logic-supertool/v1',
			'/track',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'track' ),
				// Public by design: this records anonymous front-end visits.
				'permission_callback' => '__return_true',
				'args'                => array(
					'engine'     => array( 'type' => 'string', 'required' => false ),
					'referrer'   => array( 'type' => 'string', 'required' => false ),
					'landingUrl' => array( 'type' => 'string', 'required' => false ),
				),
			)
		);

		register_rest_route(
			'rank-logic-supertool/v1',
			'/visibility',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'visibility' ),
				'permission_callback' => function () {
					return current_user_can( 'edit_posts' );
				},
			)
		);
	}

	/**
	 * Forwards an answer-engine referral to SuperTool.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public function track( $request ) {
		$referrer = esc_url_raw( (string) $request->get_param( 'referrer' ) );
		$engine   = RLST_Attribution::detect_engine( $referrer );

		// The server re-derives the engine from the referrer, so a forged
		// "engine" field in the request body cannot invent a channel.
		if ( ! $engine ) {
			return new WP_REST_Response( array( 'ok' => true, 'tracked' => false ), 200 );
		}

		$result = RLST_Api_Client::request(
			'POST',
			'/api/v1/wordpress/lead',
			array(
				'engine'     => $engine,
				'referrer'   => $referrer,
				'landingUrl' => esc_url_raw( (string) $request->get_param( 'landingUrl' ) ),
			)
		);

		if ( is_wp_error( $result ) ) {
			// Never surface an upstream failure to the visitor's browser.
			return new WP_REST_Response( array( 'ok' => true, 'tracked' => false ), 200 );
		}

		return new WP_REST_Response( array( 'ok' => true, 'tracked' => true ), 200 );
	}

	/**
	 * Visibility figures for logged-in editors (used by the block editor panel).
	 *
	 * @return WP_REST_Response
	 */
	public function visibility() {
		$data = RLST_Api_Client::visibility();
		if ( is_wp_error( $data ) ) {
			return new WP_REST_Response( array( 'error' => $data->get_error_message() ), 502 );
		}
		return new WP_REST_Response( $data, 200 );
	}
}
