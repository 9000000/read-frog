// @vitest-environment jsdom
import type { ReactElement } from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TooltipProvider } from "@/components/ui/base-ui/tooltip"
import { configAtom } from "@/utils/atoms/config"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import {
  buildContextSnapshot,
  createRangeSnapshot,
  normalizeSelectedText,
} from "../../../utils"
import { setSelectionStateAtom } from "../../atoms"
import { SelectionCustomActionProvider } from "../../custom-action-button/provider"
import { TranslateButton } from ".."
import { SelectionTranslationProvider } from "../provider"

const translateTextCoreMock = vi.fn()
const detectLanguageMock = vi.fn().mockResolvedValue("eng")
const getOrCreateWebPageContextMock = vi.fn().mockResolvedValue(null)
const getOrGenerateWebPageSummaryMock = vi.fn().mockResolvedValue(undefined)
const toastErrorMock = vi.fn()
const onMessageMock = vi.fn()
const originalGetSelection = window.getSelection

vi.mock("@/components/ui/selection-popover", async () => {
  const React = await import("react")

  interface PopoverContextValue {
    open: boolean
    onOpenChange?: (open: boolean) => void
  }

  const PopoverContext = React.createContext<PopoverContextValue | null>(null)

  function usePopoverContext() {
    const context = React.use(PopoverContext)
    if (!context) {
      throw new Error("SelectionPopover components must be used within SelectionPopover.Root.")
    }
    return context
  }

  function Root({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode
    open: boolean
    onOpenChange?: (open: boolean) => void
  }) {
    return (
      <PopoverContext value={{ open, onOpenChange }}>
        {children}
      </PopoverContext>
    )
  }

  function Trigger({
    children,
    onClick,
    ...props
  }: React.ComponentProps<"button"> & {
    children: React.ReactNode
  }) {
    const { onOpenChange } = usePopoverContext()
    return (
      <button
        {...props}
        type="button"
        onClick={(event) => {
          onClick?.(event)
          onOpenChange?.(true)
        }}
      >
        {children}
      </button>
    )
  }

  function Content({
    children,
    finalFocus,
  }: {
    children: React.ReactNode
    finalFocus?: boolean
  }) {
    const { open } = usePopoverContext()
    return open
      ? (
          <div
            data-testid="selection-popover-content"
            data-final-focus={finalFocus === false ? "false" : undefined}
            data-rf-selection-overlay-root=""
          >
            {children}
          </div>
        )
      : null
  }

  function Body({
    children,
    ref,
    ...props
  }: React.ComponentProps<"div"> & { ref?: React.Ref<HTMLDivElement> }) {
    return (
      <div ref={ref} {...props}>
        {children}
      </div>
    )
  }

  function Close() {
    const { onOpenChange } = usePopoverContext()
    return (
      <button type="button" aria-label="Close" onClick={() => onOpenChange?.(false)}>
        Close
      </button>
    )
  }

  function Pin() {
    return <button type="button">Pin</button>
  }

  return {
    SelectionPopover: {
      Root,
      Trigger,
      Content,
      Header: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      Body,
      Pin,
      Close,
    },
    useSelectionPopoverOverlayProps: () => ({
      container: undefined,
      positionerClassName: undefined,
    }),
  }
})

vi.mock("../../components/selection-toolbar-footer-content", () => ({
  ContextDetailsButton: () => <div data-testid="context-details" />,
  RegenerateButton: () => <button type="button">Regenerate</button>,
}))

vi.mock("../translation-content", () => ({
  TranslationContent: ({
    selectionContent,
    translatedText,
    isTranslating,
  }: {
    selectionContent: string | null | undefined
    translatedText: string | undefined
    isTranslating: boolean
  }) => (
    <div data-testid="translation-content">
      <span data-testid="translation-selection">{selectionContent}</span>
      <span data-testid="translation-result">{translatedText ?? ""}</span>
      <span data-testid="translation-status">{String(isTranslating)}</span>
    </div>
  ),
}))

vi.mock("@/utils/host/translate/translate-text", () => ({
  translateTextCore: (...args: unknown[]) => translateTextCoreMock(...args),
}))

vi.mock("@/utils/content/language", () => ({
  detectLanguage: (...args: unknown[]) => detectLanguageMock(...args),
}))

vi.mock("@/utils/host/translate/webpage-context", () => ({
  getOrCreateWebPageContext: (...args: unknown[]) => getOrCreateWebPageContextMock(...args),
}))

vi.mock("@/utils/host/translate/webpage-summary", () => ({
  getOrGenerateWebPageSummary: (...args: unknown[]) => getOrGenerateWebPageSummaryMock(...args),
}))

vi.mock("#imports", async (importOriginal) => {
  const original = await importOriginal<any>()
  return {
    ...original,
    i18n: {
      t: (key: string) => key,
    },
  }
})

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: vi.fn(),
  },
}))

