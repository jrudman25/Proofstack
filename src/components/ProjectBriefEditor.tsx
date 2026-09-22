'use client'

import { useEffect, useRef, useState } from 'react'
import type { ProjectBrief, ProjectLifecycleStatus, PublishableBriefField } from '@/types'
import { Button } from '@/components/ui/button'
import { Check, Pencil, Save } from 'lucide-react'
import { BRIEF_BODY_BYTES, BRIEF_FIELD_LIMIT, BRIEF_TOTAL_LIMIT, PUBLISHABLE_BRIEF_FIELDS } from '@/lib/project-brief'
import { clientErrorMessage } from '@/lib/client-error-message'

const NARRATIVE_FIELDS = [
  { key: 'purpose', label: 'Purpose', prompt: 'What problem does this project solve, and for whom?', primary: true },
  { key: 'inspiration', label: 'Inspiration', prompt: 'What motivated the project or shaped its direction?', primary: false },
  { key: 'role_and_contributions', label: 'Role and contributions', prompt: 'What did you personally own or contribute?', primary: true },
  { key: 'architecture_and_decisions', label: 'Architecture and key decisions', prompt: 'Describe the system shape and the tradeoffs behind important decisions.', primary: false },
  { key: 'challenges_and_solutions', label: 'Challenges and solutions', prompt: 'What was difficult, and how did you work through it?', primary: true },
  { key: 'outcomes_and_impact', label: 'Outcomes and impact', prompt: 'What changed, shipped, improved, or was learned?', primary: false },
  { key: 'lessons_learned', label: 'Lessons learned', prompt: 'What would you repeat or approach differently next time?', primary: false },
  { key: 'interview_talking_points', label: 'Interview talking points', prompt: 'Capture the details you want ready before a technical interview.', primary: true },
] as const

type NarrativeKey = (typeof NARRATIVE_FIELDS)[number]['key']
type BriefForm = Record<NarrativeKey, string> & {
  visibility: 'private' | 'public'
  lifecycleStatus: ProjectLifecycleStatus | ''
  ownerVerified: boolean
  publishedFields: PublishableBriefField[]
}

// Every publishable field with its display label. interview_talking_points is
// never offered: it is private interview preparation.
const PUBLISHABLE_OPTIONS: { key: PublishableBriefField; label: string }[] = [
  { key: 'lifecycle_status', label: 'Lifecycle status' },
  ...NARRATIVE_FIELDS.filter(({ key }) => PUBLISHABLE_BRIEF_FIELDS.includes(key as PublishableBriefField))
    .map(({ key, label }) => ({ key: key as PublishableBriefField, label })),
]

