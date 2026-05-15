import { i18n } from "#imports"
import { useAtom } from "jotai"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { ConfigCard } from "../../components/config-card"
import { Button } from "@/components/ui/base-ui/button"

export function SelectionToolbarTheme() {
  const [selectionToolbar, setSelectionToolbar] = useAtom(configFieldsAtomMap.selectionToolbar)
  
  const bg = selectionToolbar.theme?.backgroundColor || ""
  const text = selectionToolbar.theme?.textColor || ""

  const handleReset = () => {
    void setSelectionToolbar({ 
      theme: { backgroundColor: "", textColor: "" } 
    })
  }

  return (
    <ConfigCard
      id="selection-toolbar-theme"
      title={i18n.t("options.floatingButtonAndToolbar.selectionToolbar.theme.title")}
      description={i18n.t("options.floatingButtonAndToolbar.selectionToolbar.theme.description")}
    >
      <div className="w-full flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium" htmlFor="popup-bg-color">
            {i18n.t("options.floatingButtonAndToolbar.selectionToolbar.theme.background")}
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 uppercase">{bg || "Default"}</span>
            <input
              id="popup-bg-color"
              type="color"
              value={bg || "#1e1e2e"}
              onChange={(e) => {
                void setSelectionToolbar({
                  theme: { ...selectionToolbar.theme, backgroundColor: e.target.value, textColor: text }
                })
              }}
              className="h-8 w-12 cursor-pointer rounded border-0 p-0 bg-transparent"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="text-sm font-medium" htmlFor="popup-text-color">
            {i18n.t("options.floatingButtonAndToolbar.selectionToolbar.theme.text")}
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 uppercase">{text || "Default"}</span>
            <input
              id="popup-text-color"
              type="color"
              value={text || "#cdd6f4"}
              onChange={(e) => {
                void setSelectionToolbar({
                  theme: { ...selectionToolbar.theme, backgroundColor: bg, textColor: e.target.value }
                })
              }}
              className="h-8 w-12 cursor-pointer rounded border-0 p-0 bg-transparent"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button 
            variant="ghost-secondary" 
            size="sm" 
            onClick={handleReset}
            disabled={!bg && !text}
          >
            {i18n.t("options.floatingButtonAndToolbar.selectionToolbar.theme.reset")}
          </Button>
        </div>
      </div>
    </ConfigCard>
  )
}
