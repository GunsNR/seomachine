import { Fragment } from 'react';

/**
 * Minimal renderer for the constrained markdown subset used in blog bodies:
 * ##/### headings, - bullets, **bold** spans and plain paragraphs.
 *
 * Content is authored in-repo, not user-supplied, and nothing here is rendered
 * as raw HTML — every node is a real React element.
 */
export function Markdown({ source }: { source: string }) {
  const blocks = source.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);

  return (
    <div className="space-y-5">
      {blocks.map((block, i) => {
        if (block.startsWith('### ')) {
          return (
            <h3 key={i} className="pt-3 font-heading text-[1.2rem] font-bold text-ink">
              {inline(block.slice(4))}
            </h3>
          );
        }
        if (block.startsWith('## ')) {
          return (
            <h2 key={i} className="pt-5 font-heading text-[1.6rem] font-extrabold text-ink">
              {inline(block.slice(3))}
            </h2>
          );
        }
        if (/^[-*]\s/m.test(block) && block.split('\n').every((l) => /^[-*]\s/.test(l.trim()))) {
          return (
            <ul key={i} className="ml-5 list-disc space-y-2 marker:text-brand">
              {block.split('\n').map((line, j) => (
                <li key={j} className="prose-body pl-1">{inline(line.replace(/^[-*]\s/, ''))}</li>
              ))}
            </ul>
          );
        }
        return <p key={i} className="prose-body text-pretty">{inline(block)}</p>;
      })}
    </div>
  );
}

/** Renders **bold** spans without dangerouslySetInnerHTML. */
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} className="font-semibold text-ink">{part.slice(2, -2)}</strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}
