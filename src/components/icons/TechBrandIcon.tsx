import * as React from "react"
import { Cpu, Hammer, type LucideIcon } from 'lucide-react'
import { normalizeTechnology } from '@/lib/package-technologies'

type BrandMark = { title: string; path: string }
type GlyphMark = { title: string; icon: LucideIcon }
type TechMark = BrandMark | GlyphMark

const TANSTACK_MARK: BrandMark = {
  title: 'TanStack',
  path: 'M12 0c6.627 0 9.166 4.102 9.166 12S18.626 24 12 24s-9.166-4.096-9.166-12c0-7.898 2.54-12 9.166-12m3.031 17.485c-.861 0-1.33.234-1.708.423-.327.164-.582.292-1.148.292-.567 0-.822-.128-1.148-.292-.378-.189-.848-.423-1.71-.423-.86 0-1.33.234-1.708.423-.327.164-.581.292-1.148.292v1.251c.862 0 1.331-.234 1.709-.423.326-.163.581-.292 1.148-.292s.821.129 1.148.292c.378.189.847.423 1.709.423.861 0 1.33-.234 1.709-.423.326-.163.58-.292 1.147-.292s.822.129 1.148.292c.378.189.848.423 1.71.423v-1.25c-.565 0-.822-.13-1.149-.293-.377-.189-.847-.423-1.709-.423m.41-12.536c.65-.586 0-1.648-.813-1.328-.45.18-.873.438-1.251.779a4.2 4.2 0 0 0-1.202 1.94 4.2 4.2 0 0 0-1.203-1.94 4.3 4.3 0 0 0-1.25-.779c-.814-.32-1.463.742-.814 1.328l2.385 2.153a4.86 4.86 0 0 0-2.731-.839c-.552 0-1.082.09-1.58.26-.836.284-.604 1.532.275 1.532h3.326a4.2 4.2 0 0 0-2.012.988 4 4 0 0 0-.9 1.165c-.403.776.588 1.529 1.237.948l2.686-2.42-.2 6.656c0 .08-.047.158-.107.223a5 5 0 0 1-.257-.123c-.378-.189-.848-.423-1.71-.423-.861 0-1.33.234-1.708.423-.327.164-.581.292-1.148.292v1.251c.861 0 1.33-.234 1.709-.423.326-.164.58-.292 1.148-.292.566 0 .821.128 1.148.292.377.189.847.423 1.708.423.862 0 1.332-.234 1.71-.423.326-.164.58-.292 1.147-.292s.822.128 1.148.292c.378.189.848.423 1.71.423v-1.25c-.565 0-.822-.13-1.149-.293v-.005c-.378-.19-.847-.424-1.709-.424-.861 0-1.33.235-1.709.424-.097.045-.189.094-.283.131a.34.34 0 0 1-.12-.232l-.2-6.69 2.722 2.457c.65.587 1.64-.166 1.236-.948a4.11 4.11 0 0 0-2.911-2.153h3.326c.882 0 1.108-1.245.275-1.531a4.88 4.88 0 0 0-4.311.578l2.385-2.152z',
}
const HEROUI_MARK: BrandMark = {
  title: 'HeroUI',
  path: 'M6.353 0h11.294A6.353 6.353 0 0 1 24 6.353v11.294A6.353 6.353 0 0 1 17.647 24H6.353A6.353 6.353 0 0 1 0 17.647V6.353A6.353 6.353 0 0 1 6.353 0Zm7.755 6.913h-.933v6.702a2.88 2.88 0 0 1-.362 1.45c-.24.424-.596.77-1.025 1-.443.244-.96.365-1.553.365-.592 0-1.108-.121-1.55-.364a2.603 2.603 0 0 1-1.024-1 2.865 2.865 0 0 1-.365-1.45V6.912h-.933v6.767a3.558 3.558 0 0 0 .489 1.862c.327.547.798.994 1.362 1.292.582.316 1.256.474 2.021.474.769 0 1.444-.157 2.024-.471a3.473 3.473 0 0 0 1.36-1.293c.33-.565.5-1.21.49-1.864V6.913Zm3.648 10.22V6.914h-.933v10.22h.933Z',
}
const FLYIO_MARK: BrandMark = {
  title: 'Fly.io',
  path: 'M11.987 0c-2.45-.01-5.002.925-6.541 2.897-1.17 1.502-1.664 3.474-1.49 5.356.29 2.112 1.476 3.96 2.676 5.672a41.5 41.5 0 0 0 4.216 4.831c-1.063.832-1.943 2.286-1.357 3.644.821 2.32 4.665 2.05 5.122-.372.39-1.288-.694-2.533-1.428-3.309 2.388-2.431 4.706-5.036 6.17-8.145.595-1.32.902-2.802.614-4.24-.28-2.341-1.823-4.473-3.967-5.46C14.76.266 13.364.016 11.987 0m-.236 1.577v15.534C9.881 13.483 7.724 9.266 8.73 5.069c.35-1.539 1.253-3.309 3.02-3.492m1.996.04c1.534.357 3.031 1.096 3.906 2.48 1.3 1.93 1.318 4.55.1 6.521-1.268 2.395-3.06 4.463-4.916 6.415 1.472-2.974 3.074-6.106 3.182-9.5-.043-2.08-.438-4.612-2.272-5.916M11.97 20.103c.848.342 1.597 1.983.153 2.173-.664.15-1.367-.599-.995-1.222.213-.355.488-.73.842-.95',
}
const GEMINI_MARK: BrandMark = {
  title: 'Gemini',
  path: 'M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81',
}

