<?php
/**
 * Elementor widget: per-engine visibility bars.
 *
 * @package RankLogicSuperTool
 */

defined( 'ABSPATH' ) || exit;

class RLST_Widget_Engine_Breakdown extends RLST_Widget_Base {

	public function get_name() {
		return 'rlst_engine_breakdown';
	}

	public function get_title() {
		return __( 'Engine Breakdown', 'rank-logic-supertool' );
	}

	public function get_icon() {
		return 'eicon-bar-chart';
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
				'default' => __( 'Visibility by answer engine', 'rank-logic-supertool' ),
			)
		);

		$this->add_control(
			'use_engine_colors',
			array(
				'label'        => __( 'Use each engine’s brand colour', 'rank-logic-supertool' ),
				'type'         => \Elementor\Controls_Manager::SWITCHER,
				'default'      => 'yes',
				'return_value' => 'yes',
			)
		);

		$this->add_control(
			'show_rates',
			array(
				'label'        => __( 'Show mention & citation rates', 'rank-logic-supertool' ),
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
			'bar_color',
			array(
				'label'     => __( 'Bar colour (when not using engine colours)', 'rank-logic-supertool' ),
				'type'      => \Elementor\Controls_Manager::COLOR,
				'default'   => '#1466D8',
			)
		);

		$this->add_control(
			'track_color',
			array(
				'label'     => __( 'Track colour', 'rank-logic-supertool' ),
				'type'      => \Elementor\Controls_Manager::COLOR,
				'default'   => '#E3E8EF',
				'selectors' => array( '{{WRAPPER}} .rlst-bar-track' => 'background: {{VALUE}};' ),
			)
		);

		$this->add_responsive_control(
			'bar_height',
			array(
				'label'      => __( 'Bar height', 'rank-logic-supertool' ),
				'type'       => \Elementor\Controls_Manager::SLIDER,
				'size_units' => array( 'px' ),
				'range'      => array( 'px' => array( 'min' => 4, 'max' => 28 ) ),
				'default'    => array( 'unit' => 'px', 'size' => 8 ),
				'selectors'  => array(
					'{{WRAPPER}} .rlst-bar-track' => 'height: {{SIZE}}{{UNIT}};',
					'{{WRAPPER}} .rlst-bar-fill'  => 'height: {{SIZE}}{{UNIT}};',
				),
			)
		);

		$this->end_controls_section();
	}

	protected function render() {
		$data = $this->get_visibility();
		if ( null === $data || empty( $data['engines'] ) ) {
			return;
		}

		$settings   = $this->get_settings_for_display();
		$use_colors = 'yes' === $settings['use_engine_colors'];
		$fallback   = ! empty( $settings['bar_color'] ) ? $settings['bar_color'] : '#1466D8';
		?>
		<div class="rlst-engines">
			<?php if ( ! empty( $settings['heading'] ) ) : ?>
				<p class="rlst-engines-heading" style="margin:0 0 1em;font-weight:700;">
					<?php echo esc_html( $settings['heading'] ); ?>
				</p>
			<?php endif; ?>

			<ul style="list-style:none;margin:0;padding:0;display:grid;gap:1em;">
				<?php foreach ( $data['engines'] as $engine ) : ?>
					<?php
					$score = max( 0, min( 100, (int) $engine['score'] ) );
					$color = $use_colors && ! empty( $engine['color'] ) ? $engine['color'] : $fallback;
					?>
					<li>
						<div style="display:flex;justify-content:space-between;gap:1em;font-size:.9em;">
							<span style="font-weight:600;">
								<span
									aria-hidden="true"
									style="display:inline-block;width:.6em;height:.6em;border-radius:50%;margin-right:.5em;background:<?php echo esc_attr( $color ); ?>;"
								></span>
								<?php echo esc_html( $engine['name'] ); ?>
							</span>
							<span style="font-variant-numeric:tabular-nums;font-weight:700;">
								<?php echo esc_html( (string) $score ); ?>
							</span>
						</div>
						<div class="rlst-bar-track" style="margin-top:.45em;border-radius:999px;overflow:hidden;background:#E3E8EF;">
							<div
								class="rlst-bar-fill"
								role="img"
								aria-label="<?php echo esc_attr( sprintf( '%1$s: %2$d out of 100', $engine['name'], $score ) ); ?>"
								style="width:<?php echo esc_attr( max( 2, $score ) ); ?>%;border-radius:999px;background:<?php echo esc_attr( $color ); ?>;"
							></div>
						</div>
						<?php if ( 'yes' === $settings['show_rates'] ) : ?>
							<p style="margin:.4em 0 0;font-size:.78em;opacity:.75;">
								<?php
								printf(
									/* translators: 1: mention rate, 2: citation rate. */
									esc_html__( 'Named in %1$s · cited in %2$s', 'rank-logic-supertool' ),
									esc_html( round( $engine['mentionRate'] * 100 ) . '%' ),
									esc_html( round( $engine['citationRate'] * 100 ) . '%' )
								);
								?>
							</p>
						<?php endif; ?>
					</li>
				<?php endforeach; ?>
			</ul>
		</div>
		<?php
	}
}
