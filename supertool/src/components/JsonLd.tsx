/**
 * Renders JSON-LD. The payload is built server-side from our own data, never
 * from user input, so serialising it into a script tag is safe; angle brackets
 * are still escaped to close off any future injection path.
 */
export function JsonLd({ data }: { data: unknown | unknown[] }) {
  const payload = Array.isArray(data) ? data : [data];
  return (
    <>
      {payload.map((item, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(item).replace(/</g, '\\u003c'),
          }}
        />
      ))}
    </>
  );
}
