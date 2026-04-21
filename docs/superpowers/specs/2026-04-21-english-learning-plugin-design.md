# opencode English Learning Plugin — Design Spec

**Date:** 2026-04-21
**Status:** Approved design, ready for implementation planning
**Probe verified:** Toast UI renders bilingual multi-line content correctly

---

## 1. Purpose

A non-intrusive opencode plugin that helps a Chinese-speaking developer improve their English while using opencode for coding work. The plugin observes — never participates in — the conversation, and surfaces short bilingual tips via the native TUI toast.

The plugin must never affect the coding session: the conversation history, prompt parts, and LLM behavior stay exactly what they would be without the plugin installed.

## 2. Features

Two features, two triggers, one shared display channel.

### 2.1 Input correction tip (after-submit)

When the user submits a prompt that is pure English, the plugin asks a small model to identify grammar errors and unidiomatic phrasings, then shows a single toast with a bilingual diagnosis and a clean rewrite.

- **Trigger:** `chat.message` hook fires immediately after the user submits a message
- **Timing:** analysis runs async; toast typically appears 2–3 seconds after submit, usually while the assistant is already streaming its reply
- **Educational framing:** the user has already sent the imperfect message; the tip prepares them to write better next time, not to "fix" the current turn
- **Voice:** one short paragraph in Chinese describing what's off and why, followed by a clean English rewrite. No bullet points, no severity labels, no emoji. The voice is a friendly bilingual friend, never judgmental.

### 2.2 Phrase / vocabulary tip (after-turn)

When an assistant turn fully completes, the plugin asks a small model to surface 2–3 noteworthy English expressions worth learning from the reply, with English-only definitions (英译英) and short examples.

- **Trigger:** `session.status` event with `status.type === "idle"` (this is the new event; `session.idle` is the deprecated alias). Fires once per busy→idle transition, regardless of how many tool calls happened during the turn.
- **Voice:** one short Chinese intro line ("有几个值得记一下的表达"), then 2–3 phrases with English definitions and one short example each.

### 2.3 Shared invariants

Both features:

- Read-only on `parts[]` — never mutate, never inject content into the session
- The analysis LLM has explicit veto power: prompts instruct it to return an empty/no-op response when there is nothing genuinely worth teaching, and the plugin shows no toast in that case
- Plugin errors (rate limit, network, malformed response, missing config) route to OS-level notifications, never to opencode toasts
- Use the model configured at `small_model` in `opencode.json`; if unset, log once and stay silent for the session
- Bilingual output: Chinese for explanations and meta-commentary, English for the actual material being learned

## 3. UX

### 3.1 Toast presentation

Probe-verified rendering surface:

- Position: top-right, absolute, anchored at `top: 2, right: 2`
- Width: `min(60, terminalWidth - 6)` columns, word-wrapped on word boundaries
- Body: plain text with `\n` for hard line breaks (verified to render as expected, including CJK + Latin mixed content and CJK punctuation)
- Title: optional bold line above body
- Variant: colored border via `info | success | warning | error` — we use `info` for both feature tips
- Duration: configurable; defaults below

Both tip toasts use:

- `variant: "info"`
- `title: "English tip"` (input correction) or `"English phrases"` (phrase tip)
- Default `duration`: 15000 ms (input correction), 20000 ms (phrase tip — slightly longer because it has more content to read)

Only one toast renders at a time; a new toast replaces the current one. This is opencode's built-in behavior and we do not work around it. If both triggers fire close together (correction tip from submit, then phrase tip when the turn completes), the phrase tip naturally supersedes the correction tip — acceptable for v1.

### 3.2 Toast content shape

Input correction example:

```
意思清楚，但有几处不太自然：crashed at gamemode loading phase 少了
冠词；does this time reproduced 时态混了，应该 did...reproduce；
proved the game load... 偏口语堆叠。

改写一下会更顺：
Last time we crashed during the gamemode loading phase. Did this
run reproduce the issue, or did the game load the gamemode
successfully?
```

Phrase tip example:

```
回复里有几个值得记一下的表达：

"narrow down" — to make a list of possibilities smaller by
removing options that don't fit.
e.g. "Let's narrow down the cause."

"under the hood" — referring to the internal workings of
something, especially technical systems.
e.g. "Under the hood, it uses a hash map."
```

