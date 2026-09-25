/**
 * Replaces Node's built-in global fetch with the profile's undici 8.11 fetch.
 * Node 22.18's built-in undici returns empty headers and a binary body for
 * external HTTPS inside this process; undici 8.11 from the profile node_modules
 * behaves correctly. Also publishes the working fetch as globalThis.__dshUndiciFetch
 * so pi-ai's OpenAI client can receive it explicitly (OpenAI SDK's default is
 * globalThis.fetch, which this shim also replaces).
 */
export const name = 'fetch-shim'
export const inject = []

/** @type {(() => void) | undefined} */
let restore

export async function apply(ctx) {
  const previous = globalThis.fetch
  try {
    const undici = await import('undici')
    if (typeof undici.fetch === 'function') {
      globalThis.fetch = undici.fetch
      globalThis.__dshUndiciFetch = undici.fetch
      restore = () => {
        globalThis.fetch = previous
        delete globalThis.__dshUndiciFetch
      }
    }
  } catch {
    // undici unavailable; keep Node's built-in fetch
  }
  ctx.effect(() => () => { restore?.(); restore = undefined }, 'fetch-shim: restore global fetch')
}
