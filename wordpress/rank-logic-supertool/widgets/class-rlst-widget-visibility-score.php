<?php
/**
 * Elementor widget: the headline AI visibility score.
 *
 * @package RankLogicSuperTool
 */

defined( 'ABSPATH' ) || exit;

class RLST_Widget_Visibility_Score extends RLST_Widget_Base {

	public function get_name() {
		return 'rlst_visibility_score';
	}

	public function get_title() {
		return __( 'AI Visibility Score', 'rank-logic-supertool' );
	}

	public function get_icon() {
		return 'eicon-number-field';
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
				'default' => __( 'AI Visibility Score', 'rank-logic-supertool' ),
			)
		);

		$this->add_control(
			'show_metrics',
			array(
				'label'        => __( 'Show mention & citation rates', 'rank-logic-supertool' ),
				'type'         => \Elementor\Controls_Manager::SWITCHER,
				'default'      => 'yes',
				'return_value' => 'yes',
			)
		);

		$this->add_control(
			'show_delta',
			array(
				'label'        => __( 'Show change since last run', 'rank-logic-supertool' ),
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
			'accent',
			array(
				'label'     => __( 'Accent colour', 'rank-logic-supertool' ),
				'type'      => \Elementor\Controls_Manager::COLOR,
				'default'   => '#1466D8',
				'selectors' => array( '{{WRAPPER}} .rlst-score-value' => 'color: {{VALUE}};' ),
			)
		);

		$this->add_responsive_control(
			'score_size',
			array(
				'label'      => __( 'Score size', 'rank-logic-supertool' ),
				'type'       => \Elementor\Controls_Manager::SLIDER,
				'size_units' => array( 'px', 'em' ),
				'range'      => array( 'px' => array( 'min' => 24, 'max' => 160 ) ),
				'default'    => array( 'unit' => 'px', 'size' => 64 ),
				'selectors'  => array(
					'{{WRAPPER}} .rlst-score-value' => 'font-size: {{SIZE}}{{UNIT}};',
				),
			)
		);

		$this->add_responsive_control(
			'align',
			array(
				'label'     => __( 'Alignment', 'rank-logic-supertool' ),
				'type'      => \Elementor\Controls_Manager::CHOOSE,
				'options'   => array(
					'left'   => array( 'title' => __( 'Left', 'rank-logic-supertool' ), 'icon' => 'eicon-text-align-left' ),
					'center' => array( 'title' => __( 'Center', 'rank-logic-supertool' ), 'icon' => 'eicon-text-align-center' ),
					'right'  => array( 'title' => __( 'Right', 'rank-logic-supertool' ), 'icon' => 'eicon-text-align-right' ),
				),
				'default'   => 'left',
				'selectors' => array( '{{WRAPPER}} .rlst-score' => 'text-align: {{VALUE}};' ),
			)
		);

		$this->end_controls_section();
	}

	protected function render() {
		$data = $this->get_visibility();
		if ( null === $data ) {
			return;
		}

		$settings = $this->get_settings_for_display();
		$delta    = isset( $data['delta'] ) ? (int) $data['delta'] : 0;
		?>
		<div class="rlst-score">
			<?php if ( ! empty( $settings['heading'] ) ) : ?>
				<p class="rlst-score-heading" style="margin:0 0 .25em;text-transform:uppercase;letter-spacing:.1em;font-size:.75em;opacity:.7;">
					<?php echo esc_html( $settings['heading'] ); ?>
				</p>
			<?php endif; ?>

			<p class="rlst-score-value" style="margin:0;font-weight:800;line-height:1;">
				<?php echo esc_html( (string) $data['score'] ); ?><span style="font-size:.35em;opacity:.55;">/100</span>
				<?php if ( 'yes' === $settings['show_delta'] && 0 !== $delta ) : ?>
					<span style="font-size:.28em;margin-left:.5em;color:<?php echo $delta > 0 ? '#12A150' : '#E5484D'; ?>;">
						<?php echo esc_html( ( $delta > 0 ? '▲ ' : '▼ ' ) . abs( $delta ) ); ?>
					</span>
				<?php endif; ?>
			</p>

			<?php if ( 'yes' === $settings['show_metrics'] ) : ?>
				<p class="rlst-score-metrics" style="margin:.6em 0 0;font-size:.9em;opacity:.8;">
					<?php
					printf(
						/* translators: 1: mention rate, 2: citation rate, 3: number of checks. */
						esc_html__( 'Named in %1$s of answers · cited in %2$s · %3$d checks', 'rank-logic-supertool' ),
						esc_html( round( $data['mentionRate'] * 100 ) . '%' ),
						esc_html( round( $data['citationRate'] * 100 ) . '%' ),
						(int) $data['checks']
					);
					?>
				</p>
			<?php endif; ?>
		</div>
		<?php
	}
}
