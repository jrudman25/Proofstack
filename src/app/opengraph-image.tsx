import { ImageResponse } from 'next/og'

export const alt = 'Proofstack: evidence-backed GitHub portfolio briefings'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Hex stand-ins for the theme palette (Satori has no oklch support):
// --color-brand oklch(0.89 0.22 124) -> #bdf10b, --color-ink, --color-line, --color-dim.
const BRAND = '#bdf10b'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 96,
          backgroundColor: '#0a0b0d',
          color: '#e8eaed',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <svg width="88" height="88" viewBox="0 0 24 24" fill="none">
            <path d="M12 2.5 L21.5 7.5 L12 12.5 L2.5 7.5 Z" fill={BRAND} />
            <path d="M2.5 12 L12 17 L21.5 12" stroke={BRAND} strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M2.5 16.5 L12 21.5 L21.5 16.5" stroke={BRAND} strokeWidth="1.6" strokeLinejoin="round" opacity="0.45" />
          </svg>
          <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: '0.35em', color: BRAND }}>
            PROOFSTACK
          </div>
        </div>
        <div style={{ marginTop: 56, fontSize: 64, fontWeight: 700, lineHeight: 1.15 }}>
          Your GitHub work, explained.
        </div>
        <div style={{ marginTop: 24, fontSize: 32, color: '#9aa1ab', lineHeight: 1.4 }}>
          Evidence-backed portfolio briefings built from your repositories.
        </div>
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 12,
            backgroundColor: BRAND,
          }}
        />
      </div>
    ),
    size,
  )
}
