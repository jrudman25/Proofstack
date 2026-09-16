import { describe, expect, it } from 'vitest'
import { technologiesFromManifestFiles } from './manifest-technologies'

describe('manifest technology detection', () => {
  it('identifies JVM, container, and CI tooling from root files', () => {
    expect(technologiesFromManifestFiles([
      'pom.xml', 'Dockerfile', 'docker-compose.yml', 'Jenkinsfile', 'README.md',
    ])).toEqual(['Maven', 'Docker', 'Docker Compose', 'Jenkins'])
  })

  it('detects frameworks and ecosystems without parsing file contents', () => {
    expect(technologiesFromManifestFiles([
      'manage.py', 'main.tf', 'app.csproj', 'src-tauri', 'vercel.json', 'northflank.json',
    ])).toEqual(['Django', 'Terraform', '.NET', 'Tauri', 'Vercel', 'Northflank'])
  })

  it('matches names case-insensitively and only claims Rails with Gemfile evidence', () => {
    expect(technologiesFromManifestFiles(['DOCKERFILE', 'Config.ru'])).toEqual(['Docker'])
    expect(technologiesFromManifestFiles(['config.ru', 'Gemfile'])).toEqual(['Bundler', 'Rails'])
  })
})
