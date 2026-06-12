import type { ReactNode } from "react"
import type { SelectionSession, SelectionToolbarTranslateRequestSlice } from "../atoms"
import type { SelectionToolbarInlineError } from "../inline-error"
import type { BackgroundTextStreamSnapshot, ThinkingSnapshot } from "@/types/background-stream"
import type { LLMProviderConfig, ProviderConfig } from "@/types/config/provider"
import { LANG_CODE_TO_EN_NAME } from "@read-frog/definitions"
import { useAtomValue, useSetAtom } from "jotai"
import { createContext, use, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Icon } from "@iconify/react"
import { Button } from "@/components/ui/base-ui/button"
import { detectLanguage } from "@/utils/content/language"
import { SelectionPopover } from "@/components/ui/selection-popover"
import { ANALYTICS_FEATURE, ANALYTICS_SURFACE } from "@/types/analytics"
import { isLLMProviderConfig, isTranslateProviderConfig } from "@/types/config/provider"
import { createFeatureUsageContext, trackFeatureUsed } from "@/utils/analytics"
import { configFieldsAtomMap, writeConfigAtom } from "@/utils/atoms/config"
import { filterEnabledProvidersConfig } from "@/utils/config/helpers"
import { buildFeatureProviderPatch } from "@/utils/constants/feature-providers"
import { streamBackgroundText } from "@/utils/content-script/background-stream-client"
import { prepareTranslationText } from "@/utils/host/translate/text-preparation"
import { translateTextCore } from "@/utils/host/translate/translate-text"
import { getOrCreateWebPageContext } from "@/utils/host/translate/webpage-context"
import { getOrGenerateWebPageSummary } from "@/utils/host/translate/webpage-summary"
import { onMessage } from "@/utils/message"
import { getTranslatePromptFromConfig } from "@/utils/prompts/translate"
import { resolveModelId } from "@/utils/providers/model-id"
import { getProviderOptionsWithOverride } from "@/utils/providers/options"
import ProviderSelector from "@/components/llm-providers/provider-selector"
import { shadowWrapper } from "../.."
import { SELECTION_CONTENT_OVERLAY_LAYERS } from "../../overlay-layers"
import { SelectionToolbarErrorAlert } from "../../components/selection-toolbar-error-alert"
import { ContextDetailsButton, RegenerateButton } from "../../components/selection-toolbar-footer-content"
import {
  isSelectionToolbarVisibleAtom,
  selectionSessionAtom,
  selectionToolbarTranslateRequestAtom,
  targetInputElementAtom,
} from "../atoms"
import {
  createSelectionToolbarPrecheckError,
  createSelectionToolbarRuntimeError,
  isAbortError,
} from "../inline-error"
import { useSelectionContextMenuRequestResolver } from "../use-selection-context-menu-request"
import { useSelectionPopoverThemeStyles } from "../use-selection-popover-theme-styles"
import { TargetLanguageSelector } from "./target-language-selector"
import { TranslationContent } from "./translation-content"
import { i18n, storage } from "#imports"

interface SelectionTranslatePendingOpenRequest {
  anchor?: { x: number, y: number }
  session: SelectionSession
  surface: typeof ANALYTICS_SURFACE.SELECTION_TOOLBAR | typeof ANALYTICS_SURFACE.CONTEXT_MENU
}

async function getSelectionWebPagePromptContext(
  providerConfig: ProviderConfig,
  enableAIContentAware: boolean,
) {
  const webPageContext = await getOrCreateWebPageContext()
  if (!webPageContext) {
    return undefined
  }

  const webSummary = await getOrGenerateWebPageSummary(webPageContext, providerConfig, enableAIContentAware)
  return {
    webTitle: webPageContext.webTitle,
    webDescription: webPageContext.webDescription,
    webContent: webPageContext.webContent,
    webSummary: webSummary ?? undefined,
  }
}

