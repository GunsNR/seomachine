<?php
/**
 * Admin settings screen: paste a key, verify, done.
 *
 * @package RankLogicSuperTool
 */

defined( 'ABSPATH' ) || exit;

class RLST_Settings {

	private static $instance = null;

	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'admin_menu', array( $this, 'add_menu' ) );
		add_action( 'admin_init', array( $this, 'register_settings' ) );
		add_action( 'admin_post_rlst_verify', array( $this, 'handle_verify' ) );
	}

	public function add_menu() {
		add_menu_page(
			__( 'SuperTool', 'rank-logic-supertool' ),
			__( 'SuperTool', 'rank-logic-supertool' ),
			'manage_options',
			'rank-logic-supertool',
			array( $this, 'render' ),
			'dashicons-chart-line',
			58
		);
	}

	public function register_settings() {
		register_setting(
			'rlst_settings_group',
			RLST_OPTION,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( $this, 'sanitize' ),
				'default'           => array(),
			)
		);
	}

	/**
	 * Sanitises submitted settings.
	 *
	 * @param array $input Raw submitted values.
	 * @return array
	 */
	public function sanitize( $input ) {
		$existing = get_option( RLST_OPTION, array() );
		$clean    = is_array( $existing ) ? $existing : array();

		if ( isset( $input['api_key'] ) ) {
			$clean['api_key'] = sanitize_text_field( $input['api_key'] );
		}

		if ( isset( $input['api_base'] ) ) {
			$base = esc_url_raw( trim( $input['api_base'] ) );
			// Never allow a plain-http endpoint except on localhost.
			if ( $base && ( 0 === strpos( $base, 'https://' ) || preg_match( '#^http://(localhost|127\.0\.0\.1)#', $base ) ) ) {
				$clean['api_base'] = untrailingslashit( $base );
			}
		}

		$clean['attribution'] = empty( $input['attribution'] ) ? 0 : 1;
		$clean['schema']      = empty( $input['schema'] ) ? 0 : 1;

		// A settings change invalidates whatever we cached from the old project.
		RLST_Api_Client::flush_cache();

		return $clean;
	}

	/** Handles the "Verify connection" button. */
	public function handle_verify() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to do that.', 'rank-logic-supertool' ) );
		}
		check_admin_referer( 'rlst_verify' );

		$result   = RLST_Api_Client::verify();
		$settings = get_option( RLST_OPTION, array() );

		if ( is_wp_error( $result ) ) {
			$settings['last_error']   = $result->get_error_message();
			$settings['project_name'] = '';
			$notice                   = 'error';
		} else {
			$settings['last_error']     = '';
			$settings['project_name']   = isset( $result['project']['name'] ) ? sanitize_text_field( $result['project']['name'] ) : '';
			$settings['project_domain'] = isset( $result['project']['domain'] ) ? sanitize_text_field( $result['project']['domain'] ) : '';
			$settings['verified_at']    = time();
			$notice                     = 'verified';
		}

		update_option( RLST_OPTION, $settings );
		RLST_Api_Client::flush_cache();

		wp_safe_redirect( add_query_arg( 'rlst_notice', $notice, admin_url( 'admin.php?page=rank-logic-supertool' ) ) );
		exit;
	}

	/** Renders the settings screen. */
	public function render() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$api_key      = rlst_option( 'api_key' );
		$api_base     = rlst_option( 'api_base', 'https://ranklogicsupertool.com' );
		$project      = rlst_option( 'project_name' );
		$domain       = rlst_option( 'project_domain' );
		$last_error   = rlst_option( 'last_error' );
		$attribution  = (int) rlst_option( 'attribution', 1 );
		$schema       = (int) rlst_option( 'schema', 1 );
		$notice       = isset( $_GET['rlst_notice'] ) ? sanitize_key( wp_unslash( $_GET['rlst_notice'] ) ) : '';
		$seo_plugin   = RLST_SEO_Bridge::active_plugin_label();
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'Rank Logic SuperTool', 'rank-logic-supertool' ); ?></h1>

			<?php if ( 'verified' === $notice ) : ?>
				<div class="notice notice-success is-dismissible">
					<p>
						<?php
						printf(
							/* translators: %s: project name. */
							esc_html__( 'Connected to project “%s”.', 'rank-logic-supertool' ),
							esc_html( $project )
						);
						?>
					</p>
				</div>
			<?php elseif ( 'error' === $notice && $last_error ) : ?>
				<div class="notice notice-error is-dismissible">
					<p><?php echo esc_html( $last_error ); ?></p>
				</div>
			<?php endif; ?>

			<div class="notice notice-info inline">
				<p>
					<strong><?php esc_html_e( 'Status:', 'rank-logic-supertool' ); ?></strong>
					<?php if ( $project ) : ?>
						<?php
						printf(
							/* translators: 1: project name, 2: project domain. */
							esc_html__( 'Connected to %1$s (%2$s).', 'rank-logic-supertool' ),
							'<strong>' . esc_html( $project ) . '</strong>',
							esc_html( $domain )
						);
						?>
					<?php else : ?>
						<?php esc_html_e( 'Not connected yet. Paste a project key below and verify.', 'rank-logic-supertool' ); ?>
					<?php endif; ?>
					&nbsp;|&nbsp;
					<strong><?php esc_html_e( 'SEO plugin:', 'rank-logic-supertool' ); ?></strong>
					<?php echo esc_html( $seo_plugin ); ?>
				</p>
			</div>

			<form method="post" action="options.php">
				<?php settings_fields( 'rlst_settings_group' ); ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row">
							<label for="rlst_api_key"><?php esc_html_e( 'Project key', 'rank-logic-supertool' ); ?></label>
						</th>
						<td>
							<input
								type="password" id="rlst_api_key" class="regular-text"
								name="<?php echo esc_attr( RLST_OPTION ); ?>[api_key]"
								value="<?php echo esc_attr( $api_key ); ?>"
								autocomplete="off" spellcheck="false"
							/>
							<p class="description">
								<?php esc_html_e( 'From SuperTool → Settings → Project API keys. Shown once at creation.', 'rank-logic-supertool' ); ?>
							</p>
						</td>
					</tr>
					<tr>
						<th scope="row">
							<label for="rlst_api_base"><?php esc_html_e( 'API endpoint', 'rank-logic-supertool' ); ?></label>
						</th>
						<td>
							<input
								type="url" id="rlst_api_base" class="regular-text"
								name="<?php echo esc_attr( RLST_OPTION ); ?>[api_base]"
								value="<?php echo esc_attr( $api_base ); ?>"
							/>
							<p class="description">
								<?php esc_html_e( 'Leave as-is unless you self-host SuperTool.', 'rank-logic-supertool' ); ?>
							</p>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Options', 'rank-logic-supertool' ); ?></th>
						<td>
							<fieldset>
								<label>
									<input
										type="checkbox" value="1"
										name="<?php echo esc_attr( RLST_OPTION ); ?>[attribution]"
										<?php checked( 1, $attribution ); ?>
									/>
									<?php esc_html_e( 'Track AI referrals (cookieless; sends the full referrer URL)', 'rank-logic-supertool' ); ?>
								</label>
								<br />
								<label>
									<input
										type="checkbox" value="1"
										name="<?php echo esc_attr( RLST_OPTION ); ?>[schema]"
										<?php checked( 1, $schema ); ?>
									/>
									<?php esc_html_e( 'Add Article and FAQ structured data to posts', 'rank-logic-supertool' ); ?>
								</label>
							</fieldset>
						</td>
					</tr>
				</table>
				<?php submit_button(); ?>
			</form>

			<hr />

			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="rlst_verify" />
				<?php wp_nonce_field( 'rlst_verify' ); ?>
				<?php submit_button( __( 'Verify connection', 'rank-logic-supertool' ), 'secondary', 'submit', false ); ?>
			</form>

			<?php $this->render_visibility_panel(); ?>
		</div>
		<?php
	}

	/** Shows current visibility numbers so the admin screen proves the link works. */
	private function render_visibility_panel() {
		if ( ! rlst_option( 'api_key' ) ) {
			return;
		}

		$data = RLST_Api_Client::visibility();
		if ( is_wp_error( $data ) || empty( $data['engines'] ) ) {
			return;
		}
		?>
		<h2><?php esc_html_e( 'Current AI visibility', 'rank-logic-supertool' ); ?></h2>
		<p style="font-size:2.4em;font-weight:700;margin:0 0 .2em;">
			<?php echo esc_html( (string) $data['score'] ); ?><span style="font-size:.45em;color:#666;">/100</span>
		</p>
		<table class="widefat striped" style="max-width:640px;">
			<thead>
				<tr>
					<th><?php esc_html_e( 'Engine', 'rank-logic-supertool' ); ?></th>
					<th><?php esc_html_e( 'Score', 'rank-logic-supertool' ); ?></th>
					<th><?php esc_html_e( 'Mentioned', 'rank-logic-supertool' ); ?></th>
					<th><?php esc_html_e( 'Cited', 'rank-logic-supertool' ); ?></th>
				</tr>
			</thead>
			<tbody>
				<?php foreach ( $data['engines'] as $engine ) : ?>
					<?php $measured = isset( $engine['score'] ) && null !== $engine['score']; ?>
					<tr>
						<td><?php echo esc_html( $engine['name'] ); ?></td>
						<td>
							<?php
							echo $measured
								? esc_html( (string) (int) $engine['score'] )
								: esc_html__( 'not measured', 'rank-logic-supertool' );
							?>
						</td>
						<td><?php echo $measured ? esc_html( round( (float) $engine['mentionRate'] * 100 ) . '%' ) : '—'; ?></td>
						<td><?php echo $measured ? esc_html( round( (float) $engine['citationRate'] * 100 ) . '%' ) : '—'; ?></td>
					</tr>
				<?php endforeach; ?>
			</tbody>
		</table>
		<?php
		// Provenance comes straight from the API. A run with gaps, or one made
		// of demo data, must say so here rather than being summarised away.
		$provenance = isset( $data['provenance'] ) && is_array( $data['provenance'] ) ? $data['provenance'] : array();
		$mode       = isset( $provenance['mode'] ) ? (string) $provenance['mode'] : '';
		$observed   = isset( $provenance['observed'] ) ? (int) $provenance['observed'] : 0;
		$total      = isset( $provenance['total'] ) ? (int) $provenance['total'] : 0;
		?>
		<?php if ( 'demo' === $mode ) : ?>
			<p class="description">
				<?php esc_html_e( 'This workspace is running in demo mode. Every figure above is generated sample data, not a measurement of any assistant.', 'rank-logic-supertool' ); ?>
			</p>
		<?php elseif ( 'mixed' === $mode ) : ?>
			<p class="description">
				<?php esc_html_e( 'This run mixes live and sample data, which should not happen. Treat these figures as unusable.', 'rank-logic-supertool' ); ?>
			</p>
		<?php elseif ( 'unavailable' === $mode || 0 === $observed ) : ?>
			<p class="description">
				<?php esc_html_e( 'Nothing was observed in the latest run. No answer engine returned a result, so there is nothing to report.', 'rank-logic-supertool' ); ?>
			</p>
		<?php elseif ( $total > 0 && $observed < $total ) : ?>
			<p class="description">
				<?php
				printf(
					/* translators: 1: observed checks, 2: total checks. */
					esc_html__( 'Partial coverage: %1$d of %2$d checks returned an answer. Rates are calculated over what was observed.', 'rank-logic-supertool' ),
					$observed,
					$total
				);
				?>
			</p>
		<?php endif; ?>
		<?php
	}
}
