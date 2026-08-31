export interface Session {
  userId: string
  expiresAt: number
  refreshToken: string
}

const sessions = new Map<string, Session>()
const REFRESH_WINDOW_MS = 5 * 60 * 1000

export function createSession(userId: string, ttlMs: number): Session {
  const session: Session = {
    userId,
    expiresAt: Date.now() + ttlMs,
    refreshToken: generateRefreshToken(),
  }
  sessions.set(userId, session)
  return session
}

export function getSession(userId: string): Session | undefined {
  return sessions.get(userId)
}

export function isSessionValid(session: Session): boolean {
  return Date.now() <= session.expiresAt
}

export function refreshSession(session: Session): Session {
  const withinWindow = session.expiresAt - Date.now() < REFRESH_WINDOW_MS
  if (!withinWindow) return session
  session.expiresAt = Date.now() + REFRESH_WINDOW_MS
  session.refreshToken = generateRefreshToken()
  return session
}

export function destroySession(userId: string): void {
  sessions.delete(userId)
}

function generateRefreshToken(): string {
  return Math.random().toString(36).slice(2)
}
