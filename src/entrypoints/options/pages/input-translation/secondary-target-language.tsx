import type { LangCodeISO6393 } from "@read-frog/definitions"
import {
  LANG_CODE_TO_EN_NAME,
  LANG_CODE_TO_LOCALE_NAME,
  langCodeISO6393Schema,
} from "@read-frog/definitions"
import { useEffect, useState } from "react"
import { i18n, storage } from "#imports"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/base-ui/select"
import { ConfigCard } from "../../components/config-card"

function langCodeLabel(langCode: LangCodeISO6393) {
  return `${LANG_CODE_TO_EN_NAME[langCode]} (${LANG_CODE_TO_LOCALE_NAME[langCode]})`
}

export function SecondaryTargetLanguage() {
  const [secondaryTarget, setSecondaryTarget] = useState<LangCodeISO6393>("eng")

  useEffect(() => {
    // Tải ngôn ngữ đã lưu ban đầu
    void storage.getItem<LangCodeISO6393>("local:secondary-target-lang").then(stored => {
      if (stored) {
        setSecondaryTarget(stored)
      }
    })

    // Lắng nghe sự thay đổi của bộ nhớ để cập nhật giao diện thời gian thực
    const unwatch = storage.watch<LangCodeISO6393>("local:secondary-target-lang", (newVal) => {
      if (newVal) {
        setSecondaryTarget(newVal)
      }
    })

    return () => {
      unwatch()
    }
  }, [])

  const handleLanguageChange = async (value: LangCodeISO6393) => {
    setSecondaryTarget(value)
    await storage.setItem("local:secondary-target-lang", value)
  }

  return (
    <ConfigCard
      id="secondary-target-language"
      title={i18n.t("options.translation.secondaryTargetLanguage.title")}
      description={i18n.t("options.translation.secondaryTargetLanguage.description")}
    >
      <div className="w-full flex justify-start md:justify-end">
        <Select
          value={secondaryTarget}
          onValueChange={(v) => void handleLanguageChange(v as LangCodeISO6393)}
        >
          <SelectTrigger className="w-64 max-h-52 min-w-0">
            <SelectValue render={<span className="flex-1 min-w-0" />}>
              <span className="block min-w-0 truncate">{langCodeLabel(secondaryTarget)}</span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-64" align="end">
            <SelectGroup>
              {langCodeISO6393Schema.options.map((code) => (
                <SelectItem key={code} value={code}>
                  {langCodeLabel(code)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </ConfigCard>
  )
}