async function translateWithLlm({
  preparedText,
  providerConfig,
  translateRequest,
  onChunk,
  registerAbortController,
}: {
  preparedText: string
  providerConfig: LLMProviderConfig
  translateRequest: SelectionToolbarTranslateRequestSlice
  onChunk: (data: BackgroundTextStreamSnapshot) => void
  registerAbortController: (abortController: AbortController) => void
}) {
  const targetLangName = LANG_CODE_TO_EN_NAME[translateRequest.language.targetCode]
  const {
    id: providerId,
    provider,
    providerOptions: userProviderOptions,
    temperature,
  } = providerConfig
  const modelName = resolveModelId(providerConfig.model)
  const providerOptions = getProviderOptionsWithOverride(modelName ?? "", provider, userProviderOptions)
  const abortController = new AbortController()
  registerAbortController(abortController)

  const throwIfAborted = () => {
    if (abortController.signal.aborted) {
      throw new DOMException("aborted", "AbortError")
    }
  }

  const webPageContext = await getSelectionWebPagePromptContext(providerConfig, translateRequest.enableAIContentAware)
  throwIfAborted()
  const { systemPrompt, prompt } = getTranslatePromptFromConfig(
    { customPromptsConfig: translateRequest.customPromptsConfig },
    targetLangName,
    preparedText,
    webPageContext
      ? {
          context: {
            webTitle: webPageContext.webTitle,
            webDescription: webPageContext.webDescription,
            webContent: webPageContext.webContent,
            webSummary: webPageContext.webSummary,
          },
        }
      : undefined,
  )

  const translatedText = await streamBackgroundText(
    {
      providerId,
      system: systemPrompt,
      prompt,
      providerOptions,
      temperature,
    },
    {
      signal: abortController.signal,
      onChunk,
    },
  )

  return translatedText
}

async function translateWithStandardProvider({
  text,
  providerConfig,
  translateRequest,
}: {
  text: string
  providerConfig: ProviderConfig
  translateRequest: SelectionToolbarTranslateRequestSlice
}) {
  const webPageContext = await getSelectionWebPagePromptContext(providerConfig, translateRequest.enableAIContentAware)
  const translatedText = await translateTextCore({
    text,
    langConfig: translateRequest.language,
    providerConfig,
    enableAIContentAware: translateRequest.enableAIContentAware,
    extraHashTags: ["selectionTranslation"],
    webPageContext,
    textType: "plain",
  })

  return translatedText
}

interface SelectionTranslationContextValue {
  prepareToolbarOpen: () => void
  targetLang: LangCodeISO6393 | null
  setTargetLang: (lang: LangCodeISO6393) => void
}

const SelectionTranslationContext = createContext<SelectionTranslationContextValue | null>(null)

function useSelectionTranslationContext() {
  const context = use(SelectionTranslationContext)
  if (!context) {
    throw new Error("Selection translation popover must be used within SelectionTranslationProvider.")
  }

  return context
}

export function useSelectionTranslationPopover() {
  return useSelectionTranslationContext()
}

