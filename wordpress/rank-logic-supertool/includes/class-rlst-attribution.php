<?php
/**
 * AI referral attribution.
 *
 * Detects visits arriving from an answer engine and reports them to SuperTool.
 * Sets no cookies and collects no personal data: only the referrer signature,
 * the landing path, and nothing else.
 *
 * @package RankLogicSuperTool
 */

defined( 'ABSPATH' ) || exit;

class RLST_Attribution {

	private static $instance = null;

	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue' ) );
	}

	/** Registers the tiny front-end snippet when attribution is enabled. */
	public function enqueue() {
		if ( ! rlst_option( 'attribution', 1 ) || ! rlst_option( 'api_key' ) || is_admin() ) {
			return;
		}

		wp_enqueue_script(
			'rlst-attribution',
			RLST_URL . 'assets/attribution.js',
			array(),
			RLST_VERSION,
			true
		);

		wp_localize_script(
			'rlst-attribution',
			'RLST_ATTR',
			array(
				// The browser posts to our own REST route, never straight to
				// SuperTool, so the project key never reaches the client.
				'endpoint' => esc_url_raw( rest_url( 'rank-logic-supertool/v1/track' ) ),
				'nonce'    => wp_create_nonce( 'wp_rest' ),
			)
		);
	}

	/**
	 * Maps a referrer to an answer-engine id.
	 *
	 * @param string $referrer Full referrer URL.
	 * @return string Engine id, or '' when it is not an answer engine.
	 */
	public static function detect_engine( $referrer ) {
		$map = array(
			'chatgpt'        => '#(chat\.openai\.com|chatgpt\.com)#i',
			'perplexity'     => '#perplexity\.ai#i',
			'claude'         => '#(claude\.ai|anthropic\.com)#i',
			'gemini'         => '#(gemini\.google\.com|bard\.google\.com)#i',
			'grok'           => '#(grok\.com|x\.ai)#i',
			'google-ai-mode' => '#google\.[a-z.]+/(search\?.*udm=50|aimode)#i',
		);

		foreach ( $map as $engine => $pattern ) {
			if ( preg_match( $pattern, $referrer ) ) {
				return $engine;
			}
		}

		return '';
	}
}
