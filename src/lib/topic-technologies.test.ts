import { describe, expect, it } from 'vitest'
import { technologiesFromTopics } from './topic-technologies'

describe('topic technology detection', () => {
  it('maps owner-curated GitHub topics to technology labels', () => {
    expect(technologiesFromTopics(['nextjs', 'tailwindcss', 'fly-io', 'tanstack-router']))
      .toEqual(['Next.js', 'Tailwind CSS', 'Fly.io', 'TanStack Router'])
  })

  it('ignores topics that are not technologies and deduplicates label variants', () => {
    expect(technologiesFromTopics(['hacktoberfest', 'postgres', 'postgresql', 'my-project']))
      .toEqual(['PostgreSQL'])
  })

  it('tolerates punctuation and case differences in topic spellings', () => {
    expect(technologiesFromTopics(['Fly.IO', 'React.JS', 'C++']))
      .toEqual(['Fly.io', 'React', 'C++'])
  })
})
