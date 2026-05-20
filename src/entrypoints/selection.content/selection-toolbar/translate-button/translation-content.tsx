import type { ThinkingSnapshot } from "@/types/background-stream"
import { IconLoader2 } from "@tabler/icons-react"
import { Activity } from "react"
import { Thinking } from "@/components/thinking"
import { CopyButton } from "../../components/copy-button"
import { SelectionSourceContent } from "../../components/selection-source-content"
import { SpeakButton } from "../../components/speak-button"
import { QuickReplaceButton } from "../../components/quick-replace-button"
import type { TargetInputElementInfo } from "../../selection-toolbar/atoms"

interface TranslationContentProps {
  selectionContent: string | null | undefined
  translatedText: string | undefined
  isTranslating: boolean
  thinking: ThinkingSnapshot | null
  targetInputElement?: TargetInputElementInfo | null
}

export function TranslationContent({
  selectionContent,
  translatedText,
  isTranslating,
  thinking,
  targetInputElement,
}: TranslationContentProps) {
  const showLoadingIndicator = isTranslating && !thinking && !translatedText
  const showStreamingIndicator = isTranslating && !thinking && translatedText
  return (
    <div className="p-4">
      <div className="space-y-2">
        {thinking && (
          <Thinking status={thinking.status} content={thinking.text} />
        )}
        <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          {showLoadingIndicator && <IconLoader2 className="inline size-4 animate-spin" strokeWidth={1.6} />}
          {translatedText}
          {showStreamingIndicator && " ●"}
        </p>
        <Activity mode={translatedText ? "visible" : "hidden"}>
          <div className="flex items-center gap-1">
            <CopyButton text={translatedText} />
            <SpeakButton text={translatedText} />
            <QuickReplaceButton text={translatedText} target={targetInputElement ?? null} />
          </div>
        </Activity>
      </div>
    </div>
  )
}
