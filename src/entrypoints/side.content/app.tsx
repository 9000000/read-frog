import { useAtomValue } from "jotai"
import { configAtom } from "@/utils/atoms/config"
import { isSiteEnabled } from "@/utils/site-control"
import { useCurrentUrl } from "@/hooks/use-current-url"
import FrogToast from "@/components/frog-toast"
import FloatingButton from "./components/floating-button"

export default function App() {
  const config = useAtomValue(configAtom)
  const currentUrl = useCurrentUrl()

  if (!isSiteEnabled(currentUrl, config)) {
    return null
  }

  return (
    <>
      <FloatingButton />
      <FrogToast />
    </>
  )
}
