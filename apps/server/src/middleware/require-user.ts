import { createMiddleware } from "hono/factory"
import { auth } from "../auth"

export interface RequireUserVariables {
  user: { id: string; email: string; name: string | null; image: string | null }
  sessionId: string
}

export const requireUser = createMiddleware<{
  Variables: RequireUserVariables
}>(async (c, next) => {
  const session = await auth.api
    .getSession({ headers: c.req.raw.headers })
    .catch(() => null)

  if (!session) {
    return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401)
  }

  c.set("user", {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name ?? null,
    image: session.user.image ?? null,
  })
  c.set("sessionId", session.session.id)
  await next()
})