### 3.3 Output budget

The analysis prompt enforces a length budget (~400 chars / ~6 wrapped lines for input correction, ~600 chars / ~10 wrapped lines for phrase tips) so toasts stay reasonable on screen. The plugin clamps any over-budget response by truncating with an ellipsis as a defensive fallback.

## 4. Architecture

### 4.1 Layout

```
opencode-learn-english-plugin/
├── package.json
├── README.md
├── tsconfig.json                  (only if Bun loader needs it; probe ran without)
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-04-21-english-learning-plugin-design.md
└── src/
    ├── index.ts                   plugin entry; registers hooks
    ├── correction.ts              input correction feature (chat.message)
    ├── phrases.ts                 phrase tip feature (session.status)
    ├── analyze.ts                 LLM call wrapper; reads small_model from config
    ├── toast.ts                   thin wrapper over client.tui.showToast
    ├── notify.ts                  OS notification for plugin errors
    ├── guards.ts                  pure helpers: isPureEnglish, hasAssistantMessage
    └── prompts/
        ├── correction.ts          system + user prompt builders for correction
        └── phrases.ts             system + user prompt builders for phrase tips
```

Each module is small and has one purpose. `src/index.ts` is the only file that touches the plugin Hook surface; everything else is plain async functions.

### 4.2 Data flow — input correction

1. User submits a prompt
2. opencode core builds the user message and parts, then calls `chat.message` hooks
3. Plugin's `chat.message` handler:
   1. Extract plain text from `output.parts` (concatenate `type: "text"` parts; ignore file/agent/etc.)
   2. Apply guards: non-empty, pure-English (no CJK), length above a small floor (e.g. ≥ 4 words). Skip silently if any fails.
   3. Spawn `analyze.correction(text)` as a fire-and-forget promise. Hook returns immediately so opencode is not blocked.
   4. When analysis resolves: if non-empty result, call `toast.show(...)`. If empty result (LLM said "nothing to teach"), do nothing. If error, call `notify.error(...)`.
4. The plugin never modifies `output.parts`. The user's original message proceeds to the LLM unchanged.

### 4.3 Data flow — phrase tip

1. Assistant turn streams; tool calls execute; eventually the turn completes
2. opencode publishes `session.status` with `status.type === "idle"`
3. Plugin's `event` handler:
   1. Filter: only handle `session.status` events where `status.type === "idle"` (and ignore the deprecated `session.idle` to avoid double-fire)
   2. Apply guards: fetch session messages via SDK, find the last assistant message, skip if none (startup case), skip if it has an error, skip if it has been seen before (track last-processed assistant message id per session in memory)
   3. Spawn `analyze.phrases(assistantText)` fire-and-forget
   4. On resolve: same toast / no-op / OS-notify branches as above
4. No `setTimeout` debounce. The `idle` transition happens once per turn boundary; that *is* the debounce. Adding a 3-sec timer on top would only delay the toast without changing semantics.

### 4.4 Why no debounce / no rate limiting in v1

- Idle fires once per turn — naturally rate-limited to "once per AI completion"
- The LLM-veto path means most short factual answers produce no toast at all
- Adding throttle (e.g. "max one phrase tip per 5 minutes") is a tuning parameter we'd add only if real usage shows noise. Ship without it; revisit after dogfooding.

### 4.5 Concurrency control

- `chat.message` and `session.status` handlers each spawn an async analysis. Multiple analyses can be in flight (e.g. user submits → input correction starts → AI streams → finishes → phrase analysis starts before correction finishes). This is concurrency control, not throttling — both *kinds* of analysis still run on every trigger.
- Per-session state tracks the in-flight correction analysis. If a new correction analysis starts for the same session while the previous one is in flight, the previous one is abandoned (its result is discarded on resolve). Same for phrase analyses. This prevents stale tips from old prompts overwriting fresh ones.
- Plugin lifecycle is process-bound; opencode does not call any teardown hook. We rely on Node's natural cleanup of in-flight promises on process exit.

## 5. Configuration

The plugin reads two things:

### 5.1 `small_model` from opencode config

Resolved by reading `Config.get()` indirectly through the SDK (see §6.2). If `small_model` is unset, the plugin logs one line and disables analysis for the rest of the session — no toasts, no errors. This matches opencode's existing behavior where features depending on `small_model` (e.g. title generation) silently degrade.

