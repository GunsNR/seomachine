<?php
/**
 * Elementor widget: a live feed of answers that cited this site.
 *
 * @package RankLogicSuperTool
 */

defined( 'ABSPATH' ) || exit;

class RLST_Widget_Citation_Feed extends RLST_Widget_Base {

	public function get_name() {
		return 'rlst_citation_feed';
	}

	public function get_title() {
		return __( 'Citation Feed', 'rank-logic-supertool' );
	}

	public function get_icon() {
		return 'eicon-post-list';
	}

	protected function register_controls() {
		$this->start_controls_section(
			'content',
			array( 'label' => __( 'Content', 'rank-logic-supertool' ) )
		);

		$this->add_control(
			'heading',
			array(
				'label'   => __( 'Heading', 'rank-logic-supertool' ),
				'type'    => \Elementor\Controls_Manager::TEXT,
				'default' => __( 'Recently cited by AI', 'rank-logic-supertool' ),
			)
		);

		$this->add_control(
			'limit',
			array(
				'label'   => __( 'Number of citations', 'rank-logic-supertool' ),
				'type'    => \Elementor\Controls_Manager::NUMBER,
				'min'     => 1,
				'max'     => 20,
				'default' => 5,
			)
		);

		$this->add_control(
			'show_excerpt',
			array(
				'label'        => __( 'Show answer excerpt', 'rank-logic-supertool' ),
				'type'         => \Elementor\Controls_Manager::SWITCHER,
				'default'      => 'yes',
				'return_value' => 'yes',
			)
		);

		$this->end_controls_section();

		$this->start_controls_section(
			'style',
			array(
				'label' => __( 'Style', 'rank-logic-supertool' ),
				'tab'   => \Elementor\Controls_Manager::TAB_STYLE,
			)
		);

		$this->add_control(
			'card_bg',
			array(
				'label'     => __( 'Card background', 'rank-logic-supertool' ),
				'type'      => \Elementor\Controls_Manager::COLOR,
				'default'   => '#F6F9FD',
				'selectors' => array( '{{WRAPPER}} .rlst-citation' => 'background: {{VALUE}};' ),
			)
		);

		$this->add_control(
			'card_radius',
			array(
				'label'      => __( 'Card radius', 'rank-logic-supertool' ),
				'type'       => \Elementor\Controls_Manager::SLIDER,
				'size_units' => array( 'px' ),
				'range'      => array( 'px' => array( 'min' => 0, 'max' => 32 ) ),
				'default'    => array( 'unit' => 'px', 'size' => 12 ),
				'selectors'  => array( '{{WRAPPER}} .rlst-citation' => 'border-radius: {{SIZE}}{{UNIT}};' ),
			)
		);

		$this->end_controls_section();
	}

	protected function render() {
		if ( ! rlst_option( 'api_key' ) ) {
			$this->render_notice( __( 'Connect SuperTool in Settings → SuperTool to display live data.', 'rank-logic-supertool' ) );
			return;
		}

		$settings = $this->get_settings_for_display();
		$limit    = max( 1, min( 20, (int) $settings['limit'] ) );
		$data     = RLST_Api_Client::citations( $limit );

		if ( is_wp_error( $data ) ) {
			if ( \Elementor\Plugin::$instance->editor->is_edit_mode() ) {
				$this->render_notice( $data->get_error_message() );
			}
			return;
		}

		if ( empty( $data['citations'] ) ) {
			if ( \Elementor\Plugin::$instance->editor->is_edit_mode() ) {
				$this->render_notice( __( 'No citations recorded yet. They appear here once an answer engine cites one of your pages.', 'rank-logic-supertool' ) );
			}
			return;
		}
		?>
		<div class="rlst-citations">
			<?php if ( ! empty( $settings['heading'] ) ) : ?>
				<p class="rlst-citations-heading" style="margin:0 0 1em;font-weight:700;">
					<?php echo esc_html( $settings['heading'] ); ?>
				</p>
			<?php endif; ?>

			<ul style="list-style:none;margin:0;padding:0;display:grid;gap:.85em;">
				<?php foreach ( array_slice( $data['citations'], 0, $limit ) as $citation ) : ?>
					<li class="rlst-citation" style="padding:1em 1.1em;background:#F6F9FD;border-radius:12px;">
						<p style="margin:0 0 .35em;font-size:.72em;text-transform:uppercase;letter-spacing:.09em;opacity:.65;">
							<?php echo esc_html( $citation['engineName'] ); ?>
							<?php if ( ! empty( $citation['runAt'] ) ) : ?>
								·
								<time datetime="<?php echo esc_attr( $citation['runAt'] ); ?>">
									<?php echo esc_html( date_i18n( get_option( 'date_format' ), strtotime( $citation['runAt'] ) ) ); ?>
								</time>
							<?php endif; ?>
						</p>
						<p style="margin:0;font-weight:600;font-size:.95em;">
							<?php echo esc_html( $citation['prompt'] ); ?>
						</p>
						<?php if ( 'yes' === $settings['show_excerpt'] && ! empty( $citation['excerpt'] ) ) : ?>
							<p style="margin:.5em 0 0;font-size:.88em;opacity:.8;">
								<?php echo esc_html( wp_trim_words( $citation['excerpt'], 34, '…' ) ); ?>
							</p>
						<?php endif; ?>
						<?php if ( ! empty( $citation['citedUrl'] ) ) : ?>
							<p style="margin:.5em 0 0;font-size:.78em;">
								<a href="<?php echo esc_url( $citation['citedUrl'] ); ?>" rel="nofollow">
									<?php echo esc_html( wp_parse_url( $citation['citedUrl'], PHP_URL_PATH ) ); ?>
								</a>
							</p>
						<?php endif; ?>
					</li>
				<?php endforeach; ?>
			</ul>
		</div>
		<?php
	}
}
