// Supabase query builders resolve to {data, error} rather than throwing, so
// a single transient network blip on any one of several parallel queries
// otherwise kills the whole page with a hard error the user has to
// manually reload past. Retrying a few times with a short backoff makes
// that invisible in the common case without masking a real, persistent
// failure.
export async function withRetry<R extends { error: unknown }>(fn: () => PromiseLike<R>, attempts = 3): Promise<R> {
  let result: R
  for (let i = 0; i < attempts; i++) {
    result = await fn()
    if (!result.error) return result
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 400 * (i + 1)))
    }
  }
  return result!
}
