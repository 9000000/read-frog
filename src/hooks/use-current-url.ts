import { useSyncExternalStore } from "react"

/**
 * Subscribes to URL changes via native browser events and a polling fallback.
 *
 * Defined at module level so the function reference is stable across renders,
 * which is required by `useSyncExternalStore`.
 */
function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener("popstate", onStoreChange)
  window.addEventListener("hashchange", onStoreChange)
  window.addEventListener("pageshow", onStoreChange)
  window.addEventListener("extension:URLChange", onStoreChange)

  // Fallback polling catches pushState/replaceState changes that are not
  // intercepted by the host content script (e.g. when host.content didn't
  // load, or third-party routers replace history methods after the
  // extension's monkey-patch).
  const interval = setInterval(onStoreChange, 500)

  return () => {
    window.removeEventListener("popstate", onStoreChange)
    window.removeEventListener("hashchange", onStoreChange)
    window.removeEventListener("pageshow", onStoreChange)
    window.removeEventListener("extension:URLChange", onStoreChange)
    clearInterval(interval)
  }
}

function getSnapshot(): string {
  return window.location.href
}

/**
 * React hook that reactively tracks `window.location.href`.
 *
 * Uses `useSyncExternalStore` to avoid the stale-closure and
 * listener-gap issues that plague `useState` + `useEffect` approaches.
 */
export function useCurrentUrl(): string {
  return useSyncExternalStore(subscribe, getSnapshot)
}
