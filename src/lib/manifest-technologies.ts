// Maps repository root file and directory names to technology labels. The
// sync fetches the root listing once per repository, which lets us detect
// stacks that package.json dependency scanning cannot see (JVM, Python,
// PHP, mobile, infrastructure, CI).
const MANIFEST_TECHNOLOGIES: Record<string, string> = {
  // JVM build tools
  'pom.xml': 'Maven',
  mvnw: 'Maven',
  'mvnw.cmd': 'Maven',
  'build.gradle': 'Gradle',
  'build.gradle.kts': 'Gradle',
  'settings.gradle': 'Gradle',
  'settings.gradle.kts': 'Gradle',
  gradlew: 'Gradle',
  'gradlew.bat': 'Gradle',
  'gradle.properties': 'Gradle',
  'build.sbt': 'sbt',
  // Containers and C/C++ build systems
  'docker-compose.yml': 'Docker Compose',
  'docker-compose.yaml': 'Docker Compose',
  'compose.yml': 'Docker Compose',
  'compose.yaml': 'Docker Compose',
  'cmakelists.txt': 'CMake',
  makefile: 'Make',
  gnumakefile: 'Make',
  // Frameworks with signature root files
  'manage.py': 'Django',
  artisan: 'Laravel',
  'angular.json': 'Angular',
  'ionic.config.json': 'Ionic',
  'capacitor.config.ts': 'Capacitor',
  'capacitor.config.js': 'Capacitor',
  'capacitor.config.json': 'Capacitor',
  'tauri.conf.json': 'Tauri',
  'src-tauri': 'Tauri',
  'electron-builder.yml': 'Electron',
  'electron-builder.yaml': 'Electron',
  'electron-builder.json': 'Electron',
  'wp-config.php': 'WordPress',
  'pubspec.yaml': 'Flutter',
  // Framework config files catch stacks whose package.json lives in a
  // workspace subdirectory the manifest scan does not reach.
  'vite.config.ts': 'Vite',
  'vite.config.mts': 'Vite',
  'vite.config.js': 'Vite',
  'vite.config.mjs': 'Vite',
  'next.config.ts': 'Next.js',
  'next.config.js': 'Next.js',
  'next.config.mjs': 'Next.js',
  'astro.config.ts': 'Astro',
  'astro.config.mjs': 'Astro',
  'astro.config.js': 'Astro',
  'nuxt.config.ts': 'Nuxt',
  'nuxt.config.js': 'Nuxt',
  'svelte.config.js': 'Svelte',
  'tailwind.config.ts': 'Tailwind CSS',
  'tailwind.config.js': 'Tailwind CSS',
  'tailwind.config.cjs': 'Tailwind CSS',
  'tailwind.config.mjs': 'Tailwind CSS',
  // Package managers and runtimes
  'composer.json': 'Composer',
  'package-lock.json': 'npm',
  'npm-shrinkwrap.json': 'npm',
  'pnpm-lock.yaml': 'pnpm',
  'yarn.lock': 'Yarn',
  'bun.lock': 'Bun',
  'bun.lockb': 'Bun',
  'deno.json': 'Deno',
  'deno.jsonc': 'Deno',
  'poetry.lock': 'Poetry',
  pipfile: 'Pipenv',
  'uv.lock': 'uv',
  'cargo.toml': 'Cargo',
  gemfile: 'Bundler',
  podfile: 'CocoaPods',
  // CI and deployment
  jenkinsfile: 'Jenkins',
  '.gitlab-ci.yml': 'GitLab',
  '.circleci': 'CircleCI',
  'azure-pipelines.yml': 'Azure',
  '.travis.yml': 'Travis CI',
  procfile: 'Heroku',
  'vercel.json': 'Vercel',
  'netlify.toml': 'Netlify',
  'wrangler.toml': 'Cloudflare',
  'wrangler.json': 'Cloudflare',
  'wrangler.jsonc': 'Cloudflare',
  '.nvmrc': 'Node.js',
  '.node-version': 'Node.js',
  'firebase.json': 'Firebase',
  'serverless.yml': 'Serverless',
  'serverless.yaml': 'Serverless',
  'fly.toml': 'Fly.io',
  'northflank.json': 'Northflank',
  'chart.yaml': 'Helm',
  'ansible.cfg': 'Ansible',
  vagrantfile: 'Vagrant',
}

export function technologiesFromManifestFiles(files: string[]) {
  const names = files.map(file => file.toLowerCase())
  const technologies = new Set<string>()
  for (const name of names) {
    const technology = MANIFEST_TECHNOLOGIES[name]
    if (technology) technologies.add(technology)
    if (name.startsWith('dockerfile')) technologies.add('Docker')
    else if (/\.(csproj|fsproj|vbproj|sln)$/.test(name)) technologies.add('.NET')
    else if (name.endsWith('.tf')) technologies.add('Terraform')
    else if (name.endsWith('.xcodeproj') || name.endsWith('.xcworkspace')) technologies.add('Xcode')
  }
  // config.ru alone is only Rack; paired with a Gemfile it strongly implies Rails.
  if (names.includes('config.ru') && names.includes('gemfile')) technologies.add('Rails')
  return Array.from(technologies)
}
