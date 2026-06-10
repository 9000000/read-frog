import { useAtomValue } from "jotai"
import { useEffect } from "react"
import { Toaster } from "sonner"
import { configAtom, configFieldsAtomMap } from "@/utils/atoms/config"
import { isSiteEnabled, getEffectiveSiteControlUrl } from "@/utils/site-control"
import { useCurrentUrl } from "@/hooks/use-current-url"
import { useInputTranslation } from "./input-translation"
import {
  SELECTION_CONTENT_OVERLAY_LAYERS,
  SELECTION_CONTENT_OVERLAY_ROOT_ATTRIBUTE,
} from "./overlay-layers"
import { SelectionToolbar } from "./selection-toolbar"
import { SelectionCustomActionProvider } from "./selection-toolbar/custom-action-button/provider"
import { SelectionTranslationProvider } from "./selection-toolbar/translate-button/provider"

export default function App({
  uiContainer,
}: {
  uiContainer: HTMLElement
}) {
  const config = useAtomValue(configAtom)
  const currentUrl = useCurrentUrl()
  const siteControlUrl = getEffectiveSiteControlUrl(currentUrl)

  if (!isSiteEnabled(siteControlUrl, config)) {
    return null
  }

  return <SelectionToolbarWrapper uiContainer={uiContainer} />
}

function SelectionToolbarWrapper({
  uiContainer,
}: {
  uiContainer: HTMLElement
}) {
  useInputTranslation()
  const opacity = useAtomValue(configFieldsAtomMap.selectionToolbar).opacity / 100

  useEffect(() => {
    uiContainer.style.setProperty("--rf-selection-opacity", String(opacity))

    return () => {
      uiContainer.style.removeProperty("--rf-selection-opacity")
    }
  }, [opacity, uiContainer])

  return (
    <>
      <SelectionTranslationProvider>
        <SelectionCustomActionProvider>
          <SelectionToolbar />
        </SelectionCustomActionProvider>
      </SelectionTranslationProvider>
      <Toaster
        richColors
        className={`${SELECTION_CONTENT_OVERLAY_LAYERS.selectionOverlay} notranslate`}
        {...{ [SELECTION_CONTENT_OVERLAY_ROOT_ATTRIBUTE]: "" }}
      />
    </>
  )
}
