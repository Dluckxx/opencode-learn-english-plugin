import { describe, it, expect } from "vitest"
import { readPluginConfig } from "../config.js"
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

function makeFixture(contents: string, filename = "opencode.json"): string {
  const dir = mkdtempSync(join(tmpdir(), "english-learn-config-"))
  writeFileSync(join(dir, filename), contents)
  return dir
}

describe("readPluginConfig", () => {
  it("returns enabled=true when no config file exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "english-learn-empty-"))
    try {
      const cfg = readPluginConfig(dir)
      expect(cfg.enabled).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("returns enabled=true when config has no experimental.english_learn block", () => {
    const dir = makeFixture('{"$schema":"https://opencode.ai/config.json"}')
    try {
      expect(readPluginConfig(dir).enabled).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("respects enabled=false explicitly", () => {
    const dir = makeFixture(
      '{"experimental":{"english_learn":{"enabled":false}}}',
    )
    try {
      expect(readPluginConfig(dir).enabled).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("handles JSONC comments (opencode.jsonc)", () => {
    const dir = makeFixture(
      '{\n  // disable the plugin for this project\n  "experimental": { "english_learn": { "enabled": false } }\n}',
      "opencode.jsonc",
    )
    try {
      expect(readPluginConfig(dir).enabled).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("falls back to defaults on parse error", () => {
    const dir = makeFixture("{this is not valid json")
    try {
      expect(readPluginConfig(dir).enabled).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("prefers opencode.jsonc over opencode.json when both exist", () => {
    const dir = mkdtempSync(join(tmpdir(), "english-learn-both-"))
    try {
      writeFileSync(
        join(dir, "opencode.jsonc"),
        '{"experimental":{"english_learn":{"enabled":false}}}',
      )
      writeFileSync(
        join(dir, "opencode.json"),
        '{"experimental":{"english_learn":{"enabled":true}}}',
      )
      // jsonc is tried first in our loop
      expect(readPluginConfig(dir).enabled).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
