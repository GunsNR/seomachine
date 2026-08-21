<?php
/**
 * Shared behaviour for the SuperTool Elementor widgets.
 *
 * @package RankLogicSuperTool
 */

defined( 'ABSPATH' ) || exit;

abstract class RLST_Widget_Base extends \Elementor\Widget_Base {

	public function get_categories() {
		return array( 'rank-logic' );
	}

	public function get_keywords() {
		return array( 'seo', 'ai', 'visibility', 'chatgpt', 'rank logic', 'supertool' );
	}

	/** Widgets read live data, so they must not be cached in the page HTML. */
	public function get_script_depends() {
		return array();
	}

	/**
	 * Renders a friendly message in place of the widget.
	 *
	 * @param string $message Message to show.
	 */
	protected function render_notice( $message ) {
		printf(
			'<div class="rlst-widget-notice" style="padding:1rem 1.15rem;border:1px dashed currentColor;border-radius:.6rem;opacity:.75;font-size:.9em;">%s</div>',
			esc_html( $message )
		);
	}

	/**
	 * Fetches visibility data, or renders a notice and returns null.
	 *
	 * @return array|null
	 */
	protected function get_visibility() {
		if ( ! rlst_option( 'api_key' ) ) {
			$this->render_notice( __( 'Connect SuperTool in Settings → SuperTool to display live data.', 'rank-logic-supertool' ) );
			return null;
		}

		$data = RLST_Api_Client::visibility();

		if ( is_wp_error( $data ) ) {
			// In the editor, show why. On the front end, show nothing at all
			// rather than leaking an error to visitors.
			if ( \Elementor\Plugin::$instance->editor->is_edit_mode() ) {
				$this->render_notice( $data->get_error_message() );
			}
			return null;
		}

		return $data;
	}
}
