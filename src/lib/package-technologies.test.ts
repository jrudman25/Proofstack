import { describe, expect, it } from 'vitest'
import { mergeTechnologies, technologiesFromPackageDependencies } from './package-technologies'

describe('package technology detection', () => {
  it('identifies frameworks and tools from dependency names without exposing unknown packages', () => {
    expect(technologiesFromPackageDependencies([
      'next', 'react', 'typescript', 'tailwindcss', '@supabase/supabase-js', '@playwright/test', 'private-package'
    ])).toEqual(['Next.js', 'React', 'TypeScript', 'Tailwind CSS', 'Supabase', 'Playwright'])
  })

  it('identifies common frontend libraries and build tools', () => {
    expect(technologiesFromPackageDependencies([
      '@mui/material', '@vitejs/plugin-react', 'react-router-dom', '@reduxjs/toolkit', 'sass', '@storybook/react-vite'
    ])).toEqual(['Material UI', 'Vite', 'React Router', 'Redux', 'Sass', 'Storybook'])
  })

  it('recognizes scoped framework packages and deduplicates technology labels', () => {
    expect(technologiesFromPackageDependencies([
      '@angular/core', '@angular/router', '@sveltejs/kit', 'svelte', '@nestjs/core', '@remix-run/react'
    ])).toEqual(['Angular', 'SvelteKit', 'Svelte', 'NestJS', 'Remix'])
  })

  it('identifies data and AI platform SDKs from scoped packages', () => {
    expect(technologiesFromPackageDependencies([
      '@heroui/react', '@nextui-org/system', '@upstash/redis',
      '@neondatabase/serverless', '@google/genai', '@google/generative-ai', 'redis', 'private-package'
    ])).toEqual(['HeroUI', 'Upstash', 'Neon', 'Gemini', 'Redis'])
  })

  it('names the specific TanStack product a package belongs to', () => {
    expect(technologiesFromPackageDependencies([
      '@tanstack/react-router', '@tanstack/react-query', '@tanstack/react-table',
      '@tanstack/react-start', '@tanstack/react-form', '@tanstack/react-virtual', '@tanstack/store',
    ])).toEqual([
      'TanStack Router', 'TanStack Query', 'TanStack Table', 'TanStack Start',
      'TanStack Form', 'TanStack Virtual', 'TanStack',
    ])
  })

  it('merges manifest and existing values using punctuation-insensitive names', () => {
    expect(mergeTechnologies(['NextJS', 'Custom Tool'], ['Next.js', 'React'])).toEqual(['Next.js', 'Custom Tool', 'React'])
  })
})
