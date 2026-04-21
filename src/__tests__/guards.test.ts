import { describe, it, expect } from "vitest"
import { isPureEnglish, extractTextParts, parseModelString, clampText, wordCount } from "../guards.js"

describe("isPureEnglish", () => {
  it("returns true for plain English", () => {
    expect(isPureEnglish("Could you read this file?")).toBe(true)
  })

  it("returns true for accented Latin", () => {
    expect(isPureEnglish("I went to a café")).toBe(true)
  })

  it("returns false for Chinese characters", () => {
    expect(isPureEnglish("这个bug怎么修")).toBe(false)
  })

  it("returns false for Japanese", () => {
    expect(isPureEnglish("これはテスト")).toBe(false)
  })

  it("returns false for Korean", () => {
    expect(isPureEnglish("안녕하세요")).toBe(false)
  })

  it("returns true for emoji-only text (not CJK)", () => {
    expect(isPureEnglish("fix the bug 🐛")).toBe(true)
  })

  it("returns false for mixed CJK and English", () => {
    expect(isPureEnglish("use the 张三 method")).toBe(false)
  })

  it("returns false for empty string", () => {
    expect(isPureEnglish("")).toBe(false)
  })

  it("returns true for code-like text", () => {
    expect(isPureEnglish("const x = foo.bar()")).toBe(true)
  })
})

describe("extractTextParts", () => {
  it("concatenates text parts", () => {
    const parts = [
      { type: "text", text: "Hello " },
      { type: "tool-invocation", toolCallId: "abc" },
      { type: "text", text: "world" },
    ] as any[]
    expect(extractTextParts(parts)).toBe("Hello world")
  })

  it("returns empty string for no text parts", () => {
    const parts = [{ type: "tool-invocation", toolCallId: "abc" }] as any[]
    expect(extractTextParts(parts)).toBe("")
  })
})

describe("parseModelString", () => {
  it("parses provider/model format", () => {
    expect(parseModelString("Tencent/claude-haiku-4-5")).toEqual({
      providerID: "Tencent",
      modelID: "claude-haiku-4-5",
    })
  })

  it("returns null for empty string", () => {
    expect(parseModelString("")).toBeNull()
  })

  it("returns null for malformed string", () => {
    expect(parseModelString("noprovider")).toBeNull()
  })

  it("handles model with multiple slashes", () => {
    expect(parseModelString("openai/gpt-4o-mini")).toEqual({
      providerID: "openai",
      modelID: "gpt-4o-mini",
    })
  })
})

describe("clampText", () => {
  it("returns text as-is when under budget", () => {
    expect(clampText("short text", 100)).toBe("short text")
  })

  it("truncates with ellipsis when over budget", () => {
    const long = "a".repeat(200)
    const result = clampText(long, 100)
    expect(result.length).toBe(100)
    expect(result.endsWith("…")).toBe(true)
  })

  it("handles exact budget length", () => {
    const text = "a".repeat(100)
    expect(clampText(text, 100)).toBe(text)
  })
})

describe("wordCount", () => {
  it("counts words in a simple sentence", () => {
    expect(wordCount("hello world")).toBe(2)
  })

  it("ignores extra spaces", () => {
    expect(wordCount("  extra  spaces  ")).toBe(2)
  })

  it("returns 0 for empty string", () => {
    expect(wordCount("")).toBe(0)
  })
})