function initialForm(brief?: ProjectBrief | null): BriefForm {
  return {
    visibility: brief?.visibility ?? 'private',
    lifecycleStatus: brief?.lifecycle_status ?? '',
    ownerVerified: Boolean(brief?.owner_verified_at),
    publishedFields: brief?.published_fields ?? [],
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

const serialize = (form: BriefForm) => JSON.stringify(form)
const hasContent = (brief?: ProjectBrief | null) =>
  Boolean(brief && NARRATIVE_FIELDS.some(({ key }) => brief[key]?.trim()))

const LIFECYCLE_LABELS: Record<ProjectLifecycleStatus, string> = {
  prototype: 'Prototype', active: 'Active development', maintained: 'Maintained', completed: 'Completed', archived: 'Archived',
}

export default function ProjectBriefEditor({ projectId, initialBrief, onDirtyChange }: {
  projectId: string
  initialBrief?: ProjectBrief | null
  onDirtyChange?: (dirty: boolean) => void
}) {
  const [form, setForm] = useState(() => initialForm(initialBrief))
  const [saved, setSaved] = useState(() => ({ snapshot: serialize(initialForm(initialBrief)), updatedAt: initialBrief?.updated_at ?? null }))
  const [editing, setEditing] = useState(() => !hasContent(initialBrief))
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [conflict, setConflict] = useState(false)
  const [lastReviewed, setLastReviewed] = useState(initialBrief?.last_reviewed_at ?? null)
  // Refs let the save handler compare the submitted snapshot against whatever
  // the owner typed while the request was in flight.
  const formRef = useRef(form)
  const savedRef = useRef(saved)
  useEffect(() => {
    formRef.current = form
    savedRef.current = saved
  })

  const dirty = serialize(form) !== saved.snapshot

  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const totalLength = NARRATIVE_FIELDS.reduce((sum, { key }) => sum + form[key].length, 0)
  const payloadBytes = () => new TextEncoder().encode(JSON.stringify({ ...form, lifecycleStatus: form.lifecycleStatus || null, baseUpdatedAt: savedRef.current.updatedAt })).length

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (payloadBytes() > BRIEF_BODY_BYTES) {
      setMessage(`The brief is too large to save. Keep the total under ${BRIEF_TOTAL_LIMIT.toLocaleString()} characters.`)
      return
    }
    const submitted = formRef.current
    const baseUpdatedAt = savedRef.current.updatedAt
    setIsSaving(true)
    setMessage('')
    setConflict(false)
    try {
      const response = await fetch(`/api/projects/${projectId}/brief`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...submitted, lifecycleStatus: submitted.lifecycleStatus || null, baseUpdatedAt }),
      })
      const result = await response.json()
      if (response.status === 409) {
        setConflict(true)
        setMessage('This brief was updated elsewhere. Reload the latest version before saving.')
        return
      }
      if (!response.ok) {
        setMessage(clientErrorMessage(response, result, 'Unable to save the project brief. Please try again.'))
        return
      }
      const brief = result.brief as ProjectBrief
      setLastReviewed(brief.last_reviewed_at)
      // If the owner kept typing during the save, the form is ahead of the
      // saved snapshot: keep the newer text and mark it unsaved instead of
      // describing an older snapshot as fully saved.
      const submittedSnapshot = serialize(submitted)
      setSaved({ snapshot: submittedSnapshot, updatedAt: brief.updated_at })
      setMessage(serialize(formRef.current) === submittedSnapshot
        ? 'Project brief saved.'
        : 'Saved. You have newer unsaved changes.')
    } catch {
      setMessage('Unable to save the project brief. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const reloadLatest = async () => {
    setIsSaving(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/brief`)
      const result = await response.json()
      if (!response.ok) throw new Error('Reload failed')
      const brief = result.brief as ProjectBrief | null
      const next = initialForm(brief)
      setForm(next)
      setSaved({ snapshot: serialize(next), updatedAt: brief?.updated_at ?? null })
      setLastReviewed(brief?.last_reviewed_at ?? null)
      setConflict(false)
      setMessage('Latest version loaded.')
    } catch {
      setMessage('Unable to load the latest brief. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const set = (key: NarrativeKey, value: string) => setForm(current => ({ ...current, [key]: value }))
  const togglePublished = (field: PublishableBriefField) => setForm(current => ({
    ...current,
    publishedFields: current.publishedFields.includes(field)
      ? current.publishedFields.filter(item => item !== field)
      : [...current.publishedFields, field],
  }))

  const reviewedBadge = (
    <div className="eyebrow text-dim">
      {lastReviewed ? `Reviewed ${new Date(lastReviewed).toISOString().slice(0, 10)}` : 'Not yet reviewed'}
    </div>
  )

  // Read-first: a brief with content opens as readable sections; the form is
  // an explicit Edit mode.
  if (!editing && initialBrief) {
    const brief = initialBrief
    const filled = NARRATIVE_FIELDS.filter(({ key }) => brief[key]?.trim())
    return (
      <section aria-labelledby="brief-heading" className="corner-ticks relative border border-line bg-surface">
        <div className="flex flex-col gap-4 border-b border-line px-6 py-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="brief-heading" className="text-xl font-semibold tracking-tight">Project brief</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-dim">
              Your own account of the project{form.ownerVerified ? ', marked as owner reviewed' : ''}.
            </p>
          </div>
          <div className="flex items-center gap-4">
            {reviewedBadge}
            <Button variant="outline" onClick={() => setEditing(true)} className="eyebrow">
              <Pencil className="h-3.5 w-3.5" /> Edit brief
            </Button>
          </div>
        </div>
        <dl className="space-y-6 p-6">
          {brief.lifecycle_status && (
            <div>
              <dt className="eyebrow text-dim">Lifecycle status</dt>
              <dd className="mt-1 text-sm text-foreground">{LIFECYCLE_LABELS[brief.lifecycle_status]}</dd>
            </div>
          )}
          {filled.map(({ key, label }) => (
            <div key={key}>
              <dt className="eyebrow text-dim">{label}</dt>
              <dd className="mt-1 max-w-3xl whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{brief[key]}</dd>
            </div>
          ))}
        </dl>
      </section>
    )
  }

  return (
    <section aria-labelledby="brief-heading" className="corner-ticks relative border border-line bg-surface">
      <div className="flex flex-col gap-4 border-b border-line px-6 py-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="brief-heading" className="text-xl font-semibold tracking-tight">Project brief</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-dim">
            Your own account of the project: the context GitHub cannot show. Private unless you select it for your public profile.
          </p>
        </div>
        <div className="flex items-center gap-4">
          {reviewedBadge}
          {hasContent(initialBrief) && (
            <Button variant="ghost" onClick={() => { setForm(initialForm(initialBrief)); setEditing(false); setMessage(''); setConflict(false) }} className="eyebrow">
              Done editing
            </Button>
          )}
        </div>
      </div>

      <form aria-label="Edit project brief" onSubmit={handleSubmit} className="space-y-7 p-6">
        <fieldset disabled={isSaving} className="space-y-7 disabled:opacity-70">
          <div className="grid gap-5 md:grid-cols-2">
            {NARRATIVE_FIELDS.filter(({ primary }) => primary).map(({ key, label, prompt }) => (
              <label key={key} className="space-y-2 md:col-span-2">
                <span className="eyebrow flex items-baseline justify-between text-dim">
                  {label}
                  <span className="font-mono text-[10px] normal-case tracking-normal text-dim">{form[key].length}/{BRIEF_FIELD_LIMIT}</span>
                </span>
                <textarea
                  aria-label={label}
                  maxLength={BRIEF_FIELD_LIMIT}
                  rows={key === 'purpose' ? 4 : 5}
                  value={form[key]}
                  placeholder={prompt}
                  onChange={event => set(key, event.target.value)}
                  className="field resize-y px-3 py-3 font-sans leading-relaxed"
                />
              </label>
            ))}
          </div>

          <details className="border border-line">
            <summary className="label cursor-pointer select-none px-4 py-3 text-dim transition-colors hover:text-foreground">
              More context
              <span className="ml-3 font-normal normal-case tracking-normal text-dim">Inspiration, architecture, outcomes, lessons</span>
            </summary>
            <div className="grid gap-5 border-t border-line p-5 md:grid-cols-2">
              {NARRATIVE_FIELDS.filter(({ primary }) => !primary).map(({ key, label, prompt }) => (
                <label key={key} className="space-y-2 md:col-span-2">
                  <span className="eyebrow flex items-baseline justify-between text-dim">
                    {label}
                    <span className="font-mono text-[10px] normal-case tracking-normal text-dim">{form[key].length}/{BRIEF_FIELD_LIMIT}</span>
                  </span>
                  <textarea
                    aria-label={label}
                    maxLength={BRIEF_FIELD_LIMIT}
                    rows={5}
                    value={form[key]}
                    placeholder={prompt}
                    onChange={event => set(key, event.target.value)}
                    className="field resize-y px-3 py-3 font-sans leading-relaxed"
                  />
                </label>
              ))}
            </div>
          </details>

          <details className="border border-line">
            <summary className="label cursor-pointer select-none px-4 py-3 text-dim transition-colors hover:text-foreground">
              Settings
              <span className="ml-3 font-normal normal-case tracking-normal text-dim">Lifecycle status and public profile visibility</span>
            </summary>
            <div className="grid gap-5 border-t border-line p-5 md:grid-cols-2">
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
                  <option value="public">Selected for public profile</option>
                </select>
                <span className="block text-xs leading-relaxed text-dim">Appears on your public profile only while the profile itself is published from Account.</span>
              </label>

              {form.visibility === 'public' && (
                <fieldset className="space-y-3 md:col-span-2">
                  <legend className="eyebrow text-dim">Fields on your public profile</legend>
                  <p className="text-xs leading-relaxed text-dim">
                    Checked fields appear publicly. Interview talking points stay private and are never publishable.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {PUBLISHABLE_OPTIONS.map(({ key, label }) => (
                      <label key={key} className="flex cursor-pointer items-center gap-2.5 text-sm text-foreground/90">
                        <input
                          type="checkbox"
                          checked={form.publishedFields.includes(key)}
                          onChange={() => togglePublished(key)}
                          className="h-4 w-4 accent-[var(--color-brand)]"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
            </div>
          </details>

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
                <span className="mt-0.5 block text-xs leading-relaxed text-dim">Only verify statements you are comfortable presenting as your own.</span>
              </span>
            </label>

            <div className="flex items-center justify-end gap-4">
              <span className="font-mono text-[10px] text-dim">{totalLength.toLocaleString()}/{BRIEF_TOTAL_LIMIT.toLocaleString()}</span>
              {message && <span role="status" className="font-mono text-[11px] text-dim">{message}</span>}
              {conflict && (
                <Button type="button" variant="outline" onClick={reloadLatest} className="eyebrow">Reload latest</Button>
              )}
              <Button type="submit" disabled={isSaving || !dirty} className="eyebrow">
                <Save className="h-3.5 w-3.5" />
                {isSaving ? 'Saving' : 'Save brief'}
              </Button>
            </div>
          </div>
        </fieldset>
      </form>
    </section>
  )
}
