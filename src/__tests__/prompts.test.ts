import { describe, it, expect } from "vitest"
import { buildCorrectionPrompts, parseCorrectionResponse } from "../prompts/correction.js"
import { buildPhrasesPrompts, parsePhrasesResponse } from "../prompts/phrases.js"

describe("buildCorrectionPrompts", () => {
  it("returns system and user prompts", () => {
    const { system, user } = buildCorrectionPrompts("I does this works?")
    expect(system).toContain("英语老师")
    expect(system).toContain("400")
    expect(user).toBe("I does this works?")
  })
})

describe("parseCorrectionResponse", () => {
  it("returns null for empty/whitespace response", () => {
    expect(parseCorrectionResponse("")).toBeNull()
    expect(parseCorrectionResponse("   ")).toBeNull()
    expect(parseCorrectionResponse("\n\n")).toBeNull()
  })

  it("returns trimmed text for non-empty response", () => {
    const result = parseCorrectionResponse("  意思清楚，但语法有误  ")
    expect(result).toBe("意思清楚，但语法有误")
  })

  it("clamps over-budget response", () => {
    const long = "a".repeat(500)
    const result = parseCorrectionResponse(long)
    expect(result!.length).toBeLessThanOrEqual(400)
  })
})

describe("buildPhrasesPrompts", () => {
  it("returns system and user prompts", () => {
    const { system, user } = buildPhrasesPrompts("You can narrow down the issue under the hood.")
    expect(system).toContain("英语老师")
    expect(system).toContain("600")
    expect(user).toContain("narrow down")
  })
})

describe("parsePhrasesResponse", () => {
  it("returns null for empty/whitespace response", () => {
    expect(parsePhrasesResponse("")).toBeNull()
    expect(parsePhrasesResponse("   ")).toBeNull()
  })

  it("returns trimmed text for non-empty response", () => {
    const result = parsePhrasesResponse("  有几个值得记一下的表达  ")
    expect(result).toBe("有几个值得记一下的表达")
  })

  it("clamps over-budget response", () => {
    const long = "a".repeat(800)
    const result = parsePhrasesResponse(long)
    expect(result!.length).toBeLessThanOrEqual(600)
  })
})
