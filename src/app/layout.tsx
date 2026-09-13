import type { Metadata } from 'next'
import { Space_Grotesk, Space_Mono } from 'next/font/google'
import 'devicon/devicon-base.css'
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
  title: 'Proofstack - AI Powered Portfolio',
  description: 'Manage and sync your GitHub projects with Gemini AI.',
}

import ChatWidget from '@/components/ChatWidget'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${spaceGrotesk.variable} ${spaceMono.variable} antialiased bg-ink text-foreground selection:bg-brand selection:text-on-brand`}>
        {children}
        <ChatWidget />
      </body>
    </html>
  )
}
