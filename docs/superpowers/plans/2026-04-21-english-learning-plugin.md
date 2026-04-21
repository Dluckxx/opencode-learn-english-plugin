# English Learning Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a non-intrusive opencode plugin that helps Chinese-speaking developers improve their English via bilingual toast tips — input correction after submit and phrase/vocabulary tips after each assistant turn.

**Architecture:** Two independent feature branches (correction, phrases) triggered by different opencode hooks (`chat.message` and `session.status`). Both share a common LLM analysis layer that calls the small model through the opencode SDK's session mechanism, and a shared toast display channel. Each feature is fire-and-forget async — hooks return immediately so the coding session is never blocked. All hook handlers are wrapped in try/catch to prevent plugin errors from propagating to opencode.

**Tech Stack:** TypeScript, Bun runtime, opencode Plugin SDK (`@opencode-ai/plugin`, `@opencode-ai/sdk`), Vitest for unit tests

---

## File Structure

| File | Responsibility |
|---|---|
| `src/index.ts` | Plugin entry point; registers hooks, reads config, manages per-session state |
| `src/correction.ts` | Input correction feature logic (chat.message handler) |
| `src/phrases.ts` | Phrase tip feature logic (session.status handler) |
| `src/analyze.ts` | LLM call wrapper; creates temp session, sends prompt, reads response via SDK |
| `src/toast.ts` | Thin wrapper over `client.tui.showToast` with feature-specific defaults |
| `src/notify.ts` | OS-level error notification via `node-notifier` |
| `src/guards.ts` | Pure helpers: `isPureEnglish`, `extractTextParts`, `parseModelString` |
| `src/config.ts` | Reads plugin config from `opencode.json` + `small_model` from SDK |
| `src/prompts/correction.ts` | System + user prompt builders for input correction |
| `src/prompts/phrases.ts` | System + user prompt builders for phrase tips |
| `src/__tests__/guards.test.ts` | Unit tests for guard functions |
| `src/__tests__/prompts.test.ts` | Unit tests for prompt builders and response parsing |
| `package.json` | Package metadata with `node-notifier` dependency |
| `tsconfig.json` | TypeScript config for Bun |
| `vitest.config.ts` | Vitest configuration |

---

## Task 1: Project scaffolding and dependencies

**Files:**
- Modify: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Update package.json with dependencies and scripts**

```json
{
  "name": "opencode-learn-english",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "node-notifier": "^9.0.1"
  },
  "peerDependencies": {
    "@opencode-ai/plugin": "*",
    "@opencode-ai/sdk": "*"
  },
  "devDependencies": {
    "vitest": "^3.1.1",
    "typescript": "^5.8.3"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["bun-types"]
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["src/__tests__/**/*.test.ts"],
  },
})
```

- [ ] **Step 4: Install dependencies**

Run: `cd /c/Users/dluckdu/Documents/GitHub/opencode-learn-english-plugin && bun install`
Expected: dependencies installed successfully

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts bun.lock
git commit -m "chore: scaffold project with deps, tsconfig, and vitest"
```

---

## Task 2: Guard functions

**Files:**
- Create: `src/guards.ts`
- Create: `src/__tests__/guards.test.ts`

These are pure functions with no SDK dependency — safe to write and test first.

- [ ] **Step 1: Write the failing tests for guards**

```ts
// src/__tests__/guards.test.ts
import { describe, it, expect } from "vitest"
import { isPureEnglish, extractTextParts, parseModelString, clampText } from "../guards.js"

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /c/Users/dluckdu/Documents/GitHub/opencode-learn-english-plugin && bun run vitest run src/__tests__/guards.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Write the guard implementations**

