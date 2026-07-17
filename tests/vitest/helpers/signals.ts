// next/navigation's redirect()/notFound() are mocked (see setup.ts) to throw these instead
// of Next's internal digest-tagged errors, so tests don't depend on Next's undocumented
// internal error shape to detect "a redirect happened."

export class RedirectSignal extends Error {
  constructor(public readonly url: string) {
    super(`REDIRECT:${url}`)
  }
}

export class NotFoundSignal extends Error {
  constructor() {
    super("NOT_FOUND")
  }
}

/** Calls fn(), expecting it to redirect. Returns the redirect target; re-throws any other error. */
export async function captureRedirect(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn()
  } catch (error) {
    if (error instanceof RedirectSignal) return error.url
    throw error
  }
  throw new Error("Expected a redirect, but the function returned normally")
}
