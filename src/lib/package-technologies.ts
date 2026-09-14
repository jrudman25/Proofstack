const DEPENDENCY_TECHNOLOGIES: Record<string, string> = {
  next: 'Next.js',
  react: 'React',
  'react-dom': 'React',
  'react-native': 'React Native',
  vue: 'Vue',
  nuxt: 'Nuxt',
  svelte: 'Svelte',
  astro: 'Astro',
  gatsby: 'Gatsby',
  vite: 'Vite',
  typescript: 'TypeScript',
  tailwindcss: 'Tailwind CSS',
  express: 'Express',
  fastify: 'Fastify',
  electron: 'Electron',
  firebase: 'Firebase',
  prisma: 'Prisma',
  'drizzle-orm': 'Drizzle ORM',
  vitest: 'Vitest',
  jest: 'Jest',
  playwright: 'Playwright',
  '@playwright/test': 'Playwright',
  cypress: 'Cypress',
  'react-router': 'React Router',
  'react-router-dom': 'React Router',
  redux: 'Redux',
  'react-redux': 'Redux',
  sass: 'Sass',
  webpack: 'Webpack',
  '@babel/core': 'Babel',
  bootstrap: 'Bootstrap',
  'react-bootstrap': 'React Bootstrap',
  eslint: 'ESLint',
  storybook: 'Storybook',
  mongoose: 'Mongoose',
  graphql: 'GraphQL',
  expo: 'Expo',
  d3: 'D3.js',
  three: 'Three.js',
  'styled-components': 'styled-components',
  jquery: 'jQuery',
  'ember-source': 'Ember',
  backbone: 'Backbone.js',
  alpinejs: 'Alpine.js',
  'socket.io': 'Socket.IO',
  'socket.io-client': 'Socket.IO',
  zustand: 'Zustand',
  mobx: 'MobX',
  axios: 'Axios',
  sanity: 'Sanity',
  'aws-sdk': 'AWS',
}

function technologyForDependency(dependency: string) {
  const name = dependency.toLowerCase()
  if (DEPENDENCY_TECHNOLOGIES[name]) return DEPENDENCY_TECHNOLOGIES[name]
  if (name.startsWith('@angular/')) return 'Angular'
  if (name.startsWith('@nestjs/')) return 'NestJS'
  if (name.startsWith('@remix-run/')) return 'Remix'
  if (name.startsWith('@sveltejs/')) return name === '@sveltejs/kit' ? 'SvelteKit' : 'Svelte'
  if (name.startsWith('@vitejs/')) return 'Vite'
  if (name.startsWith('@mui/') || name.startsWith('@material-ui/')) return 'Material UI'
  if (name.startsWith('@reduxjs/')) return 'Redux'
  if (name.startsWith('@storybook/')) return 'Storybook'
  if (name.startsWith('@tanstack/')) return 'TanStack'
  if (name.startsWith('@supabase/')) return 'Supabase'
  if (name.startsWith('@cloudflare/')) return 'Cloudflare'
  if (name.startsWith('@prisma/')) return 'Prisma'
  if (name.startsWith('@trpc/')) return 'tRPC'
  if (name.startsWith('@chakra-ui/')) return 'Chakra UI'
  if (name.startsWith('@aws-sdk/')) return 'AWS'
  if (name.startsWith('@expo/')) return 'Expo'
  if (name.startsWith('@ionic/')) return 'Ionic'
  if (name.startsWith('@capacitor/')) return 'Capacitor'
  if (name.startsWith('@tailwindcss/')) return 'Tailwind CSS'
  return null
}

export function technologiesFromPackageDependencies(dependencies: string[]) {
  const technologies = new Set<string>()
  for (const dependency of dependencies) {
    const technology = technologyForDependency(dependency)
    if (technology) technologies.add(technology)
  }
  return Array.from(technologies)
}

export function normalizeTechnology(technology: string) {
  // Expand trailing sigils before stripping so "C", "C++", "C#" and "F#"
  // keep distinct keys instead of collapsing to "c"/"f".
  return technology
    .toLowerCase()
    .replace(/#/g, 'sharp')
    .replace(/\+/g, 'plus')
    .replace(/[^a-z0-9]+/g, '')
}

export function mergeTechnologies(...groups: (string[] | null | undefined)[]) {
  const technologies = new Map<string, string>()
  for (const technology of groups.flatMap(group => group || [])) {
    const value = technology.trim()
    if (value) technologies.set(normalizeTechnology(value), value)
  }
  return Array.from(technologies.values())
}