vi.mock("@/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    log: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("@/utils/message", () => ({
  onMessage: (...args: unknown[]) => onMessageMock(...args),
  sendMessage: vi.fn(),
}))

vi.mock("@/components/providers/theme-provider", () => ({
  useTheme: () => ({
    theme: "light",
    themeMode: "light",
    setThemeMode: vi.fn(),
  }),
}))

function cloneConfig(config: any): any {
  return JSON.parse(JSON.stringify(config))
}

function setSelectionState(
  store: any,
  {
    text,
  }: {
    text: string | null
  },
) {
  if (text === null) {
    store.set(setSelectionStateAtom, { selection: null, context: null })
    return
  }

  const normalizedText = normalizeSelectedText(text)
  const selection = {
    text: normalizedText,
    ranges: [],
  }

  store.set(setSelectionStateAtom, {
    selection,
    context: {
      text: normalizedText,
      paragraphs: [normalizedText],
    },
  })
}

function renderWithProviders(ui: ReactElement, store = createStore()) {
  return render(
    <Provider store={store}>
      <TooltipProvider>
        <SelectionTranslationProvider>
          <SelectionCustomActionProvider>
            {ui}
          </SelectionCustomActionProvider>
        </SelectionTranslationProvider>
      </TooltipProvider>
    </Provider>,
  )
}

describe("translation swap logic", () => {
  beforeEach(() => {
    getOrCreateWebPageContextMock.mockResolvedValue(null)
    getOrGenerateWebPageSummaryMock.mockResolvedValue(undefined)
    detectLanguageMock.mockResolvedValue("eng")
  })

  afterEach(() => {
    cleanup()
    document.body.innerHTML = ""
    window.getSelection = originalGetSelection
    vi.resetAllMocks()
  })

  it("swaps languages and retrieves the exact original text from history instead of re-translating", async () => {
    // 1. Mock translateTextCore to translate "Hello" to "Xin chào"
    translateTextCoreMock.mockResolvedValue("Xin chào")

    // 2. Mock detectLanguage:
    // When detecting "Hello", return "eng"
    // When detecting "Xin chào", return "vie"
    detectLanguageMock.mockImplementation((text: string) => {
      if (text.includes("Hello")) return Promise.resolve("eng")
      if (text.includes("Xin chào")) return Promise.resolve("vie")
      return Promise.resolve(null)
    })

    const store = createStore()
    const config = cloneConfig(DEFAULT_CONFIG)
    // Ensure translation target language is "vie" initially
    config.language = {
      ...config.language,
      targetCode: "vie",
    }
    store.set(configAtom, config)

    setSelectionState(store, { text: "Hello" })

    // 3. Render
    renderWithProviders(<TranslateButton />, store)

    // 4. Click to open popover and trigger initial translation
    fireEvent.click(screen.getByRole("button", { name: "action.translation" }))

    // 5. Wait for the initial translation to finish and render "Xin chào"
    await waitFor(() => {
      expect(translateTextCoreMock).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(screen.getByTestId("translation-result").textContent).toBe("Xin chào")
    })

    // Clear calls to make assertions precise
    translateTextCoreMock.mockClear()

    // 6. Click exchange / swap button
    const swapButton = screen.getByRole("button", { name: "translationHub.exchangeLanguages" })
    fireEvent.click(swapButton)

    // 7. Wait for swap to take effect.
    // It should immediately display "Hello" (retrieved from translationHistoryRef)
    // and NOT trigger translateTextCore at all!
    await waitFor(() => {
      expect(screen.getByTestId("translation-result").textContent).toBe("Hello")
    })

    // Verify translateTextCore was not called during the swap back to the original text
    expect(translateTextCoreMock).not.toHaveBeenCalled()
  })

  it("does not pollute or change the global target language configuration when swapping languages", async () => {
    translateTextCoreMock.mockResolvedValue("Xin chào")

    const store = createStore()
    const config = cloneConfig(DEFAULT_CONFIG)
    config.language = {
      ...config.language,
      targetCode: "cmn",
    }
    store.set(configAtom, config)

    setSelectionState(store, { text: "Hello" })

    renderWithProviders(<TranslateButton />, store)

    // Open popover
    fireEvent.click(screen.getByRole("button", { name: "action.translation" }))

    await waitFor(() => {
      expect(translateTextCoreMock).toHaveBeenCalledTimes(1)
    })

    // Click swap button
    const swapButton = screen.getByRole("button", { name: "translationHub.exchangeLanguages" })
    fireEvent.click(swapButton)

    // Wait for swap to take effect
    await waitFor(() => {
      expect(screen.getByTestId("translation-result").textContent).toBe("Hello")
    })

    // Close the popover
    fireEvent.click(screen.getByRole("button", { name: "Close" }))

    // Assert that the global target language configuration was NEVER changed from "cmn"
    expect(store.get(configAtom).language.targetCode).toBe("cmn")
  })
})