export function SelectionTranslationProvider({
  children,
}: {
  children: ReactNode
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ x: number, y: number } | null>(null)
  const [popoverSessionKey, setPopoverSessionKey] = useState(0)
  const [translatedText, setTranslatedText] = useState<string | undefined>(undefined)
  const [thinking, setThinking] = useState<ThinkingSnapshot | null>(null)
  const [error, setError] = useState<SelectionToolbarInlineError | null>(null)
  const [isTranslating, setIsTranslating] = useState(false)
  const [rerunNonce, setRerunNonce] = useState(0)
  const [sourceSurface, setSourceSurface] = useState<
    typeof ANALYTICS_SURFACE.SELECTION_TOOLBAR | typeof ANALYTICS_SURFACE.CONTEXT_MENU
  >(ANALYTICS_SURFACE.SELECTION_TOOLBAR)
  const [activeSession, setActiveSession] = useState<SelectionSession | null>(null)
  const [lastTargetLang, setLastTargetLang] = useState<string | null>(null)
  const [targetLang, setTargetLang] = useState<LangCodeISO6393 | null>(null)
  const selectionSession = useAtomValue(selectionSessionAtom)
  const translateRequest = useAtomValue(selectionToolbarTranslateRequestAtom)
  const providersConfig = useAtomValue(configFieldsAtomMap.providersConfig)
  const selectionToolbarConfig = useAtomValue(configFieldsAtomMap.selectionToolbar)
  const setIsSelectionToolbarVisible = useSetAtom(isSelectionToolbarVisibleAtom)
  const setConfig = useSetAtom(writeConfigAtom)
  const targetInputElement = useAtomValue(targetInputElementAtom)
  const abortControllerRef = useRef<AbortController | null>(null)
  const pendingOpenRequestRef = useRef<SelectionTranslatePendingOpenRequest | null>(null)
  const reopenFrameRef = useRef<number | null>(null)
  const lastTranslationRunKeyRef = useRef<string | null>(null)
  const runIdRef = useRef(0)
  const translationHistoryRef = useRef<Map<string, string>>(new Map())
  const { resolveContextMenuSelectionRequest } = useSelectionContextMenuRequestResolver(selectionSession)
  const selectionText = activeSession?.selectionSnapshot.text ?? null
  const paragraphsText = activeSession?.contextSnapshot.text ?? selectionText
  const titleText = document.title || null
  const translateProviders = useMemo(
    () => filterEnabledProvidersConfig(providersConfig).filter(isTranslateProviderConfig),
    [providersConfig],
  )
  const themeStyles = useSelectionPopoverThemeStyles()
  const translateRequestKey = useMemo(
    () => JSON.stringify(translateRequest),
    [translateRequest],
  )

  const resetPopoverSession = useCallback((options?: { clearAnchor?: boolean }) => {
    setActiveSession(null)
    if (options?.clearAnchor) {
      setAnchor(null)
    }
  }, [])

  const resetTranslationState = useCallback(() => {
    setIsTranslating(false)
    setTranslatedText(undefined)
    setThinking(null)
    setError(null)
  }, [])

  const handleSwapLanguages = useCallback(async () => {
    if (!selectionText || !targetLang) {
      return
    }

    const currentTarget = targetLang

    setIsTranslating(true)
    setError(null)

    try {
      // Detect source language using basic detection (no LLM for fast swap)
      const detected = await detectLanguage(selectionText, {
        minLength: 1,
        enableLLM: false,
      })

      if (!detected) {
        toast.error("Could not detect source language.")
        setIsTranslating(false)
        return
      }

      let newTarget: string
      if (currentTarget !== detected) {
        newTarget = detected
        setLastTargetLang(currentTarget)
      } else if (lastTargetLang) {
        newTarget = lastTargetLang
        setLastTargetLang(currentTarget)
      } else {
        newTarget = detected === "vie" ? "eng" : "vie"
        setLastTargetLang(currentTarget)
      }

      // If translated text is available, swap input text and translation output!
      if (translatedText && translatedText.trim() !== "") {
        setActiveSession(prev => {
          if (!prev) return null
          return {
            ...prev,
            selectionSnapshot: {
              ...prev.selectionSnapshot,
              text: translatedText,
            },
            contextSnapshot: {
              text: translatedText,
              paragraphs: [translatedText],
            }
          }
        })
      }

      setTargetLang(newTarget as LangCodeISO6393)
    } catch (err) {
      console.error("Failed to swap languages:", err)
      toast.error("Failed to swap translation languages.")
      setIsTranslating(false)
    }
  }, [selectionText, targetLang, lastTargetLang, translatedText])

  const cancelCurrentTranslation = useCallback((runId?: number) => {
    if (runId !== undefined && runIdRef.current !== runId) {
      return
    }

    runIdRef.current += 1
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
  }, [])

  const commitOpenRequest = useCallback((request: SelectionTranslatePendingOpenRequest) => {
    pendingOpenRequestRef.current = request
    if (request.anchor) {
      setAnchor(request.anchor)
    }
  }, [])

  const handleProviderChange = useCallback((providerId: string) => {
    void setConfig(buildFeatureProviderPatch({ "selectionToolbar.translate": providerId }))
  }, [setConfig])

  const handleRegenerate = useCallback(() => {
    cancelCurrentTranslation()
    setRerunNonce(prev => prev + 1)
  }, [cancelCurrentTranslation])

  const runTranslation = useCallback(async (runId: number, currentTargetLang: LangCodeISO6393) => {
    const preparedText = prepareTranslationText(selectionText)

    if (preparedText === "") {
      if (runIdRef.current === runId) {
        resetTranslationState()
      }
      return
    }

    const analyticsContext = createFeatureUsageContext(
      ANALYTICS_FEATURE.SELECTION_TRANSLATION,
      sourceSurface,
    )

    // Prechecks đồng bộ cần chạy ngay lập tức trước khi có bất kỳ thao tác bất đồng bộ nào
    const providerConfig = translateRequest.providerConfig
    if (!providerConfig || !isTranslateProviderConfig(providerConfig)) {
      if (runIdRef.current === runId) {
        setIsTranslating(false)
        setError(createSelectionToolbarPrecheckError("translate", "providerUnavailable"))
      }
      void trackFeatureUsed({
        ...analyticsContext,
        outcome: "failure",
      })
      return
    }

    if (!providerConfig.enabled) {
      if (runIdRef.current === runId) {
        setIsTranslating(false)
        setError(createSelectionToolbarPrecheckError("translate", "providerDisabled"))
      }
      void trackFeatureUsed({
        ...analyticsContext,
        outcome: "failure",
      })
      return
    }

    const providerId = providerConfig?.id ?? ""
    const cachedTranslation = translationHistoryRef.current.get(`${preparedText}::${currentTargetLang}::${providerId}`)
    if (cachedTranslation !== undefined) {
      if (runIdRef.current === runId) {
        setTranslatedText(cachedTranslation)
        setThinking(null)
        setError(null)
        setIsTranslating(false)
      }
      void trackFeatureUsed({
        ...analyticsContext,
        outcome: "success",
      })
      return
    }

    setIsTranslating(true)
    setTranslatedText(undefined)
    setThinking(null)
    setError(null)

    let detectedSourceLang: string | null = null
    // Tự động nhận diện ngôn ngữ nguồn để xử lý ngôn ngữ đích thứ hai
    try {
      const detected = await detectLanguage(preparedText, {
        minLength: 1,
        enableLLM: false,
      })
      detectedSourceLang = detected

      if (detected && detected === currentTargetLang) {
        const storedSecondary = await storage.getItem<LangCodeISO6393>("local:secondary-target-lang")
        const secondaryTarget = storedSecondary || (detected === "vie" ? "eng" : "vie")

        if (secondaryTarget !== currentTargetLang) {
          setTargetLang(secondaryTarget as LangCodeISO6393)
          return
        }
      }
    } catch (err) {
      console.error("Failed to detect language for secondary target check:", err)
    }

    try {
      let nextTranslatedText = ""
      const translateRequestWithTarget = {
        ...translateRequest,
        language: {
          ...translateRequest.language,
          targetCode: currentTargetLang,
        },
      }
      if (isLLMProviderConfig(providerConfig)) {
        setThinking({
          status: "thinking",
          text: "",
        })

        const nextSnapshot = await translateWithLlm({
          preparedText,
          providerConfig,
          translateRequest: translateRequestWithTarget,
          onChunk: (data) => {
            if (runIdRef.current === runId) {
              setTranslatedText(data.output)
              setThinking(data.thinking)
            }
          },
          registerAbortController: (abortController) => {
            abortControllerRef.current = abortController
          },
        })

        nextTranslatedText = nextSnapshot.output
        if (runIdRef.current === runId) {
          setThinking(nextSnapshot.thinking)
        }
      }
      else {
        setThinking(null)
        nextTranslatedText = await translateWithStandardProvider({
          text: preparedText,
          providerConfig,
          translateRequest: translateRequestWithTarget,
        })
      }

      if (runIdRef.current === runId) {
        setTranslatedText(nextTranslatedText)
        if (nextTranslatedText && nextTranslatedText.trim() !== "") {
          const providerId = providerConfig?.id ?? ""
          translationHistoryRef.current.set(`${preparedText}::${currentTargetLang}::${providerId}`, nextTranslatedText)
          if (detectedSourceLang) {
            translationHistoryRef.current.set(`${nextTranslatedText}::${detectedSourceLang}::${providerId}`, preparedText)
          }
        }
      }

      void trackFeatureUsed({
        ...analyticsContext,
        outcome: "success",
      })
    }
    catch (error) {
      if (!isAbortError(error) && runIdRef.current === runId) {
        setThinking(prev => prev?.text ? { ...prev, status: "complete" } : null)
        setError(createSelectionToolbarRuntimeError("translate", error))
      }

      if (!isAbortError(error)) {
        void trackFeatureUsed({
          ...analyticsContext,
          outcome: "failure",
        })
      }
    }
    finally {
      if (runIdRef.current === runId) {
        abortControllerRef.current = null
        setIsTranslating(false)
      }
    }
  }, [resetTranslationState, selectionText, sourceSurface, translateRequest])

  const startTranslation = useEffectEvent((runId: number, currentTargetLang: LangCodeISO6393) => {
    void runTranslation(runId, currentTargetLang)
  })

  useEffect(() => {
    if (!isOpen || !targetLang) {
      return
    }

    const nextRunKey = JSON.stringify({
      popoverSessionKey,
      rerunNonce,
      sessionId: activeSession?.id ?? null,
      translateRequestKey,
      targetLang,
    })
    if (lastTranslationRunKeyRef.current === nextRunKey) {
      return
    }
    lastTranslationRunKeyRef.current = nextRunKey

    const runId = runIdRef.current + 1
    runIdRef.current = runId

    startTranslation(runId, targetLang)

    return () => {
      cancelCurrentTranslation(runId)
    }
  }, [activeSession?.id, cancelCurrentTranslation, isOpen, popoverSessionKey, rerunNonce, translateRequestKey, targetLang])

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    cancelCurrentTranslation()
    resetTranslationState()
    translationHistoryRef.current.clear()

    if (nextOpen) {
      const pendingRequest = pendingOpenRequestRef.current
      const nextSession = pendingRequest?.session ?? selectionSession

      setActiveSession(nextSession)
      setSourceSurface(pendingRequest?.surface ?? ANALYTICS_SURFACE.SELECTION_TOOLBAR)
      setPopoverSessionKey(prev => prev + 1)
      if (pendingRequest?.anchor) {
        setAnchor(pendingRequest.anchor)
      }
      setIsSelectionToolbarVisible(false)
      pendingOpenRequestRef.current = null

      setTargetLang(translateRequest.language.targetCode)
    }
    else {
      setTargetLang(null)
      resetPopoverSession({
        clearAnchor: pendingOpenRequestRef.current === null,
      })
      lastTranslationRunKeyRef.current = null
    }

    setIsOpen(nextOpen)
  }, [cancelCurrentTranslation, resetPopoverSession, resetTranslationState, selectionSession, setIsSelectionToolbarVisible, translateRequest.language])

  const prepareToolbarOpen = useCallback(() => {
    if (!selectionSession) {
      return
    }

    commitOpenRequest({
      session: selectionSession,
      surface: ANALYTICS_SURFACE.SELECTION_TOOLBAR,
    })
  }, [commitOpenRequest, selectionSession])

  const resolveContextMenuRequest = useCallback((): SelectionTranslatePendingOpenRequest | null => {
    const request = resolveContextMenuSelectionRequest()
    if (!request) {
      return null
    }

    return {
      anchor: request.anchor,
      session: request.session,
      surface: ANALYTICS_SURFACE.CONTEXT_MENU,
    }
  }, [resolveContextMenuSelectionRequest])

  const openFromContextMenu = useCallback(() => {
    const request = resolveContextMenuRequest()
    if (!request) {
      const nextError = createSelectionToolbarPrecheckError("translate", "missingSelection")
      toast.error(nextError.description)
      return
    }

    if (reopenFrameRef.current !== null) {
      cancelAnimationFrame(reopenFrameRef.current)
      reopenFrameRef.current = null
    }

    if (isOpen) {
      handleOpenChange(false)
      reopenFrameRef.current = requestAnimationFrame(() => {
        reopenFrameRef.current = null
        commitOpenRequest(request)
        handleOpenChange(true)
      })
      return
    }

    commitOpenRequest(request)
    handleOpenChange(true)
  }, [commitOpenRequest, handleOpenChange, isOpen, resolveContextMenuRequest])

  useEffect(() => {
    if (!isOpen || !translateRequest.language.targetCode || !targetLang || !selectionText) {
      return
    }

    const currentTarget = targetLang
    const originalTarget = translateRequest.language.targetCode

    if (currentTarget !== originalTarget) {
      void detectLanguage(selectionText, { minLength: 1, enableLLM: false }).then(detected => {
        if (detected === originalTarget) {
          void storage.setItem("local:secondary-target-lang", currentTarget)
        }
      }).catch(err => {
        console.error("Error in target language watch effect:", err)
      })
    }
  }, [targetLang, isOpen, selectionText, translateRequest.language.targetCode])

  useEffect(() => {
    return onMessage("openSelectionTranslationFromContextMenu", () => {
      openFromContextMenu()
    })
  }, [openFromContextMenu])

  useEffect(() => {
    return () => {
      if (reopenFrameRef.current !== null) {
        cancelAnimationFrame(reopenFrameRef.current)
      }
    }
  }, [])

  const contextValue = useMemo<SelectionTranslationContextValue>(() => ({
    prepareToolbarOpen,
    targetLang,
    setTargetLang,
  }), [prepareToolbarOpen, targetLang])

  return (
    <SelectionTranslationContext value={contextValue}>
      <SelectionPopover.Root
        open={isOpen}
        onOpenChange={handleOpenChange}
        anchor={anchor}
        onAnchorChange={setAnchor}
      >
        {children}
        <SelectionPopover.Content
          key={popoverSessionKey}
          container={shadowWrapper ?? document.body}
          finalFocus={false}
          style={themeStyles}
        >
          <SelectionPopover.Header className="flex flex-wrap items-center justify-between gap-1 border-b pb-2 pt-2 px-3">
             <div className="flex items-center gap-1 min-w-0 flex-1">
               <ProviderSelector
                 providers={translateProviders}
                 value={translateRequest.providerConfig?.id ?? ""}
                 onChange={handleProviderChange}
                 className="h-7 w-auto max-w-[130px] border-none bg-transparent shadow-none px-1"
                 selectContentProps={{ container: shadowWrapper ?? undefined, positionerClassName: SELECTION_CONTENT_OVERLAY_LAYERS.popoverOverlay }}
               />
               <TargetLanguageSelector />
               <Button
                 variant="ghost-secondary"
                 size="icon"
                 className="h-7 w-7 shrink-0"
                 onClick={handleSwapLanguages}
                 title={i18n.t("translationHub.exchangeLanguages")}
                 data-rf-no-drag
               >
                 <Icon icon="tabler:arrows-exchange" className="size-4" />
               </Button>
             </div>
             <div className="flex items-center gap-1 shrink-0">
               <ContextDetailsButton titleText={titleText} paragraphsText={paragraphsText} />
               <RegenerateButton onRegenerate={handleRegenerate} />
               <SelectionPopover.Pin />
               <SelectionPopover.Close />
             </div>
          </SelectionPopover.Header>

          <SelectionPopover.Body>
            <TranslationContent
              selectionContent={selectionText}
              translatedText={translatedText}
              isTranslating={isTranslating}
              thinking={thinking}
              targetInputElement={targetInputElement}
            />
            <SelectionToolbarErrorAlert error={error} className="-mt-3" />
          </SelectionPopover.Body>
        </SelectionPopover.Content>
      </SelectionPopover.Root>
    </SelectionTranslationContext>
  )
}



