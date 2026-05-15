import type { CSSProperties } from "react"
import { useAtomValue } from "jotai"
import { useMemo } from "react"
import { configFieldsAtomMap } from "@/utils/atoms/config"

export function useSelectionPopoverThemeStyles() {
  const selectionToolbarConfig = useAtomValue(configFieldsAtomMap.selectionToolbar)

  return useMemo(() => {
    const bg = selectionToolbarConfig.theme?.backgroundColor
    const text = selectionToolbarConfig.theme?.textColor

    if (!bg && !text) {
      return {}
    }

    const styles: CSSProperties = {}
    if (bg) {
      styles.backgroundColor = bg
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(styles as any)["--rf-popover"] = bg
    }
    if (text) {
      styles.color = text
    }

    // Override popover-specific theme variables dynamically using currentColor
    // so that children (which use tailwind text-secondary-foreground, bg-accent etc.)
    // adapt correctly to the overridden background and text colors.
    const s = styles as any
    s["--rf-popover-foreground"] = "currentColor"
    s["--rf-foreground"] = "currentColor"
    s["--rf-secondary-foreground"] = "currentColor"
    s["--rf-muted-foreground"] = "color-mix(in srgb, currentColor 70%, transparent)"
    s["--rf-accent-foreground"] = "currentColor"
    s["--rf-secondary"] = "color-mix(in srgb, currentColor 10%, transparent)"
    s["--rf-accent"] = "color-mix(in srgb, currentColor 15%, transparent)"
    s["--rf-muted"] = "color-mix(in srgb, currentColor 10%, transparent)"
    s["--rf-border"] = "color-mix(in srgb, currentColor 15%, transparent)"

    return styles
  }, [selectionToolbarConfig.theme])
}
