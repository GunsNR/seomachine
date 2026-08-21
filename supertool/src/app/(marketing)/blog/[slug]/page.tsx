import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Clock } from 'lucide-react';
import { CtaBand } from '@/components/marketing/CtaBand';
import { Markdown } from '@/components/marketing/Markdown';
import { JsonLd } from '@/components/JsonLd';
import { POSTS, findPost } from '@/content/blog';
import { articleSchema, breadcrumbSchema, pageMetadata } from '@/lib/metadata';

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = findPost(slug);
  if (!post) return {};
  return pageMetadata({
    title: post.title,
    description: post.description,
    path: `/blog/${post.slug}`,
    keywords: post.tags,
    type: 'article',
    publishedTime: post.published,
  });
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = findPost(slug);
  if (!post) notFound();

  const more = POSTS.filter((p) => p.slug !== post.slug).slice(0, 2);

  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Resources', path: '/blog' },
            { name: post.title, path: `/blog/${post.slug}` },
          ]),
          articleSchema({
            title: post.title,
            description: post.description,
            path: `/blog/${post.slug}`,
            published: post.published,
            modified: post.updated,
            author: post.author,
          }),
        ]}
      />

      <article>
        <header className="relative overflow-hidden bg-navy">
          <div className="pointer-events-none absolute inset-0 bg-grid-faint [background-size:64px_64px]" aria-hidden="true" />
          <div className="container-x relative py-14 lg:py-20">
            <Link href="/blog" className="inline-flex items-center gap-2 text-[0.85rem] font-semibold text-white/65 hover:text-white">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              All resources
            </Link>
            <div className="mt-7 max-w-3xl">
              <div className="flex flex-wrap gap-2">
                {post.tags.map((t) => (
                  <span key={t} className="rounded-full bg-white/10 px-3 py-1 text-[0.7rem] font-bold uppercase tracking-[0.1em] text-white/75">
                    {t}
                  </span>
                ))}
              </div>
              <h1 className="mt-5 text-display-lg text-white text-balance">{post.title}</h1>
              <p className="mt-5 text-[1.0625rem] leading-[1.7] text-white/70 text-pretty">{post.description}</p>
              <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.85rem] text-white/60">
                <span>{post.author}</span>
                <time dateTime={post.published}>
                  {new Date(`${post.published}T00:00:00Z`).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
                  })}
                </time>
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  {post.readingMinutes} min read
                </span>
              </div>
            </div>
          </div>
        </header>

        <div className="container-x py-14 lg:py-20">
          <div className="mx-auto max-w-3xl">
            <Markdown source={post.body} />
          </div>
        </div>
      </article>

      {more.length > 0 && (
        <section className="border-t border-line bg-surface-alt py-14">
          <div className="container-x">
            <h2 className="text-display-sm">Keep reading</h2>
            <div className="mt-7 grid gap-6 md:grid-cols-2">
              {more.map((p) => (
                <Link key={p.slug} href={`/blog/${p.slug}`} className="card card-hover p-7">
                  <h3 className="font-heading text-[1.1rem] font-bold text-ink">{p.title}</h3>
                  <p className="mt-2.5 text-[0.9rem] leading-[1.7] text-body">{p.description}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <CtaBand />
    </>
  );
}