// Single-path brand marks (Simple Icons, CC0) for technologies the bundled
// devicon font does not cover. Keys are normalized technology names. Marks
// render in currentColor so they sit visually alongside the devicon glyphs.
const BRAND_MARKS: Record<string, BrandMark> = {
  // TanStack products share the project mark.
  tanstack: TANSTACK_MARK,
  tanstackrouter: TANSTACK_MARK,
  tanstackquery: TANSTACK_MARK,
  tanstacktable: TANSTACK_MARK,
  tanstackform: TANSTACK_MARK,
  tanstackstart: TANSTACK_MARK,
  tanstackvirtual: TANSTACK_MARK,
  reactquery: TANSTACK_MARK,
  // NextUI was renamed HeroUI; both spellings show the current mark.
  heroui: HEROUI_MARK,
  nextui: HEROUI_MARK,
  flyio: FLYIO_MARK,
  flydotio: FLYIO_MARK,
  upstash: {
    title: 'Upstash',
    path: 'M13.8027 0C11.193 0 8.583.9952 6.5918 2.9863c-3.9823 3.9823-3.9823 10.4396 0 14.4219 1.9911 1.9911 5.2198 1.9911 7.211 0 1.991-1.9911 1.991-5.2198 0-7.211L12 12c.9956.9956.9956 2.6098 0 3.6055-.9956.9955-2.6099.9955-3.6055 0-2.9866-2.9868-2.9866-7.8297 0-10.8164 2.9868-2.9868 7.8297-2.9868 10.8164 0l1.8028-1.8028C19.0225.9952 16.4125 0 13.8027 0zM12 12c-.9956-.9956-.9956-2.6098 0-3.6055.9956-.9955 2.6098-.9955 3.6055 0 2.9867 2.9868 2.9867 7.8297 0 10.8164-2.9867 2.9868-7.8297 2.9868-10.8164 0l-1.8028 1.8028c3.9823 3.9822 10.4396 3.9822 14.4219 0 3.9823-3.9824 3.9823-10.4396 0-14.4219-.9956-.9956-2.3006-1.4922-3.6055-1.4922-1.3048 0-2.6099.4966-3.6054 1.4922-1.9912 1.9912-1.9912 5.2198 0 7.211z',
  },
  neon: {
    title: 'Neon',
    path: 'M24 0V24l-9.365-8.045V24H0V0ZM2.942 21.087h8.751V9.563l9.365 8.204V2.919L2.942 2.914Z',
  },
  gemini: GEMINI_MARK,
  googlegemini: GEMINI_MARK,
}

// Generic Lucide glyphs for technologies that have no brand mark anywhere
// (Make is a build tool, Assembly a language); without them both render as
// meaningless two-letter badges.
const GENERIC_MARKS: Record<string, GlyphMark> = {
  make: { title: 'Make', icon: Hammer },
  assembly: { title: 'Assembly', icon: Cpu },
}

export function techBrandMark(technology: string): TechMark | null {
  const key = normalizeTechnology(technology)
  return BRAND_MARKS[key] ?? GENERIC_MARKS[key] ?? null
}

export function TechBrandIcon({ technology, className, ...props }: React.SVGProps<SVGSVGElement> & { technology: string; title?: string }) {
  const mark = techBrandMark(technology)
  if (!mark) return null
  if ('icon' in mark) {
    const MarkIcon = mark.icon
    return (
      <MarkIcon className={className} {...props}>
        <title>{mark.title}</title>
      </MarkIcon>
    )
  }
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      className={className}
      {...props}
    >
      <title>{mark.title}</title>
      <path d={mark.path} />
    </svg>
  )
}
