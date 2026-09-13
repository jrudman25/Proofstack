'use client'

import { useState } from 'react'
import { Project, ProjectBrief, Todo, Milestone } from '@/types'
import { Check, Plus, Trash2, ArrowLeft, Star } from 'lucide-react'
import { GithubIcon } from '@/components/icons/GithubIcon'
import { Button } from '@/components/ui/button'
import { languageColor } from '@/lib/language-colors'
import Link from 'next/link'
import ProjectBriefEditor from '@/components/ProjectBriefEditor'
import ChatWidget from '@/components/ChatWidget'

// We need an instance of supabase client here if we want to mutate data
import { createClient } from '@/utils/supabase/client'

export default function ProjectDetailClient({
  project,
  initialBrief,
  initialMilestones,
  initialTodos
}: {
  project: Project,
  initialBrief?: ProjectBrief | null,
  initialMilestones: Milestone[],
  initialTodos: Todo[]
}) {
  const supabase = createClient()
  const [todos, setTodos] = useState<Todo[]>(initialTodos)
  const [milestones, setMilestones] = useState<Milestone[]>(initialMilestones)

  const [newTodo, setNewTodo] = useState('')
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('')

  const handleAddTodo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTodo.trim()) return

    const { data } = await supabase.from('todos').insert({
      project_id: project.id,
      task: newTodo
    }).select().single()

    if (data) {
      setTodos([...todos, data])
      setNewTodo('')
    }
  }

  const handleToggleTodo = async (id: string, isCompleted: boolean) => {
    const { error } = await supabase.from('todos').update({ is_completed: !isCompleted }).eq('id', id)
    if (!error) {
      setTodos(todos.map(t => t.id === id ? { ...t, is_completed: !isCompleted } : t))
    }
  }

  const handleDeleteTodo = async (id: string) => {
    const { error } = await supabase.from('todos').delete().eq('id', id)
    if (!error) {
      setTodos(todos.filter(t => t.id !== id))
    }
  }

  const handleAddMilestone = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMilestoneTitle.trim()) return

    const { data } = await supabase.from('milestones').insert({
      project_id: project.id,
      title: newMilestoneTitle,
      status: 'pending'
    }).select().single()

    if (data) {
      setMilestones([...milestones, data])
      setNewMilestoneTitle('')
    }
  }

  const handleToggleMilestone = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed'
    const { error } = await supabase.from('milestones').update({ status: newStatus }).eq('id', id)
    if (!error) {
      setMilestones(milestones.map(m => m.id === id ? { ...m, status: newStatus } : m))
    }
  }

  const openMilestones = milestones.filter(m => m.status !== 'completed').length
  const openTodos = todos.filter(t => !t.is_completed).length
  // Tasks and milestones are deprecated. Existing records stay readable and
  // editable behind a disclosure; projects without any are not offered the
  // feature at all.
  const hasLegacyRecords = milestones.length > 0 || todos.length > 0

  return (
    <div className="min-h-screen font-sans">
      <div className="mx-auto max-w-5xl space-y-8 px-6 py-10">

        <Link
          href="/"
          className="label inline-flex items-center gap-2 text-faint transition-colors hover:text-brand"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Dashboard
        </Link>

        <header className="corner-ticks relative border border-line bg-surface px-6 py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] text-faint">{project.full_name}</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">{project.name}</h1>
              {project.description && (
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-dim">{project.description}</p>
              )}
            </div>
            <a
              href={project.html_url}
              aria-label={`View ${project.name} on GitHub (opens in new tab)`}
              target="_blank"
              rel="noreferrer"
              className="eyebrow flex items-center gap-2 border border-line px-3 py-2 text-dim transition-colors hover:border-line-bright hover:text-foreground"
            >
              <GithubIcon className="h-3.5 w-3.5" />
              Source
            </a>
          </div>

          <div className="eyebrow mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-4 text-faint">
            {project.language && (
              <span className="flex items-center gap-1.5 text-dim">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: languageColor(project.language) }} />
                {project.language}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Star className="h-3 w-3 text-amber-300/80" />
              {project.stargazers_count}
            </span>
            {(project.technologies || []).slice(0, 6).map(tech => (
              <span key={tech} style={{ color: languageColor(tech) }}>{tech}</span>
            ))}
          </div>
        </header>

        <ProjectBriefEditor projectId={project.id} initialBrief={initialBrief} />

        {hasLegacyRecords && (
          <details className="corner-ticks relative border border-line bg-surface">
            <summary className="label cursor-pointer select-none px-6 py-4 text-faint transition-colors hover:text-foreground">
              Legacy tasks and milestones
              <span className="ml-3 font-normal tracking-normal normal-case">
                {openMilestones + openTodos} open. Task tracking is being retired; use the project brief instead.
              </span>
            </summary>

            <div className="grid grid-cols-1 gap-6 border-t border-line p-6 md:grid-cols-2">
              {/* Milestones */}
              <div>
                <h2 className="label flex items-baseline justify-between text-dim">
                  Milestones
                  <span className="eyebrow text-faint">{String(openMilestones).padStart(2, '0')} open</span>
                </h2>

                <div className="mb-6 mt-5 space-y-2">
                  {milestones.length === 0 ? (
                    <p className="font-mono text-[11px] italic text-faint">No milestones yet.</p>
                  ) : (
                    milestones.map(milestone => (
                      <div key={milestone.id} className="flex items-start gap-3 border border-line/60 bg-ink px-3 py-2.5">
                        <button
                          aria-label={`Complete milestone: ${milestone.title}`}
                          aria-pressed={milestone.status === 'completed'}
                          onClick={() => handleToggleMilestone(milestone.id, milestone.status)}
                          className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center border transition-colors ${
                            milestone.status === 'completed'
                              ? 'border-brand bg-brand/15'
                              : 'border-line-bright hover:border-brand'
                          }`}
                        >
                          {milestone.status === 'completed' && <Check className="h-3 w-3 text-brand" />}
                        </button>
                        <h3 className={`text-sm ${milestone.status === 'completed' ? 'text-faint line-through' : 'text-foreground'}`}>
                          {milestone.title}
                        </h3>
                      </div>
                    ))
                  )}
                </div>

                <form aria-label="Add milestone" onSubmit={handleAddMilestone} className="flex gap-2">
                  <div className="relative flex-1">
                    <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 select-none font-mono text-xs text-brand">
                      &gt;
                    </span>
                    <input
                      type="text"
                      aria-label="New milestone"
                      placeholder="New milestone..."
                      value={newMilestoneTitle}
                      onChange={e => setNewMilestoneTitle(e.target.value)}
                      className="field py-2 pl-8 pr-3"
                    />
                  </div>
                  <Button type="submit" variant="secondary" className="eyebrow">Add</Button>
                </form>
              </div>

              {/* Todos */}
              <div>
                <h2 className="label flex items-baseline justify-between text-dim">
                  Tasks
                  <span className="eyebrow text-faint">{String(openTodos).padStart(2, '0')} open</span>
                </h2>

                <div className="mb-6 mt-5 max-h-[400px] space-y-1 overflow-y-auto pr-2">
                  {todos.length === 0 ? (
                    <p className="font-mono text-[11px] italic text-faint">No tasks yet.</p>
                  ) : (
                    todos.map(todo => (
                      <div key={todo.id} className="group flex items-center justify-between px-2 py-1.5 transition-colors hover:bg-ink">
                        <div className="flex items-center gap-3">
                          <button
                            aria-label={`Complete task: ${todo.task}`}
                            aria-pressed={todo.is_completed}
                            onClick={() => handleToggleTodo(todo.id, todo.is_completed)}
                            className={`flex h-4 w-4 flex-shrink-0 items-center justify-center border transition-colors ${
                              todo.is_completed
                                ? 'border-brand bg-brand/15'
                                : 'border-line-bright hover:border-brand'
                            }`}
                          >
                            {todo.is_completed && <Check className="h-3 w-3 text-brand" />}
                          </button>
                          <span className={`text-sm ${todo.is_completed ? 'text-faint line-through' : 'text-foreground/90'}`}>
                            {todo.task}
                          </span>
                        </div>
                        <button
                          aria-label={`Delete task: ${todo.task}`}
                          onClick={() => handleDeleteTodo(todo.id)}
                          className="p-1 text-faint opacity-0 transition-all hover:text-red-400 focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <form aria-label="Add task" onSubmit={handleAddTodo} className="flex gap-2">
                  <div className="relative flex-1">
                    <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 select-none font-mono text-xs text-brand">
                      &gt;
                    </span>
                    <input
                      type="text"
                      aria-label="New task"
                      placeholder="New task..."
                      value={newTodo}
                      onChange={e => setNewTodo(e.target.value)}
                      className="field py-2 pl-8 pr-3"
                    />
                  </div>
                  <Button type="submit" variant="secondary" className="eyebrow">
                    <Plus className="h-3.5 w-3.5" /> Add
                  </Button>
                </form>
              </div>
            </div>
          </details>
        )}
      </div>

      <ChatWidget projectId={project.id} projectName={project.name} />
    </div>
  )
}
