import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { EnglishLearn } from "../index.js"
import { ENGLISH_TIPS_INSTRUCTION } from "../tips-instruction.js"

// Minimal stub for opencode's PluginInput. We only consume `directory`;
// everything else is unused by the system-transform hook.
function makePluginInput(directory: string) {
  return {
    client: {} as any,
    project: {} as any,
    directory,
    worktree: directory,
    serverUrl: new URL("http://localhost:4096"),
    $: {} as any,
  }
}

describe("EnglishLearn plugin", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "english-learn-plugin-"))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("registers experimental.chat.system.transform hook", async () => {
    const hooks = await EnglishLearn(makePluginInput(tmpDir) as any)
    expect(hooks["experimental.chat.system.transform"]).toBeTypeOf("function")
  })

  it("appends tutor instruction to the last system block on real turns", async () => {
    const hooks = await EnglishLearn(makePluginInput(tmpDir) as any)
    const fn = hooks["experimental.chat.system.transform"]!

    const system = ["You are a helpful coding assistant.", "Session-specific rules here."]
    await fn(
      { sessionID: "ses_main", model: { providerID: "x", modelID: "y" } as any },
      { system },
    )

    // Appended to the LAST entry to preserve the cached prefix
    expect(system[0]).toBe("You are a helpful coding assistant.")
    expect(system[1]).toContain("Session-specific rules here.")
    expect(system[1]).toContain("English Learning Tips")
    expect(system[1].endsWith(ENGLISH_TIPS_INSTRUCTION)).toBe(true)
  })

  it("skips helper calls with empty system prompt (title gen, compaction, etc.)", async () => {
    const hooks = await EnglishLearn(makePluginInput(tmpDir) as any)
    const fn = hooks["experimental.chat.system.transform"]!

    // First call establishes the primary session
    const mainSystem = ["Main system prompt."]
    await fn(
      { sessionID: "ses_main", model: { providerID: "x", modelID: "y" } as any },
      { system: mainSystem },
    )

    // Helper call with empty system from the same session
    const system: string[] = []
    await fn(
      { sessionID: "ses_main", model: { providerID: "x", modelID: "y" } as any },
      { system },
    )

    // Empty in, empty out — don't pollute title generation with tips
    expect(system).toEqual([])
  })

  it("respects experimental.english_learn.enabled=false", async () => {
    writeFileSync(
      join(tmpDir, "opencode.json"),
      '{"experimental":{"english_learn":{"enabled":false}}}',
    )
    const hooks = await EnglishLearn(makePluginInput(tmpDir) as any)
    const fn = hooks["experimental.chat.system.transform"]!

    const system = ["Original system prompt."]
    await fn(
      { sessionID: "ses_test", model: { providerID: "x", modelID: "y" } as any },
      { system },
    )

    // Unchanged when disabled
    expect(system).toEqual(["Original system prompt."])
  })

  it("skips sub-agent sessions (different sessionID from primary)", async () => {
    const hooks = await EnglishLearn(makePluginInput(tmpDir) as any)
    const fn = hooks["experimental.chat.system.transform"]!

    // First call with main session — establishes primary
    const mainSystem = ["Main system prompt."]
    await fn(
      { sessionID: "ses_main", model: { providerID: "x", modelID: "y" } as any },
      { system: mainSystem },
    )
    expect(mainSystem[0]).toContain("English Learning Tips")

    // Second call with a DIFFERENT session ID — sub-agent, should be skipped
    const subAgentSystem = ["Sub-agent system prompt."]
    await fn(
      { sessionID: "ses_subagent_abc", model: { providerID: "x", modelID: "y" } as any },
      { system: subAgentSystem },
    )
    expect(subAgentSystem).toEqual(["Sub-agent system prompt."])
  })

  it("allows multiple calls from the same primary session", async () => {
    const hooks = await EnglishLearn(makePluginInput(tmpDir) as any)
    const fn = hooks["experimental.chat.system.transform"]!

    // First call
    const system1 = ["First turn."]
    await fn(
      { sessionID: "ses_main", model: { providerID: "x", modelID: "y" } as any },
      { system: system1 },
    )
    expect(system1[0]).toContain("English Learning Tips")

    // Second call, same session
    const system2 = ["Second turn."]
    await fn(
      { sessionID: "ses_main", model: { providerID: "x", modelID: "y" } as any },
      { system: system2 },
    )
    expect(system2[0]).toContain("English Learning Tips")
  })

  it("instruction includes the ASCII-art frame with aligned splitters", () => {
    // Lock in the format we told the user about — regression guard against
    // accidentally reformatting the tutor prompt.
    expect(ENGLISH_TIPS_INSTRUCTION).toContain("`★ English Tips ─")
    expect(ENGLISH_TIPS_INSTRUCTION).toContain("Prompt:")
    expect(ENGLISH_TIPS_INSTRUCTION).toContain("Phrases:")
    expect(ENGLISH_TIPS_INSTRUCTION).toContain("`──")
    // The fixed-width alignment rule
    expect(ENGLISH_TIPS_INSTRUCTION).toContain("EXACTLY the same total character width")
    expect(ENGLISH_TIPS_INSTRUCTION).toContain("55 char")
  })

  it("instruction explicitly forbids correcting non-English (CJK) input", () => {
    // Guard against regression where Chinese input was "corrected" to English
    expect(ENGLISH_TIPS_INSTRUCTION).toContain("Chinese/Japanese/Korean characters")
    expect(ENGLISH_TIPS_INSTRUCTION).toContain("COMPLETELY SKIP")
    expect(ENGLISH_TIPS_INSTRUCTION).toContain("Do NOT translate or")
  })
})
