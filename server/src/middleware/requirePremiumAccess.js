import { AppError } from '../lib/errors.js'
import { getStudyAccess } from '../services/studyAccess.js'

export async function requirePremiumAccess(request, _response, next) {
  try {
    if (!request.supabase && process.env.NODE_ENV !== 'production') {
      next()
      return
    }
    const access = await getStudyAccess(request)
    request.studyAccess = access
    if (!access.premiumActive && !access.isAdmin) {
      throw new AppError(403, 'PREMIUM_REQUIRED', 'Quiz Maker and Exam Preparation are available with StudyMate Premium.')
    }
    next()
  } catch (error) {
    next(error)
  }
}
