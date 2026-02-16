export class AsyncTimeoutError extends Error {
  timeoutMs: number

  constructor(timeoutMs: number, message?: string) {
    super(message ?? `Request timed out after ${timeoutMs}ms`)
    this.name = 'AsyncTimeoutError'
    this.timeoutMs = timeoutMs
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs = 15000,
): Promise<T> {
  let timer: number | null = null

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => {
          reject(new AsyncTimeoutError(timeoutMs))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timer !== null) {
      window.clearTimeout(timer)
    }
  }
}

export function createRequestGuard() {
  let activeRequest = 0

  return {
    next() {
      activeRequest += 1
      return activeRequest
    },
    isLatest(requestId: number) {
      return requestId === activeRequest
    },
  }
}
