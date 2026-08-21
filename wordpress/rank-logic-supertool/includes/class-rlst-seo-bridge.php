<?php
/**
 * Writes SEO metadata through whichever SEO plugin is already installed.
 *
 * The deliberate choice here is to defer: if Yoast or Rank Math is active we
 * write into their post meta and let them render the tags. Only when neither
 * is present do we output our own, so we never produce duplicate tags or
 * fight an existing configuration.
 *
 * @package RankLogicSuperTool
 */

defined( 'ABSPATH' ) || exit;

class RLST_SEO_Bridge {

	private static $instance = null;

	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'wp_head', array( $this, 'maybe_output_fallback_meta' ), 2 );
	}

	/** @return bool True when Yoast SEO is active. */
	public static function has_yoast() {
		return defined( 'WPSEO_VERSION' ) || class_exists( 'WPSEO_Options' );
	}

	/** @return bool True when Rank Math is active. */
	public static function has_rank_math() {
		return class_exists( 'RankMath' ) || defined( 'RANK_MATH_VERSION' );
	}

	/** @return string Human-readable label for the admin screen. */
	public static function active_plugin_label() {
		if ( self::has_yoast() ) {
			return __( 'Yoast SEO (SuperTool writes through it)', 'rank-logic-supertool' );
		}
		if ( self::has_rank_math() ) {
			return __( 'Rank Math (SuperTool writes through it)', 'rank-logic-supertool' );
		}
		return __( 'None detected — SuperTool outputs its own meta tags', 'rank-logic-supertool' );
	}

	/**
	 * Stores the SEO title and description for a post.
	 *
	 * @param int    $post_id     Post ID.
	 * @param string $title       Meta title.
	 * @param string $description Meta description.
	 * @param string $keyword     Focus keyword.
	 * @return string Which system the values were written to.
	 */
	public static function write( $post_id, $title, $description, $keyword = '' ) {
		$post_id     = (int) $post_id;
		$title       = sanitize_text_field( $title );
		$description = sanitize_text_field( $description );
		$keyword     = sanitize_text_field( $keyword );

		if ( self::has_yoast() ) {
			update_post_meta( $post_id, '_yoast_wpseo_title', $title );
			update_post_meta( $post_id, '_yoast_wpseo_metadesc', $description );
			if ( $keyword ) {
				update_post_meta( $post_id, '_yoast_wpseo_focuskw', $keyword );
			}
			return 'yoast';
		}

		if ( self::has_rank_math() ) {
			update_post_meta( $post_id, 'rank_math_title', $title );
			update_post_meta( $post_id, 'rank_math_description', $description );
			if ( $keyword ) {
				update_post_meta( $post_id, 'rank_math_focus_keyword', $keyword );
			}
			return 'rank-math';
		}

		// No SEO plugin: keep the values ourselves and render them in wp_head.
		update_post_meta( $post_id, '_rlst_meta_title', $title );
		update_post_meta( $post_id, '_rlst_meta_description', $description );
		return 'supertool';
	}

	/**
	 * Outputs meta tags only when no other SEO plugin is handling them.
	 * Running at wp_head priority 2 keeps us ahead of most theme output.
	 */
	public function maybe_output_fallback_meta() {
		if ( self::has_yoast() || self::has_rank_math() ) {
			return;
		}
		if ( ! is_singular() ) {
			return;
		}

		$post_id     = get_queried_object_id();
		$description = get_post_meta( $post_id, '_rlst_meta_description', true );
		if ( ! $description ) {
			return;
		}

		printf(
			"<meta name=\"description\" content=\"%s\" />\n",
			esc_attr( $description )
		);
		printf(
			"<meta property=\"og:description\" content=\"%s\" />\n",
			esc_attr( $description )
		);
	}
}
