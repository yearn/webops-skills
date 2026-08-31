export interface Session {
  userId: string
  expiresAt: number
}

const sessions = new Map<string, Session>()

export function createSession(userId: string, ttlMs: number): Session {
  const session: Session = { userId, expiresAt: Date.now() + ttlMs }
  sessions.set(userId, session)
  return session
}

export function getSession(userId: string): Session | undefined {
  return sessions.get(userId)
}

export function isSessionValid(session: Session): boolean {
  return Date.now() < session.expiresAt
}

export function destroySession(userId: string): void {
  sessions.delete(userId)
}
