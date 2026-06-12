import "@/utils/zod-config"
import type { Config } from "@/types/config/config"
import type { ThemeMode } from "@/types/config/theme"
import { QueryClientProvider } from "@tanstack/react-query"
import { kebabCase } from "case-anything"
import { Provider as JotaiProvider } from "jotai/react"
import { useHydrateAtoms } from "jotai/utils"
import { lazy, Suspense } from "react"
import ReactDOM from "react-dom/client"
import { createShadowRootUi, defineContentScript } from "#imports"
import { ThemeProvider } from "@/components/providers/theme-provider"
import { TooltipProvider } from "@/components/ui/base-ui/tooltip"
import { configAtom } from "@/utils/atoms/config"
import { baseThemeModeAtom } from "@/utils/atoms/theme"
import { getLocalConfig } from "@/utils/config/storage"
import { APP_NAME } from "@/utils/constants/app"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { protectSelectAllShadowRoot } from "@/utils/select-all"
import { insertShadowRootUIWrapperInto } from "@/utils/shadow-root"
import { queryClient } from "@/utils/tanstack-query"
import { getLocalThemeMode } from "@/utils/theme"
import { addStyleToShadow, mirrorDynamicStyles, protectInternalStyles } from "../../utils/styles"
import App from "./app"
import { store } from "./atoms"
import "@/assets/styles/theme.css"
import "@/assets/styles/text-small.css"

const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() => import("@tanstack/react-query-devtools").then(m => ({ default: m.ReactQueryDevtools })))
  : null

function HydrateAtoms({
  initialValues,
  children,
}: {
  initialValues: [
    [typeof configAtom, Config],
    [typeof baseThemeModeAtom, ThemeMode],
  ]
  children: React.ReactNode
}) {
  useHydrateAtoms(initialValues)
  return children
}

declare global {
  interface Window {
    __READ_FROG_SIDE_INJECTED__?: boolean
  }
}

// eslint-disable-next-line import/no-mutable-exports
export let shadowWrapper: HTMLElement | null = null

export default defineContentScript({
  matches: ["*://*/*", "file:///*"],
  cssInjectionMode: "ui",
  async main(ctx) {
    // Prevent double injection (manifest-based + programmatic injection)
    if (window.__READ_FROG_SIDE_INJECTED__)
      return
    window.__READ_FROG_SIDE_INJECTED__ = true

    ctx.onInvalidated(() => {
      window.__READ_FROG_SIDE_INJECTED__ = false
    })

    let config: Config
    let themeMode: ThemeMode
    try {
      config = await getLocalConfig() ?? DEFAULT_CONFIG
      themeMode = await getLocalThemeMode()
    }
    catch {
      // Storage read failed (e.g. extension context invalidated mid-flight).
      // Reset the guard so a future injection attempt can try again.
      window.__READ_FROG_SIDE_INJECTED__ = false
      return
    }

    // After awaiting async work the context may have been invalidated
    // (extension reloaded, navigated away, etc.).  Bail out early so
    // createShadowRootUi doesn't silently fail or mount into a dead context.
    if (!ctx.isValid) {
      window.__READ_FROG_SIDE_INJECTED__ = false
      return
    }

    const ui = await createShadowRootUi(ctx, {
      name: kebabCase(APP_NAME),
      position: "overlay",
      anchor: "body",
      append: "last",
      onMount: (container, shadow, shadowHost) => {
        // Store shadow root reference
        const wrapper = insertShadowRootUIWrapperInto(container)
        shadowWrapper = wrapper

        addStyleToShadow(shadow)
        mirrorDynamicStyles("#_goober", shadow)
        // mirrorDynamicStyles(
        //   "style[type='text/css']",
        //   shadow,
        //   ".with-scroll-bars-hidden22"
        // );

        // Protect internal style elements from being removed
        protectInternalStyles()

        protectSelectAllShadowRoot(shadowHost, wrapper)

        // Translation state is now synced automatically via enablePageTranslationAtom
        // which uses session storage with the createTabSessionAtom pattern

        const root = ReactDOM.createRoot(wrapper)
        root.render(
          <QueryClientProvider client={queryClient}>
            <JotaiProvider store={store}>
              <HydrateAtoms
                initialValues={[
                  [configAtom, config],
                  [baseThemeModeAtom, themeMode],
                ]}
              >
                <ThemeProvider container={wrapper}>
                  <TooltipProvider>
                    <App />
                  </TooltipProvider>
                </ThemeProvider>
              </HydrateAtoms>
            </JotaiProvider>
            {ReactQueryDevtools && (
              <Suspense>
                <ReactQueryDevtools
                  initialIsOpen={false}
                  buttonPosition="bottom-right"
                />
              </Suspense>
            )}
          </QueryClientProvider>,
        )
        return { root, wrapper }
      },
      onRemove: (elements) => {
        elements?.root.unmount()
        elements?.wrapper.remove()
        shadowWrapper = null
      },
    })

    ui.mount()
  },
})
