<?php
/**
 * Elementor integration.
 *
 * Registers a "Rank Logic" widget category and three widgets. Works with free
 * Elementor — nothing here requires Pro. Widgets inherit theme typography and
 * expose colour controls rather than shipping their own design system.
 *
 * @package RankLogicSuperTool
 */

defined( 'ABSPATH' ) || exit;

class RLST_Elementor {

	private static $instance = null;

	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		if ( ! did_action( 'elementor/loaded' ) ) {
			return;
		}

		add_action( 'elementor/elements/categories_registered', array( $this, 'register_category' ) );
		add_action( 'elementor/widgets/register', array( $this, 'register_widgets' ) );
	}

	/**
	 * Adds the plugin's own widget category.
	 *
	 * @param \Elementor\Elements_Manager $manager Elements manager.
	 */
	public function register_category( $manager ) {
		$manager->add_category(
			'rank-logic',
			array(
				'title' => __( 'Rank Logic', 'rank-logic-supertool' ),
				'icon'  => 'eicon-chart-line',
			)
		);
	}

	/**
	 * Registers each widget class.
	 *
	 * @param \Elementor\Widgets_Manager $manager Widgets manager.
	 */
	public function register_widgets( $manager ) {
		require_once RLST_PATH . 'widgets/class-rlst-widget-base.php';
		require_once RLST_PATH . 'widgets/class-rlst-widget-visibility-score.php';
		require_once RLST_PATH . 'widgets/class-rlst-widget-engine-breakdown.php';
		require_once RLST_PATH . 'widgets/class-rlst-widget-citation-feed.php';

		$manager->register( new RLST_Widget_Visibility_Score() );
		$manager->register( new RLST_Widget_Engine_Breakdown() );
		$manager->register( new RLST_Widget_Citation_Feed() );
	}
}
