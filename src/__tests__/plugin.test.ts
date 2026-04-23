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
      { sessionID: "ses_test", model: { providerID: "x", modelID: "y" } as any },
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

    const system: string[] = []
    await fn(
      { sessionID: "ses_test", model: { providerID: "x", modelID: "y" } as any },
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

  it("instruction includes the ASCII-art frame the user specified", () => {
    // Lock in the format we told the user about — regression guard against
    // accidentally reformatting the tutor prompt. Splitters must be wrapped
    // in backticks for TUI highlighting.
    expect(ENGLISH_TIPS_INSTRUCTION).toContain("`★ English Tips ─")
    expect(ENGLISH_TIPS_INSTRUCTION).toContain("Prompt:")
    expect(ENGLISH_TIPS_INSTRUCTION).toContain("Phrases:")
    expect(ENGLISH_TIPS_INSTRUCTION).toContain("`──")
    expect(ENGLISH_TIPS_INSTRUCTION).toContain("dash length")
  })
})
