<?php
/**
 * Emits Article and FAQPage JSON-LD for single posts.
 *
 * Skipped entirely when Yoast or Rank Math is active, since both already
 * output an Article graph and a second one would conflict.
 *
 * @package RankLogicSuperTool
 */

defined( 'ABSPATH' ) || exit;

class RLST_Schema {

	private static $instance = null;

	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'wp_head', array( $this, 'output' ), 20 );
	}

	/** Prints the JSON-LD block. */
	public function output() {
		if ( ! rlst_option( 'schema', 1 ) ) {
			return;
		}
		if ( ! is_singular( 'post' ) ) {
			return;
		}
		// Defer to an existing SEO plugin's Article graph.
		if ( RLST_SEO_Bridge::has_yoast() || RLST_SEO_Bridge::has_rank_math() ) {
			return;
		}

		$post = get_queried_object();
		if ( ! $post instanceof WP_Post ) {
			return;
		}

		$graph = array( $this->article_schema( $post ) );

		$faq = $this->faq_schema( $post );
		if ( $faq ) {
			$graph[] = $faq;
		}

		foreach ( $graph as $node ) {
			printf(
				"<script type=\"application/ld+json\">%s</script>\n",
				wp_json_encode( $node, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE )
			);
		}
	}

	/**
	 * Builds the BlogPosting node.
	 *
	 * @param WP_Post $post Post object.
	 * @return array
	 */
	private function article_schema( $post ) {
		$author_id = (int) $post->post_author;
		$image     = get_the_post_thumbnail_url( $post, 'full' );

		$schema = array(
			'@context'         => 'https://schema.org',
			'@type'            => 'BlogPosting',
			'headline'         => wp_strip_all_tags( get_the_title( $post ) ),
			'description'      => wp_strip_all_tags( get_the_excerpt( $post ) ),
			'mainEntityOfPage' => array(
				'@type' => 'WebPage',
				'@id'   => get_permalink( $post ),
			),
			'datePublished'    => get_the_date( 'c', $post ),
			'dateModified'     => get_the_modified_date( 'c', $post ),
			'author'           => array(
				'@type' => 'Person',
				'name'  => get_the_author_meta( 'display_name', $author_id ),
				'url'   => get_author_posts_url( $author_id ),
			),
			'publisher'        => array(
				'@type' => 'Organization',
				'name'  => get_bloginfo( 'name' ),
				'url'   => home_url(),
			),
			'wordCount'        => str_word_count( wp_strip_all_tags( $post->post_content ) ),
		);

		if ( $image ) {
			$schema['image'] = $image;
		}

		return $schema;
	}

	/**
	 * Derives FAQPage schema from question-shaped H2s and the paragraph below
	 * each one — the structure answer engines look for.
	 *
	 * @param WP_Post $post Post object.
	 * @return array|null
	 */
	private function faq_schema( $post ) {
		$content = $post->post_content;
		if ( ! preg_match_all( '#<h2[^>]*>(.*?)</h2>(.*?)(?=<h2|\z)#is', $content, $matches, PREG_SET_ORDER ) ) {
			return null;
		}

		$entities = array();
		foreach ( $matches as $match ) {
			$question = trim( wp_strip_all_tags( $match[1] ) );
			if ( '' === $question ) {
				continue;
			}

			$is_question = '?' === substr( $question, -1 )
				|| preg_match( '/^(how|what|why|when|where|which|who|can|does|is|are|should|do)\b/i', $question );
			if ( ! $is_question ) {
				continue;
			}

			$answer = trim( wp_strip_all_tags( $match[2] ) );
			if ( strlen( $answer ) < 40 ) {
				continue;
			}

			$entities[] = array(
				'@type'          => 'Question',
				'name'           => $question,
				'acceptedAnswer' => array(
					'@type' => 'Answer',
					'text'  => wp_trim_words( $answer, 90, '' ),
				),
			);
		}

		if ( count( $entities ) < 2 ) {
			return null;
		}

		return array(
			'@context'   => 'https://schema.org',
			'@type'      => 'FAQPage',
			'mainEntity' => $entities,
		);
	}
}