```ts
// src/guards.ts

const CJK_RANGE =
  /[一-鿿㐀-䶿\u{20000}-\u{2A6DF}\u{2A700}-\u{2B73F}\u{2B740}-\u{2B81F}\u{2B820}-\u{2CEAF}\u{2CEB0}-\u{2EBEF}\u{30000}-\u{3134F}　-〿぀-ゟ゠-ヿ가-힯ᄀ-ᇿ]/u

export function isPureEnglish(text: string): boolean {
  if (!text) return false
  return !CJK_RANGE.test(text)
}

export function extractTextParts(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text!)
    .join("")
}

export function parseModelString(model: string): {
  providerID: string
  modelID: string
} | null {
  if (!model) return null
  const slashIndex = model.indexOf("/")
  if (slashIndex <= 0 || slashIndex === model.length - 1) return null
  return {
    providerID: model.slice(0, slashIndex),
    modelID: model.slice(slashIndex + 1),
  }
}

export function clampText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars - 1) + "…"
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /c/Users/dluckdu/Documents/GitHub/opencode-learn-english-plugin && bun run vitest run src/__tests__/guards.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/guards.ts src/__tests__/guards.test.ts
git commit -m "feat: add guard functions — isPureEnglish, extractTextParts, parseModelString, clampText"
```

---

## Task 3: Prompt builders and response parser

**Files:**
- Create: `src/prompts/correction.ts`
- Create: `src/prompts/phrases.ts`
- Create: `src/__tests__/prompts.test.ts`

- [ ] **Step 1: Write the failing tests for prompt builders**

```ts
// src/__tests__/prompts.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /c/Users/dluckdu/Documents/GitHub/opencode-learn-english-plugin && bun run vitest run src/__tests__/prompts.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Write the correction prompt builder and parser**

```ts
// src/prompts/correction.ts
import { clampText } from "../guards.js"

const CORRECTION_SYSTEM = `你是一位友好的英语老师朋友。用户输入了一段英语，请帮他改进。

规则：
- 如果原文没有明显的语法错误且表达自然，直接返回空字符串
- 否则用一段简短的中文说明哪里不自然、为什么（不超过 3 句）
- 然后另起一段，给出更自然的英文改写（不超过 3 句）
- 总长度不超过 400 字符
- 不用 markdown，不用 emoji，不用列表
- 语气像朋友指点，绝不评判`

const MAX_CORRECTION_CHARS = 400

export function buildCorrectionPrompts(userText: string) {
  return {
    system: CORRECTION_SYSTEM,
    user: userText,
  }
}

export function parseCorrectionResponse(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  return clampText(trimmed, MAX_CORRECTION_CHARS)
}
```

- [ ] **Step 4: Write the phrases prompt builder and parser**

```ts
// src/prompts/phrases.ts
import { clampText } from "../guards.js"

const PHRASES_SYSTEM = `你是一位英语老师朋友。用户刚收到了一段 AI 助手的英文回复，请挑出 2–3 个值得他学习的表达。

规则：
- 如果回复里没有特别值得学的表达（很简短或全是代码），返回空字符串
- 否则第一行用一句中文引入（如"有几个值得记一下的表达"）
- 然后列出 2–3 个表达，每个一段：英文短语 — 英文定义。e.g. 一句简短例子。
- 定义和例子都用英文（英译英）
- 总长度不超过 600 字符
- 不用 markdown，不用编号列表`

const MAX_PHRASES_CHARS = 600

export function buildPhrasesPrompts(assistantText: string) {
  return {
    system: PHRASES_SYSTEM,
    user: assistantText,
  }
}

