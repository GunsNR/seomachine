import { ImageResponse } from 'next/og';
import { brand } from '../../brand.config';

export const runtime = 'nodejs';
export const alt = `${brand.name} — AI Search Visibility & SEO Platform`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Social card, generated at build time so no binary asset needs committing. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: `linear-gradient(135deg, ${brand.colors.navy} 0%, ${brand.colors.primaryDark} 100%)`,
          padding: '72px 80px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 56, height: 56, borderRadius: 16, background: brand.colors.primary,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 30, fontWeight: 800, color: '#fff',
            }}
          >
            R
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 27, fontWeight: 800, color: '#fff' }}>Rank Logic</span>
            <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: 4, color: '#8FBBF8' }}>
              SUPERTOOL
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 68, fontWeight: 800, color: '#fff', lineHeight: 1.08, letterSpacing: -2 }}>
            Get cited by AI.
          </div>
          <div style={{ fontSize: 68, fontWeight: 800, color: brand.colors.accent, lineHeight: 1.08, letterSpacing: -2 }}>
            Get ranked by Google.
          </div>
          <div style={{ fontSize: 27, color: 'rgba(255,255,255,.72)', marginTop: 26, maxWidth: 900 }}>
            Track your brand across ChatGPT, Perplexity, Claude, Gemini, Grok and Google AI Mode.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          {['ChatGPT', 'Perplexity', 'Claude', 'Gemini', 'Grok', 'Google AI Mode'].map((n) => (
            <div
              key={n}
              style={{
                padding: '9px 18px', borderRadius: 999, fontSize: 18, color: '#fff',
                background: 'rgba(255,255,255,.10)', border: '1px solid rgba(255,255,255,.18)',
              }}
            >
              {n}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
