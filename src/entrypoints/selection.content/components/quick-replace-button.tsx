import { IconCheck, IconCornerDownLeft, IconEdit } from "@tabler/icons-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { i18n } from "#imports"
import { buttonVariants } from "@/components/ui/base-ui/button"
import { cn } from "@/utils/styles/utils"
import { INPUT_REPLACE_REQUEST_TYPE } from "@/utils/constants/input-injector"
import { SelectionPopoverTooltip, useSelectionTooltipState } from "./selection-tooltip"
import type { TargetInputElementInfo } from "../selection-toolbar/atoms"

interface QuickReplaceButtonProps {
  text: string | undefined
  target: TargetInputElementInfo | null
}

export function QuickReplaceButton({ text, target }: QuickReplaceButtonProps) {
  const [replaced, setReplaced] = useState(false)
  const { handlePress, onOpenChange: handleTooltipOpenChange, open: tooltipOpen } = useSelectionTooltipState()
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    return () => {
      if (timerRef.current)
        clearTimeout(timerRef.current)
    }
  }, [])

  const handleReplace = useCallback(() => {
    if (!text || !target)
      return

    const { element, selectionStart, selectionEnd, range, isContentEditable, isSlate } = target

    try {
      // Focus target element first
      element.focus()

      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        if (typeof selectionStart === "number" && typeof selectionEnd === "number") {
          element.setSelectionRange(selectionStart, selectionEnd)
        }
        document.execCommand("insertText", false, text)
        element.dispatchEvent(new Event("input", { bubbles: true }))
      } else if (isContentEditable) {
        if (isSlate) {
          window.postMessage({ type: INPUT_REPLACE_REQUEST_TYPE, text }, window.location.origin)
        } else {
          const sel = window.getSelection()
          if (sel && range) {
            sel.removeAllRanges()
            sel.addRange(range)
          }
          document.execCommand("insertText", false, text)
        }
      }

      setReplaced(true)
      handlePress()
      if (timerRef.current)
        clearTimeout(timerRef.current)
      timerRef.current = setTimeout(setReplaced, 1500, false)
    } catch (err) {
      console.error("Failed to execute quick replace:", err)
    }
  }, [handlePress, text, target])

  if (!target)
    return null

  return (
    <SelectionPopoverTooltip
      content={replaced ? i18n.t("action.quickReplaced") : i18n.t("action.quickReplace")}
      open={tooltipOpen}
      onOpenChange={handleTooltipOpenChange}
      render={(
        <button
          type="button"
          className={cn(buttonVariants({ variant: "ghost-secondary", size: "icon-sm" }))}
          onClick={handleReplace}
        />
      )}
    >
      {replaced ? (
        <IconCheck className="text-green-500" />
      ) : (
        <IconCornerDownLeft />
      )}
    </SelectionPopoverTooltip>
  )
}