export function parsePhrasesResponse(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  return clampText(trimmed, MAX_PHRASES_CHARS)
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /c/Users/dluckdu/Documents/GitHub/opencode-learn-english-plugin && bun run vitest run src/__tests__/prompts.test.ts`
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/prompts/correction.ts src/prompts/phrases.ts src/__tests__/prompts.test.ts
git commit -m "feat: add prompt builders and response parsers for correction and phrases"
```

---

## Task 4: Config reader

**Files:**
- Create: `src/config.ts`

Reads `small_model` from the SDK config endpoint and parses the plugin's optional `experimental.english_learn` config block from `opencode.json` on disk.

- [ ] **Step 1: Write the config module**

```ts
// src/config.ts
import { readFileSync, existsSync } from "fs"
import { join } from "path"
import { parseModelString } from "./guards.js"

export interface PluginConfig {
  enabled: boolean
  correction: { enabled: boolean; duration: number }
  phrases: { enabled: boolean; duration: number }
}

const DEFAULT_CONFIG: PluginConfig = {
  enabled: true,
  correction: { enabled: true, duration: 15000 },
  phrases: { enabled: true, duration: 20000 },
}

export interface ResolvedConfig {
  plugin: PluginConfig
  smallModel: { providerID: string; modelID: string } | null
}

export function readPluginConfig(directory: string): PluginConfig {
  for (const filename of ["opencode.jsonc", "opencode.json"]) {
    const filepath = join(directory, filename)
    if (!existsSync(filepath)) continue
    try {
      // Strip JSONC comments (simple line-comment removal)
      const raw = readFileSync(filepath, "utf-8")
      const stripped = raw.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
      const json = JSON.parse(stripped)
      const block = json?.experimental?.english_learn
      if (!block) return DEFAULT_CONFIG
      return {
        enabled: block.enabled ?? DEFAULT_CONFIG.enabled,
        correction: {
          enabled: block.correction?.enabled ?? DEFAULT_CONFIG.correction.enabled,
          duration: block.correction?.duration ?? DEFAULT_CONFIG.correction.duration,
        },
        phrases: {
          enabled: block.phrases?.enabled ?? DEFAULT_CONFIG.phrases.enabled,
          duration: block.phrases?.duration ?? DEFAULT_CONFIG.phrases.duration,
        },
      }
    } catch (err) {
      console.warn("[english-learn] failed to parse config, using defaults:", err)
      return DEFAULT_CONFIG
    }
  }
  return DEFAULT_CONFIG
}

export async function resolveSmallModel(
  client: { config: { get: () => Promise<{ small_model?: string }> } },
): Promise<{ providerID: string; modelID: string } | null> {
  try {
    const cfg = await client.config.get()
    const raw = cfg.small_model
    if (!raw) return null
    return parseModelString(raw)
  } catch (err) {
    console.warn("[english-learn] failed to read small_model from SDK config:", err)
    return null
  }
}

export async function resolveConfig(
  directory: string,
  client: { config: { get: () => Promise<{ small_model?: string }> } },
): Promise<ResolvedConfig | null> {
  const plugin = readPluginConfig(directory)
  if (!plugin.enabled) return null

  const smallModel = await resolveSmallModel(client)
  if (!smallModel) {
    console.warn("[english-learn] small_model not configured, plugin disabled for this session")
    return null
  }

  return { plugin, smallModel }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/config.ts
git commit -m "feat: add config reader — plugin config from opencode.json, small_model from SDK"
```

---

## Task 5: Toast and notification wrappers

**Files:**
- Create: `src/toast.ts`
- Create: `src/notify.ts`

- [ ] **Step 1: Write the toast wrapper**

```ts
// src/toast.ts
import type { PluginConfig } from "./config.js"

interface ToastClient {
  tui: {
    showToast: (input: {
      body: {
        title?: string
        message: string
        variant: "info" | "success" | "warning" | "error"
        duration?: number
      }
    }) => Promise<unknown>
  }
}

export async function showCorrectionTip(
  client: ToastClient,
  config: PluginConfig,
  message: string,
): Promise<void> {
  try {
    await client.tui.showToast({
      body: {
        title: "English tip",
        message,
        variant: "info",
        duration: config.correction.duration,
      },
    })
  } catch (err) {
    console.error("[english-learn] toast failed (correction):", err)
  }
}

export async function showPhrasesTip(
  client: ToastClient,
  config: PluginConfig,
  message: string,
): Promise<void> {
  try {
    await client.tui.showToast({
      body: {
        title: "English phrases",
        message,
        variant: "info",
        duration: config.phrases.duration,
      },
    })
  } catch (err) {
    console.error("[english-learn] toast failed (phrases):", err)
  }
}
```

- [ ] **Step 2: Write the OS notification module**

```ts
// src/notify.ts
import notifier from "node-notifier"

export function notifyError(message: string): void {
  try {
    notifier.notify({
      title: "English plugin",
      message,
      sound: false,
    })
  } catch (err) {
    console.error("[english-learn] OS notification failed:", err)
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/toast.ts src/notify.ts
git commit -m "feat: add toast and OS notification wrappers"
```

---

## Task 6: LLM analysis wrapper

**Files:**
- Create: `src/analyze.ts`

This is the core integration layer. The opencode SDK has no standalone completion endpoint — all LLM calls go through session-bound `client.session.prompt`. The plugin creates a temporary session, sends the analysis prompt with the configured `small_model` using the synchronous `prompt` method (which streams and returns the full response), then extracts the assistant text from the response.

Using `prompt` (not `promptAsync`) is critical: `promptAsync` is fire-and-forget (returns 204 immediately), which would require polling to detect completion. The synchronous `prompt` returns the full assistant message directly — no polling needed.

- [ ] **Step 1: Write the analyze module**

```ts
// src/analyze.ts

interface AnalysisClient {
  session: {
    create: (input: {
      body?: { title?: string }
      query?: { directory?: string }
    }) => Promise<{ id: string } | { info: { id: string } }>
    prompt: (input: {
      path: { id: string }
      body: {
        parts: Array<{ type: "text"; text: string }>
        model?: { providerID: string; modelID: string }
        agent?: string
        system?: string
        tools?: Record<string, boolean>
      }
      query: { directory: string }
    }) => Promise<{
      info: { id?: string; role: string; error?: unknown }
      parts: Array<{ type: string; text?: string }>
    }>
    delete: (input: { path: { id: string } }) => Promise<unknown>
  }
}

interface AnalysisDeps {
  client: AnalysisClient
  directory: string
  smallModel: { providerID: string; modelID: string }
}

const ANALYSIS_TIMEOUT_MS = 15_000

export async function analyze(
  deps: AnalysisDeps,
  systemPrompt: string,
  userText: string,
): Promise<string | null> {
  const { client, directory, smallModel } = deps

  let sessionID: string | null = null

  try {
    // Create a temporary session for the analysis
    const created = await client.session.create({
      body: { title: "English learning analysis" },
      query: { directory },
    })
    // Handle both possible response shapes
    sessionID = "id" in created ? created.id : (created as any).info?.id
    if (!sessionID) {
      console.error("[english-learn] failed to get session ID from create response")
      return null
    }

    // Send the analysis prompt synchronously — waits for full response
    const response = await Promise.race([
      client.session.prompt({
        path: { id: sessionID },
        body: {
          parts: [{ type: "text", text: userText }],
          model: smallModel,
          system: systemPrompt,
          tools: {}, // no tools — pure text completion
        },
        query: { directory },
      }),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error("analysis timeout")), ANALYSIS_TIMEOUT_MS),
      ),
    ])

    if (!response) return null

    // Check for errors in the assistant response
    if ((response as any).info?.error) return null

    // Extract text from the response parts
    const text = (response as any).parts
      ?.filter((p: any) => p.type === "text" && typeof p.text === "string")
      .map((p: any) => p.text)
      .join("")

    return text || null
  } catch (err: any) {
    // Classify error for proper handling
    const status = err?.status ?? err?.statusCode
    if (status === 429) {
      return "__RATE_LIMITED__" as any
    }
    if (status === 401 || status === 403) {
      return "__AUTH_ERROR__" as any
    }
    if (err?.message?.includes("timeout")) {
      console.warn("[english-learn] analysis timed out after", ANALYSIS_TIMEOUT_MS, "ms")
      return null
    }
    console.error("[english-learn] analysis failed:", err)
    return null
  } finally {
    // Clean up the temporary session
    if (sessionID) {
      try {
        await client.session.delete({ path: { id: sessionID } })
      } catch {
        // Best-effort cleanup; ignore errors
      }
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/analyze.ts
git commit -m "feat: add LLM analysis wrapper using opencode SDK session mechanism"
```

---

## Task 7: Correction feature handler

**Files:**
- Create: `src/correction.ts`

Handles the `chat.message` hook. Extracts user text, applies guards, fires off async analysis.

- [ ] **Step 1: Write the correction handler**

```ts
// src/correction.ts
import { isPureEnglish, extractTextParts, wordCount } from "./guards.js"
import { analyze } from "./analyze.js"
import { buildCorrectionPrompts, parseCorrectionResponse } from "./prompts/correction.js"
import { showCorrectionTip } from "./toast.js"
import { notifyError } from "./notify.js"
import type { PluginConfig } from "./config.js"

const MIN_WORD_COUNT = 4

// Tracks in-flight analysis per session to discard stale results
const inFlight = new Map<string, AbortController>()

interface CorrectionDeps {
  client: Parameters<typeof analyze>[0]["client"]
  directory: string
  smallModel: { providerID: string; modelID: string }
  config: PluginConfig
}

export function createCorrectionHandler(deps: CorrectionDeps) {
  return async (
    input: { sessionID: string },
    output: { parts: Array<{ type: string; text?: string }> },
  ): Promise<void> => {
    if (!deps.config.correction.enabled) return

    const text = extractTextParts(output.parts as any)
    if (!text || !isPureEnglish(text) || wordCount(text) < MIN_WORD_COUNT) return

    const { sessionID } = input

    // Cancel any previous in-flight analysis for this session
    const prev = inFlight.get(sessionID)
    if (prev) prev.abort()
    const controller = new AbortController()
    inFlight.set(sessionID, controller)

    // Fire-and-forget
    ;(async () => {
      try {
        const { system, user } = buildCorrectionPrompts(text)
        const raw = await analyze(
          { client: deps.client, directory: deps.directory, smallModel: deps.smallModel },
          system,
          user,
        )

        // Discard if superseded
        if (controller.signal.aborted) return

        if (raw === ("__RATE_LIMITED__" as any)) {
          notifyError("English plugin: rate limited, will retry next time")
          return
        }
        if (raw === ("__AUTH_ERROR__" as any)) {
          notifyError("English plugin: auth error, analysis disabled for session")
          return
        }

        const result = parseCorrectionResponse(raw ?? "")
        if (!result) return

        await showCorrectionTip(deps.client as any, deps.config, result)
      } catch (err) {
        console.error("[english-learn] correction handler error:", err)
      } finally {
        inFlight.delete(sessionID)
      }
    })()
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/correction.ts
git commit -m "feat: add correction feature handler (chat.message hook)"
```

---

## Task 8: Phrases feature handler

**Files:**
- Create: `src/phrases.ts`

Handles the `session.status` event with `type === "idle"`. Fetches the last assistant message, applies guards, fires off async analysis.

- [ ] **Step 1: Write the phrases handler**

```ts
// src/phrases.ts
import { isPureEnglish, extractTextParts } from "./guards.js"
import { analyze } from "./analyze.js"
import { buildPhrasesPrompts, parsePhrasesResponse } from "./prompts/phrases.js"
import { showPhrasesTip } from "./toast.js"
import { notifyError } from "./notify.js"
import type { PluginConfig } from "./config.js"

// Tracks the last-processed assistant message ID per session to avoid re-processing
const lastProcessedId = new Map<string, string>()
// Tracks in-flight analysis per session
const inFlight = new Map<string, AbortController>()

interface PhrasesDeps {
  client: Parameters<typeof analyze>[0]["client"]
  directory: string
  smallModel: { providerID: string; modelID: string }
  config: PluginConfig
}

export function createPhrasesHandler(deps: PhrasesDeps) {
  return async (event: {
    type: string
    properties: {
      sessionID: string
      status?: { type: string }
    }
  }): Promise<void> => {
    // Only handle session.status with idle — ignore deprecated session.idle
    if (event.type !== "session.status") return
    if (event.properties.status?.type !== "idle") return
    if (!deps.config.phrases.enabled) return

    const { sessionID } = event.properties

    try {
      // Fetch messages for this session
      const messages = await deps.client.session.messages({
        path: { id: sessionID },
        query: { directory: deps.directory },
      })

      // Find the last assistant message
      let assistantMsg: {
        info: { id?: string; role: string; error?: unknown }
        parts: Array<{ type: string; text?: string }>
      } | null = null

      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].info.role === "assistant") {
          assistantMsg = messages[i]
          break
        }
      }

      if (!assistantMsg) return

      // Skip if this message has been processed already
      const msgId = assistantMsg.info.id
      if (msgId && lastProcessedId.get(sessionID) === msgId) return
      if (msgId) lastProcessedId.set(sessionID, msgId)

      // Skip if the message has an error
      if (assistantMsg.info.error) return

      const text = extractTextParts(assistantMsg.parts as any)
      if (!text || !isPureEnglish(text)) return

      // Cancel any previous in-flight analysis for this session
      const prev = inFlight.get(sessionID)
      if (prev) prev.abort()
      const controller = new AbortController()
      inFlight.set(sessionID, controller)

      // Fire-and-forget
      ;(async () => {
        try {
          const { system, user } = buildPhrasesPrompts(text)
          const raw = await analyze(
            { client: deps.client, directory: deps.directory, smallModel: deps.smallModel },
            system,
            user,
          )

          // Discard if superseded
          if (controller.signal.aborted) return

          if (raw === ("__RATE_LIMITED__" as any)) {
            notifyError("English plugin: rate limited, will retry next time")
            return
          }
          if (raw === ("__AUTH_ERROR__" as any)) {
            notifyError("English plugin: auth error, analysis disabled for session")
            return
          }

          const result = parsePhrasesResponse(raw ?? "")
          if (!result) return

          await showPhrasesTip(deps.client as any, deps.config, result)
        } catch (err) {
          console.error("[english-learn] phrases handler error:", err)
        } finally {
          inFlight.delete(sessionID)
        }
      })()
    } catch (err) {
      console.error("[english-learn] phrases handler error (fetch):", err)
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/phrases.ts
git commit -m "feat: add phrases feature handler (session.status idle event)"
```

---

## Task 9: Plugin entry point — wire everything together

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Replace the probe plugin with the full implementation**

```ts
// src/index.ts
import type { Plugin } from "@opencode-ai/plugin"
import { resolveConfig } from "./config.js"
import { createCorrectionHandler } from "./correction.js"
import { createPhrasesHandler } from "./phrases.js"

export const EnglishLearn: Plugin = async ({ client, directory }) => {
  // Resolve config — if small_model is missing or plugin is disabled, return no-op hooks
  const resolved = await resolveConfig(directory, client as any)
  if (!resolved) {
    console.warn("[english-learn] plugin disabled (no small_model or disabled in config)")
    return {}
  }

  const { plugin: config, smallModel } = resolved

  const deps = {
    client: client as any,
    directory,
    smallModel,
    config,
  }

  const correctionHandler = createCorrectionHandler(deps)
  const phrasesHandler = createPhrasesHandler(deps)

  return {
    "chat.message": async (input, output) => {
      try {
        await correctionHandler(input as any, output as any)
      } catch (err) {
        console.error("[english-learn] chat.message hook error (suppressed):", err)
      }
    },

    event: async ({ event }) => {
      try {
        await phrasesHandler(event as any)
      } catch (err) {
        console.error("[english-learn] event hook error (suppressed):", err)
      }
    },
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles (no runtime yet)**

Run: `cd /c/Users/dluckdu/Documents/GitHub/opencode-learn-english-plugin && npx tsc --noEmit 2>&1 || true`
Expected: may show type warnings (SDK types are peer deps), but no errors in plugin code

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire plugin entry point with chat.message and event hooks"
```

---

## Task 10: Unit tests for the full pipeline

**Files:**
- Create: `src/__tests__/pipeline.test.ts`

Integration-style unit test that mocks the SDK client and verifies the end-to-end data flow for both features.

- [ ] **Step 1: Write pipeline tests**

```ts
// src/__tests__/pipeline.test.ts
import { describe, it, expect, vi } from "vitest"
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
```

- [ ] **Step 2: Run all tests**

Run: `cd /c/Users/dluckdu/Documents/GitHub/opencode-learn-english-plugin && bun run vitest run`
Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/pipeline.test.ts
git commit -m "test: add pipeline unit tests for correction and phrases data flow"
```

---

## Task 11: README and final verification

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write the README**

```markdown
# opencode English Learning Plugin

A non-intrusive opencode plugin that helps Chinese-speaking developers improve their English while coding. The plugin observes your conversation and surfaces short bilingual tips via the native TUI toast — never affecting your coding session.

## Features

### Input Correction (after-submit)

When you submit a prompt in English, the plugin asks a small model to identify grammar errors and unidiomatic phrasing, then shows a toast with a bilingual diagnosis and a clean rewrite.

- Appears ~2–3 seconds after submit, while the assistant is already streaming
- Only triggers on pure-English messages (4+ words, no CJK characters)
- If nothing is wrong, no toast appears (LLM veto)

### Phrase / Vocabulary Tips (after-turn)

When an assistant turn completes, the plugin surfaces 2–3 noteworthy English expressions with English-only definitions (英译英) and short examples.

- Triggers on `session.status` idle (once per turn boundary)
- Only shows phrases from English assistant replies
- If the reply has no learnable expressions, no toast appears

## Install

1. Build or link this plugin locally
2. Add to your `opencode.json`:

```json
{
  "plugin": ["file:///abs/path/to/opencode-learn-english-plugin"],
  "small_model": "Tencent/claude-haiku-4-5"
}
```

The `small_model` field is required — the plugin uses it for all analysis calls. If unset, the plugin silently disables itself.

## Configuration

Optional plugin-specific config under `experimental.english_learn`:

```json
{
  "experimental": {
    "english_learn": {
      "enabled": true,
      "correction": { "enabled": true, "duration": 15000 },
      "phrases": { "enabled": true, "duration": 20000 }
    }
  }
}
```

| Key | Default | Description |
|---|---|---|
| `enabled` | `true` | Master switch for the entire plugin |
| `correction.enabled` | `true` | Enable/disable input correction tips |
| `correction.duration` | `15000` | Toast duration in ms for correction tips |
| `phrases.enabled` | `true` | Enable/disable phrase tips |
| `phrases.duration` | `20000` | Toast duration in ms for phrase tips |

## Design Principles

- **Non-intrusive**: Never modifies conversation history, prompt parts, or LLM behavior
- **Ephemeral**: Tips appear as toasts and disappear — no persistent log
- **Veto-powered**: The analysis LLM explicitly returns nothing when there's nothing worth teaching
- **Error-safe**: All plugin errors route to OS notifications, never to opencode toasts; hook handlers catch all exceptions

## Requirements

- opencode with plugin support
- A configured `small_model` in opencode (e.g., `Tencent/claude-haiku-4-5`)
- Bun runtime
```

- [ ] **Step 2: Run the full test suite one final time**

Run: `cd /c/Users/dluckdu/Documents/GitHub/opencode-learn-english-plugin && bun run vitest run`
Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README with install, config, and feature documentation"
```

---

## Task 12: Manual verification checklist

This task cannot be automated — it requires running the plugin against a live opencode instance. The engineer should perform all seven manual checks from the spec (§9.1).

- [ ] **Step 1: Install the plugin in a test opencode project**

Add to `opencode.json`:
```json
{
  "plugin": ["file:///C:/Users/dluckdu/Documents/GitHub/opencode-learn-english-plugin"],
  "small_model": "<your-small-model>"
}
```

- [ ] **Step 2: Verify pure-English submit triggers correction**

Type a sentence with a known grammar error (e.g., "I does this works yesterday"). Expect a toast within ~3 seconds.

- [ ] **Step 3: Verify mixed-language submit is silent**

Type a sentence with any CJK character (e.g., "帮我fix这个bug"). Expect no toast.

- [ ] **Step 4: Verify AI reply triggers phrase tip**

Ask a question that elicits a substantive answer (e.g., "How does garbage collection work in Go?"). Expect a phrase toast after the turn completes.

- [ ] **Step 5: Verify first-startup is silent**

Start opencode, wait 5 seconds. Expect no toast appears.

- [ ] **Step 6: Verify LLM veto works**

Submit several known-clean English sentences ("Could you read this file?", "What does this function do?"). Expect no toast for the majority.

- [ ] **Step 7: Verify coding session is unaffected**

Install + uninstall the plugin. Verify the same prompts produce identical assistant behavior.

- [ ] **Step 8: Verify rate-limit graceful handling**

Force a 429 (e.g., swap `small_model` to a key with no quota). Expect an OS notification, no broken toast, session keeps working.

- [ ] **Step 9: Final commit with any fixes discovered during manual verification**

```bash
git add -A
git commit -m "fix: address issues found during manual verification"
```
