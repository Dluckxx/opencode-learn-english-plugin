import { describe, it, expect } from "vitest"
import { parseCorrectionResponse } from "../prompts/correction.js"
import { parsePhrasesResponse } from "../prompts/phrases.js"
import { isPureEnglish, extractTextParts, parseModelString, clampText, wordCount } from "../guards.js"
import { readPluginConfig } from "../config.js"

describe("end-to-end data flow", () => {
  describe("correction pipeline", () => {
    it("filters non-English input at the guard stage", () => {
      const text = "这个bug怎么修"
      expect(isPureEnglish(text)).toBe(false)
    })

    it("filters short input at the guard stage", () => {
      const text = "ok"
      expect(wordCount(text)).toBeLessThan(4)
    })

    it("parses a well-formed correction response", () => {
      const raw =
        '意思清楚，但 "I does this" 语法不对，应该用 "I do this"。\n\n改写：I do this every day.'
      const result = parseCorrectionResponse(raw)
      expect(result).toBeTruthy()
      expect(result).toContain("意思清楚")
      expect(result).toContain("改写")
    })

    it("returns null for empty LLM veto response", () => {
      expect(parseCorrectionResponse("")).toBeNull()
      expect(parseCorrectionResponse("   \n  ")).toBeNull()
    })
  })

  describe("phrases pipeline", () => {
    it("extracts text from mixed parts", () => {
      const parts = [
        { type: "text", text: "You can narrow down the issue." },
        { type: "tool-invocation", toolCallId: "abc" },
        { type: "text", text: " Under the hood, it uses a hash map." },
      ]
      const text = extractTextParts(parts as any)
      expect(text).toContain("narrow down")
      expect(text).toContain("Under the hood")
    })

    it("parses a well-formed phrases response", () => {
      const raw =
        '有几个值得记一下的表达\n\n"narrow down" — to make a list smaller by removing options. e.g. "Let\'s narrow down the cause."'
      const result = parsePhrasesResponse(raw)
      expect(result).toBeTruthy()
      expect(result).toContain("narrow down")
      expect(result).toContain("有几个值得记一下")
    })

    it("returns null when assistant reply has no learnable phrases", () => {
      expect(parsePhrasesResponse("")).toBeNull()
    })
  })

  describe("config reading", () => {
    it("returns defaults for missing config file", () => {
      const config = readPluginConfig("/nonexistent/path")
      expect(config.enabled).toBe(true)
      expect(config.correction.duration).toBe(15000)
      expect(config.phrases.duration).toBe(20000)
    })
  })

  describe("model string parsing", () => {
    it("parses valid small_model string", () => {
      const result = parseModelString("Tencent/claude-haiku-4-5")
      expect(result).toEqual({ providerID: "Tencent", modelID: "claude-haiku-4-5" })
    })

    it("rejects invalid format", () => {
      expect(parseModelString("invalid")).toBeNull()
    })
  })
})
