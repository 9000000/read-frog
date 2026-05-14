import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { googleTranslate, microsoftTranslate } from "../index"

describe("textType behavior on standard APIs", () => {
  const originalFetch = globalThis.fetch
  const mockFetch = vi.fn()
  
  beforeEach(() => {
    mockFetch.mockClear()
    globalThis.fetch = mockFetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  describe("googleTranslate textType handling", () => {
    it("replaces newlines with <br /> and decodes them back when textType is 'plain'", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [["Result<br />Line 2"]]
      })

      const result = await googleTranslate("Line 1\nLine 2", "en", "vi", { textType: "plain" })
      
      // Check fetch body
      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [_url, options] = mockFetch.mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body[0][0][0]).toBe("Line 1<br />Line 2")
      
      // Check return value
      expect(result).toBe("Result\nLine 2")
    })

    it("keeps original newlines and does not decode anything when textType is 'html'", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [["Result\nLine 2<br>Test"]]
      })

      const result = await googleTranslate("Line 1\nLine 2", "en", "vi", { textType: "html" })
      
      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [_url, options] = mockFetch.mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body[0][0][0]).toBe("Line 1\nLine 2")
      
      expect(result).toBe("Result\nLine 2<br>Test")
    })
    
    it("handles mixed case and unspaced br tags", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [["Line1<BR>Line2<br/>Line3<br  />Line4"]]
      })

      const result = await googleTranslate("anything", "en", "vi", { textType: "plain" })
      expect(result).toBe("Line1\nLine2\nLine3\nLine4")
    })
  })

  describe("microsoftTranslate textType handling", () => {
    it("requests textType=plain when textType is 'plain'", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: async () => "mock-token"
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ translations: [{ text: "Result Line 2" }] }]
        })

      await microsoftTranslate("Line 1\nLine 2", "en", "vi", { textType: "plain" })
      
      expect(mockFetch).toHaveBeenCalledTimes(2)
      const [authUrl] = mockFetch.mock.calls[0]
      expect(authUrl).toContain("/auth")

      const [translateUrl] = mockFetch.mock.calls[1]
      expect(translateUrl).toContain("textType=plain")
    })

    it("requests textType=html when textType is 'html'", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: async () => "mock-token"
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ translations: [{ text: "Result" }] }]
        })

      await microsoftTranslate("Line 1", "en", "vi", { textType: "html" })
      
      const [translateUrl] = mockFetch.mock.calls[1]
      expect(translateUrl).toContain("textType=html")
    })
  })
})