### 5.2 Optional plugin config block

In `opencode.json`:

```json
{
  "plugin": ["file:///abs/path/to/opencode-learn-english-plugin"],
  "experimental": {
    "english_learn": {
      "enabled": true,
      "correction": { "enabled": true, "duration": 15000 },
      "phrases":    { "enabled": true, "duration": 20000 }
    }
  }
}
```

All keys optional; defaults shown above. The block lives under `experimental` because the schema is plugin-defined and not validated by opencode core. The plugin reads its own config by parsing `opencode.json` from the project directory at startup (provided as `directory` in `PluginInput`).

If config parse fails, both features default to enabled with default durations and the plugin logs a warning.

## 6. opencode integration details (verified)

### 6.1 Plugin shape

From `D:\UGit\ugcm-agent-dev\opencode\packages\plugin\src\index.ts`:

```ts
export type Plugin = (input: PluginInput) => Promise<Hooks>
export type PluginInput = {
  client: ReturnType<typeof createOpencodeClient>
  project: Project
  directory: string
  worktree: string
  serverUrl: URL
  $: BunShell
}
```

We use `client` (SDK), `directory` (to find `opencode.json`), and nothing else.

### 6.2 Hooks used

- `chat.message: (input, output) => Promise<void>` — fires after user message + parts are built, before LLM call. We read `output.parts`, never mutate.
- `event: (input: { event: Event }) => Promise<void>` — receives all bus events. We filter for `session.status` (the new, non-deprecated event from `session/status.ts:28-34`).

### 6.3 SDK calls used

- `client.tui.showToast({ body: { title?, message, variant, duration? } })` — verified via probe at `packages/sdk/js/src/gen/sdk.gen.ts:1118`
- **Session message read** — exact SDK method TBD by reading `packages/sdk/js/src/gen/sdk.gen.ts` for the session-messages or session-get method during implementation. The plugin needs the assistant message text and its `error` field. This is a low-risk lookup, not an open design question.
- **LLM analysis call** — open question, must be resolved in implementation step 1:

  - **Option A (preferred):** reuse opencode's completion through the SDK if it exposes a one-shot, no-session "complete this prompt with this model" endpoint. Inherits all of opencode's provider auth and abstraction.
  - **Option B (fallback):** add `@ai-sdk/openai`, `@ai-sdk/Tencent`, etc. as plugin deps and call providers directly using credentials from environment / opencode auth store. More setup but provider-agnostic.

  The implementation plan must verify Option A's feasibility before writing analysis code. If Option A is unavailable, Option B becomes the default and the plugin documents required env vars per provider.

### 6.4 Error boundary fact

opencode's plugin dispatcher (`packages/opencode/src/plugin/index.ts:106-121`) does **not** catch exceptions thrown by hook functions. A throw aborts the user's turn. Therefore: every hook handler in this plugin is wrapped in `try/catch`; nothing escapes. This is non-negotiable.

## 7. Prompts to the small model

### 7.1 Input correction prompt (sketch)

System prompt (Chinese):

> 你是一位友好的英语老师朋友。用户输入了一段英语，请帮他改进。
>
> 规则：
> - 如果原文没有明显的语法错误且表达自然，直接返回空字符串
> - 否则用一段简短的中文说明哪里不自然、为什么（不超过 3 句）
> - 然后另起一段，给出更自然的英文改写（不超过 3 句）
> - 总长度不超过 400 字符
> - 不用 markdown，不用 emoji，不用列表
> - 语气像朋友指点，绝不评判

User prompt: the raw English text the user submitted.

The plugin parses the response: empty/whitespace-only → no toast; otherwise → toast.

### 7.2 Phrase tip prompt (sketch)

System prompt (Chinese):

> 你是一位英语老师朋友。用户刚收到了一段 AI 助手的英文回复，请挑出 2–3 个值得他学习的表达。
>
> 规则：
> - 如果回复里没有特别值得学的表达（很简短或全是代码），返回空字符串
> - 否则第一行用一句中文引入（如"有几个值得记一下的表达"）
> - 然后列出 2–3 个表达，每个一段：英文短语 — 英文定义。e.g. 一句简短例子。
> - 定义和例子都用英文（英译英）
> - 总长度不超过 600 字符
> - 不用 markdown，不用编号列表

