import { NextResponse } from 'next/server'
import { authenticateUser } from '@/lib/api-auth'
import { ApiError, apiErrorResponse } from '@/lib/api-validation'
import { enforceRateLimit } from '@/lib/rate-limit'
import { createAdminClient } from '@/utils/supabase/admin'

// Deletes the authenticated user's account. Removing the Auth user cascades to
// the profile, projects, briefs, briefings, embeddings, and the stored GitHub
// credential. The client signs out afterwards.
export async function DELETE() {
  try {
    const auth = await authenticateUser()
    await enforceRateLimit(auth, 'account')
    const { error } = await createAdminClient().auth.admin.deleteUser(auth.userId)
    if (error) throw new ApiError(503, 'Service temporarily unavailable')
    return NextResponse.json({ deleted: true })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
