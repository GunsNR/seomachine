<?php
/**
 * Removes every option and transient this plugin created.
 *
 * Post meta written through Yoast or Rank Math is deliberately left alone —
 * it belongs to those plugins now, and deleting it would silently strip the
 * site's SEO titles and descriptions.
 *
 * @package RankLogicSuperTool
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

delete_option( 'rlst_settings' );

foreach ( array( 'visibility', 'citations' ) as $key ) {
	delete_transient( 'rlst_cache_' . $key );
	delete_option( 'rlst_cache_' . $key . '_stale' );
}

// Only the fallback meta we wrote ourselves is removed.
delete_post_meta_by_key( '_rlst_meta_title' );
delete_post_meta_by_key( '_rlst_meta_description' );
