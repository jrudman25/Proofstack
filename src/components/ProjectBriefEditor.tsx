'use client'

import { useState } from 'react'
import type { ProjectBrief, ProjectLifecycleStatus } from '@/types'
import { Button } from '@/components/ui/button'
import { Check, Save } from 'lucide-react'

const NARRATIVE_FIELDS = [
  { key: 'purpose', label: 'Purpose', prompt: 'What problem does this project solve, and for whom?' },
  { key: 'inspiration', label: 'Inspiration', prompt: 'What motivated the project or shaped its direction?' },
  { key: 'role_and_contributions', label: 'Role and contributions', prompt: 'What did you personally own or contribute?' },
  { key: 'architecture_and_decisions', label: 'Architecture and key decisions', prompt: 'Describe the system shape and the tradeoffs behind important decisions.' },
  { key: 'challenges_and_solutions', label: 'Challenges and solutions', prompt: 'What was difficult, and how did you work through it?' },
  { key: 'outcomes_and_impact', label: 'Outcomes and impact', prompt: 'What changed, shipped, improved, or was learned?' },
  { key: 'lessons_learned', label: 'Lessons learned', prompt: 'What would you repeat or approach differently next time?' },
  { key: 'interview_talking_points', label: 'Interview talking points', prompt: 'Capture the details you want ready before a technical interview.' },
] as const

type NarrativeKey = (typeof NARRATIVE_FIELDS)[number]['key']
type BriefForm = Record<NarrativeKey, string> & {
  visibility: 'private' | 'public'
  lifecycleStatus: ProjectLifecycleStatus | ''
  ownerVerified: boolean
}

function initialForm(brief?: ProjectBrief | null): BriefForm {
  return {
    visibility: brief?.visibility ?? 'private',
    lifecycleStatus: brief?.lifecycle_status ?? '',
    ownerVerified: Boolean(brief?.owner_verified_at),
    purpose: brief?.purpose ?? '',
    inspiration: brief?.inspiration ?? '',
    role_and_contributions: brief?.role_and_contributions ?? '',
    architecture_and_decisions: brief?.architecture_and_decisions ?? '',
    challenges_and_solutions: brief?.challenges_and_solutions ?? '',
    outcomes_and_impact: brief?.outcomes_and_impact ?? '',
    lessons_learned: brief?.lessons_learned ?? '',
    interview_talking_points: brief?.interview_talking_points ?? '',
  }
}

export default function ProjectBriefEditor({ projectId, initialBrief }: { projectId: string; initialBrief?: ProjectBrief | null }) {
  const [form, setForm] = useState(() => initialForm(initialBrief))
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [lastReviewed, setLastReviewed] = useState(initialBrief?.last_reviewed_at ?? null)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsSaving(true)
    setMessage('')
    try {
      const response = await fetch(`/api/projects/${projectId}/brief`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, lifecycleStatus: form.lifecycleStatus || null }),
      })
      if (!response.ok) {
        setMessage('Unable to save the project brief. Please try again.')
        return
      }
      const result = await response.json() as { brief: ProjectBrief }
      setLastReviewed(result.brief.last_reviewed_at)
      setMessage('Project brief saved.')
    } catch {
      setMessage('Unable to save the project brief. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section aria-labelledby="brief-heading" className="corner-ticks relative border border-line bg-surface">
      <div className="flex flex-col gap-4 border-b border-line px-6 py-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="brief-heading" className="text-xl font-semibold tracking-tight">Project brief</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-dim">
            Your own account of the project: the context GitHub cannot show. Private unless you select it for a future public profile.
          </p>
        </div>
        <div className="eyebrow text-faint">
          {lastReviewed ? `Reviewed ${new Date(lastReviewed).toISOString().slice(0, 10)}` : 'Not yet reviewed'}
        </div>
      </div>

      <form aria-label="Edit project brief" onSubmit={handleSubmit} className="space-y-7 p-6">
        <div className="grid gap-5 md:grid-cols-2">
          <label className="space-y-2">
            <span className="eyebrow text-dim">Lifecycle status</span>
            <select
              aria-label="Lifecycle status"
              value={form.lifecycleStatus}
              onChange={event => setForm(current => ({ ...current, lifecycleStatus: event.target.value as BriefForm['lifecycleStatus'] }))}
              className="field px-3 py-2.5 font-sans"
            >
              <option value="">Not specified</option>
              <option value="prototype">Prototype</option>
              <option value="active">Active development</option>
              <option value="maintained">Maintained</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="eyebrow text-dim">Portfolio visibility</span>
            <select
              aria-label="Portfolio visibility"
              value={form.visibility}
              onChange={event => setForm(current => ({ ...current, visibility: event.target.value as BriefForm['visibility'] }))}
              className="field px-3 py-2.5 font-sans"
            >
              <option value="private">Private workspace</option>
              <option value="public">Selected for future public profile</option>
            </select>
          </label>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {NARRATIVE_FIELDS.map(({ key, label, prompt }, index) => (
            <label key={key} className={`space-y-2 ${(index > 1 || key === 'role_and_contributions') ? 'md:col-span-2' : ''}`}>
              <span className="eyebrow text-dim">{label}</span>
              <textarea
                aria-label={label}
                maxLength={4000}
                rows={key === 'purpose' || key === 'inspiration' ? 4 : 5}
                value={form[key]}
                placeholder={prompt}
                onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))}
                className="field resize-y px-3 py-3 font-sans leading-relaxed"
              />
            </label>
          ))}
        </div>

        <div className="flex flex-col gap-4 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex cursor-pointer items-start gap-3 text-sm text-foreground/90">
            <input
              type="checkbox"
              checked={form.ownerVerified}
              onChange={event => setForm(current => ({ ...current, ownerVerified: event.target.checked }))}
              className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]"
            />
            <span>
              <span className="flex items-center gap-1.5 font-medium">
                {form.ownerVerified && <Check className="h-3.5 w-3.5 text-brand" />}
                Mark this content as owner reviewed
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-faint">Only verify statements you are comfortable presenting as your own.</span>
            </span>
          </label>

          <div className="flex items-center justify-end gap-4">
            {message && <span role="status" className="font-mono text-[11px] text-dim">{message}</span>}
            <Button type="submit" disabled={isSaving} className="eyebrow">
              <Save className="h-3.5 w-3.5" />
              {isSaving ? 'Saving' : 'Save brief'}
            </Button>
          </div>
        </div>
      </form>
    </section>
  )
}
