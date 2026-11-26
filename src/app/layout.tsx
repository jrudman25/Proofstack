import type { Metadata, Viewport } from 'next'
import { Space_Grotesk, Space_Mono } from 'next/font/google'
import 'devicon/devicon-base.css'
import { getAppUrl } from '@/lib/env-public'
import './globals.css'

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
})

const spaceMono = Space_Mono({
  variable: '--font-space-mono',
  subsets: ['latin'],
  weight: ['400', '700'],
})

export const metadata: Metadata = {
  metadataBase: new URL(getAppUrl()),
  title: {
    default: 'Proofstack',
    template: '%s · Proofstack',
  },
  description: 'Understand, remember, and explain your GitHub project work with evidence-backed portfolio briefings.',
  openGraph: {
    siteName: 'Proofstack',
    title: 'Proofstack',
    description: 'Understand, remember, and explain your GitHub project work with evidence-backed portfolio briefings.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
  },
  verification: {
    google: '3Ah_oDSBF5hKvgd8-4h1ZuJBrc1ecSVJMY2F10BYPV4',
  },
}

export const viewport: Viewport = {
  themeColor: '#0a0b0d',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${spaceGrotesk.variable} ${spaceMono.variable} antialiased bg-ink text-foreground selection:bg-brand selection:text-on-brand`}>
        {children}
      </body>
    </html>
  )
}
