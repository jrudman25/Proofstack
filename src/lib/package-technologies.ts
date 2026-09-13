const DEPENDENCY_TECHNOLOGIES: Record<string, string> = {
  next: 'Next.js',
  react: 'React',
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

export function mergeTechnologies(...groups: (string[] | null | undefined)[]) {
  const technologies = new Map<string, string>()
  for (const technology of groups.flatMap(group => group || [])) {
    const value = technology.trim()
    if (value) technologies.set(value.toLowerCase().replace(/[^a-z0-9]+/g, ''), value)
  }
  return Array.from(technologies.values())
}