User prompt: the assistant's reply text (concatenation of all `type: "text"` parts from the latest assistant message).

## 8. Error handling matrix

| Failure mode | Behavior |
|---|---|
| `small_model` not configured | Log once, disable analysis for session, no toast, no notify |
| Provider rate-limit (429) | OS notification: "English plugin: rate limited, will retry next time"; no toast |
| Provider auth error | OS notification with error detail; disable analysis for session |
| Network timeout (>15 sec) | Abandon analysis, OS notification (debug-level — only if debug flag set) |
| Malformed LLM response | Treat as "no tip"; log to plugin debug log; no toast |
| Toast SDK call fails | Log; do not retry; do not notify (we'd be using the same broken channel) |
| Hook handler throws | Caught by mandatory try/catch; logged; never propagates to opencode |

OS notification implementation: use `node-notifier` or equivalent cross-platform package. v1 keeps these notifications minimal — one line, no actions.

## 9. Testing approach

### 9.1 Manual verification (must-pass before merge)

1. **Pure-English submit triggers correction:** type a sentence with a known grammar error; toast appears within ~3 sec
2. **Mixed-language submit is silent:** type a sentence with any CJK character; no toast fires
3. **AI reply triggers phrase tip:** ask a question that elicits a substantive answer; toast appears after the turn completes
4. **First-startup is silent:** start opencode, wait 5 sec; no toast appears
5. **LLM veto works:** submit several known-clean English sentences ("Could you read this file?", "What does this function do?"); expect no toast for the majority. Some over-eagerness from the LLM is acceptable; constant false positives are not.
6. **Coding session is unaffected:** install + uninstall the plugin; verify the same prompts produce identical assistant behavior (history, tool calls, content)
7. **Rate-limit graceful:** force a 429 (e.g. swap small_model to a key with no quota); OS notification appears, no broken toast, session keeps working

### 9.2 Unit tests (where they pay off)

- `guards.isPureEnglish(text)` — table-driven cases incl. accented Latin (café), emoji, code blocks, mixed CJK
- Prompt builders — golden-string snapshots for stability
- Response parser — empty / whitespace / over-budget / well-formed cases

No mocks of the opencode plugin host; integration is verified by manual run against real opencode.

## 10. What we explicitly do not build (v1)

- ❌ A learning journal / persistent log of past tips — toast is ephemeral by design
- ❌ Slash command `/en` or any explicit user-triggered analysis — auto-only
- ❌ A "review" or "summary" command
- ❌ Spaced-repetition tracking, SRS export, Anki integration
- ❌ Any UI surface beyond toast (no sidebar, no statusline, no inline annotations)
- ❌ Per-message opt-out controls (toggle is whole-plugin only via config)
- ❌ Throttling / rate limiting beyond what the natural triggers give us
- ❌ Streaming partial tips — analysis is one-shot, toast is one-shot

These are deliberately deferred to keep v1 small. If usage reveals a clear need for any of them, they become v2 candidates.

## 11. Risks & open questions

- **CJK width counting in opentui:** probe showed the example renders cleanly. If real usage produces a sentence where CJK + Latin wrap awkwardly, mitigation is to manually pre-wrap CJK lines at ~25 chars in the analysis prompt.
- **Toast height with maximum-budget content:** untested. If a 10-line phrase tip pushes other UI off-screen, reduce phrase budget or drop to 2 phrases.
- **`session.status` firing semantics during retries:** verified that `retry` is a distinct status, so we should only act on `idle`. But if a turn errors and then retries successfully, we may see idle once after the final success — confirm during dogfooding.
- **Provider parity for `small_model`:** if user's small_model lives behind a provider that opencode's SDK doesn't expose for one-shot completions, we'll need the direct-provider fallback (§6.3).
- **Two toasts close together:** correction tip then phrase tip both within ~5 sec — second supersedes first. May want to delay phrase tip slightly or merge content if this turns out to be common in practice.

## 12. Acceptance criteria

The plugin is considered done for v1 when:

1. All seven manual verification steps in §9.1 pass on Windows + macOS
2. Plugin loads cleanly via `file://` install in `opencode.json`
3. Removing the plugin entry restores baseline opencode behavior with no residue
4. README documents install + the two features + how to disable each via config
5. The spec in this file matches the implemented behavior (or this file is updated)
