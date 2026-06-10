import { useEffect, useState } from "react"

export function useCurrentUrl(): string {
  const [url, setUrl] = useState(() => typeof window !== "undefined" ? window.location.href : "")

  useEffect(() => {
    if (typeof window === "undefined")
      return

    const handleUrlChange = () => {
      setUrl(window.location.href)
    }

    window.addEventListener("popstate", handleUrlChange)
    window.addEventListener("hashchange", handleUrlChange)
    window.addEventListener("pageshow", handleUrlChange)
    window.addEventListener("extension:URLChange", handleUrlChange)

    const interval = setInterval(() => {
      if (window.location.href !== url) {
        setUrl(window.location.href)
      }
    }, 1000)

    return () => {
      window.removeEventListener("popstate", handleUrlChange)
      window.removeEventListener("hashchange", handleUrlChange)
      window.removeEventListener("pageshow", handleUrlChange)
      window.removeEventListener("extension:URLChange", handleUrlChange)
      clearInterval(interval)
    }
  }, [url])

  return url
}
