import { NextResponse } from 'next/server'
import { authenticateUser } from '@/lib/api-auth'
import { ApiError, apiErrorResponse } from '@/lib/api-validation'
import { enforceRateLimit } from '@/lib/rate-limit'

const PAGE_SIZE = 1000

type EmbeddedProject = { name?: unknown } | { name?: unknown }[] | null

const projectName = (value: EmbeddedProject): string => {
  const row = Array.isArray(value) ? value[0] : value
  return row && typeof row.name === 'string' ? row.name : ''
}

type TaskRow = {
  id: string
  project_id: string
  task: string
  is_completed: boolean
  created_at: string
  projects: EmbeddedProject
}

type MilestoneRow = {
  id: string
  project_id: string
  title: string
  description: string | null
  status: string
  due_date: string | null
  created_at: string
  projects: EmbeddedProject
}

type ExportedTask = { id: string; projectId: string; projectName: string; task: string; completed: boolean; createdAt: string }
type ExportedMilestone = { id: string; projectId: string; projectName: string; title: string; description: string | null; status: string; dueDate: string | null; createdAt: string }

export async function GET() {
  try {
    const auth = await authenticateUser()
    await enforceRateLimit(auth, 'account')

    const tasks: ExportedTask[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await auth.supabase.from('todos')
        .select('id, project_id, task, is_completed, created_at, projects!inner(name, user_id)')
        .eq('projects.user_id', auth.userId)
        .order('created_at', { ascending: true })
        .range(from, from + 999)
      if (error) throw new ApiError(503, 'Service temporarily unavailable')
      for (const row of (data || []) as TaskRow[]) {
        tasks.push({
          id: row.id,
          projectId: row.project_id,
          projectName: projectName(row.projects),
          task: row.task,
          completed: Boolean(row.is_completed),
          createdAt: row.created_at,
        })
      }
      if (!data || data.length < PAGE_SIZE) break
    }

    const milestones: ExportedMilestone[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await auth.supabase.from('milestones')
        .select('id, project_id, title, description, status, due_date, created_at, projects!inner(name, user_id)')
        .eq('projects.user_id', auth.userId)
        .order('created_at', { ascending: true })
        .range(from, from + 999)
      if (error) throw new ApiError(503, 'Service temporarily unavailable')
      for (const row of (data || []) as MilestoneRow[]) {
        milestones.push({
          id: row.id,
          projectId: row.project_id,
          projectName: projectName(row.projects),
          title: row.title,
          description: row.description ?? null,
          status: row.status,
          dueDate: row.due_date ?? null,
          createdAt: row.created_at,
        })
      }
      if (!data || data.length < PAGE_SIZE) break
    }

    return NextResponse.json(
      { exportedAt: new Date().toISOString(), tasks, milestones },
      {
        headers: {
          'Content-Disposition': 'attachment; filename="proofstack-legacy-tasks.json"',
          'Cache-Control': 'private, no-store',
        },
      },
    )
  } catch (error) {
    return apiErrorResponse(error)
  }
}
