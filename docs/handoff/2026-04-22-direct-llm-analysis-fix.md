# Handoff: Direct LLM Analysis Fix

Date: 2026-04-22
Session focus: Debug and fix the opencode English learning plugin end-to-end; pivot from broken session-based LLM calls to direct HTTP against the codebuddy provider.

## User Requests (Verbatim)

- "this plugin has been implemented, and now needs to test and debug, verify if it's work in opencode. previously i changed some files to do the fix for some unknow issues. currently, we have a clair errors needs to resolve, when first prompt user sent, the error popups with failed to get session ID from create response. fix that. then i will test again."
- "continue, i disabled plugin in current session to prevent occuring errors with opencode. so keep focus on issue fix."
- "i sent messages, but no reply with agent. wait few seconds, is errors with analysis timed out after 15000 ms. this plugin should never block normal flow with opencode. it work ouside the main agent loop. fix that."
- "but after i sent a message, still be very long lag after the opencode respose me"
- "you fixed the block, but feature still broken with errors. prompt returned error: [screenshot showing `Cannot read ...png (this model does not support image input)`]"
- "the issue still exist. did you run build of the plugins? die i test it properly?"
- "[screenshot showing `sessionID: "{id}"` + `Invalid string: must start with \"ses\"`] same issue. can you just debug by yourself? do end to end verify, with opencode cmd and log capture analysis?"
- "can't we just spwan a async task when triggered analysis by the session hook? i need you to fix the thing with full feature we designed in spec doc."
- "write hanoff doc record the work"

## Goal

Commit the working direct-HTTP analysis path and verify both features (input correction + phrase tips) render toasts in the interactive TUI on real user turns.

## Work Completed

- Diagnosed (via `C:\Users\dluckdu\.local\share\opencode\log\*.log`) that the plugin was **silently failing to load** with `Unexpected }` for multiple turns — every "error" the user saw was either stale state or opencode's own error path, not my edits taking effect.
- Proved via `opencode run` log capture that the SDK's `session.prompt` in a newly-created temp session **does not work** for this plugin:
  - v2-style flat params → server returns `sessionID: "{id}"` + `invalid_format starts_with "ses"` (the v1 runtime client never substitutes the path placeholder).
  - v1-style `{ path: { id }, body, query }` with `noReply: false` → hangs indefinitely (small model never produces a reply in an empty temp session).
  - `noReply: true` + poll `session.messages` → the assistant message never appears; polls until timeout.
  - `session.init` before prompt → same hang.
- Pivoted to the spec's **Option B** (§6.3 of `docs/superpowers/specs/2026-04-21-english-learning-plugin-design.md`): call the provider directly over HTTP, using credentials from opencode's auth store.
- Fully rewrote `src/analyze.ts` to:
  - Read OAuth credentials from `~/.local/share/opencode/auth.json` (codebuddy entry is `{ type: "oauth", access, refresh, expires }`).
  - Decode the JWT access token to pull `sub` (userId), `realm_access.roles → ent-member:<id>` (enterpriseId), and `iss` hostname (domain).
  - POST to `https://copilot.tencent.com/v2/chat/completions` with `Authorization: Bearer`, `X-User-Id`, `X-Enterprise-Id`, `X-Tenant-Id`, `X-Domain` headers.
  - Stream SSE (codebuddy rejects non-stream with HTTP 400 code 11101) and accumulate `choices[0].delta.content`.
  - 15s AbortController timeout, circuit breaker on auth errors, 429 → `__RATE_LIMITED__`, 401/403 → `__AUTH_ERROR__`.
- Made all hook handlers **truly non-blocking**: `chat.message` and `event` handlers are sync `void` returns that enqueue fire-and-forget IIFEs. The `ensureConfig()` call is non-blocking with a pending-actions queue that flushes once config resolves.
- `src/correction.ts` now skips entirely when the user's message has any non-text parts (images/files) — small model doesn't support images.
- `src/phrases.ts` simplified: kept `session.messages` (GET — safe) for fetching the assistant reply, removed the stale `getApiStyle` dependency.
- `src/toast.ts` hardened: v1-style nested `{ body: {...} }` first, flat-param fallback, never throws.
- `src/config.ts` tolerates both `{ data: { small_model } }` and flat `{ small_model }` shapes from `client.config.get()`.
- Verified E2E: `opencode run "me want eat apples please tell recipe"` → server log shows `POST /tui/show-toast status=completed` — the correction toast actually rendered.
- All 39 unit tests (`guards`, `prompts`, `pipeline`) still pass; `bun build --target=bun src/index.ts` succeeds.

## Current State

- Working tree dirty on 9 files (see below). Nothing committed yet.
- `npm test` → 3 test files / 39 tests passing.
- `bun build src/index.ts` → bundles cleanly (137 KB).
- Plugin loads without errors in opencode 1.14.20 (confirmed in latest server log).
- End-to-end: correction feature triggers, calls codebuddy API directly, toast renders.
- Phrase feature not yet observed end-to-end on an idle event (needs an interactive session with a substantive assistant reply to confirm).

### Uncommitted changes (`git status --porcelain`)

```
 M .gitignore
 M .opencode/opencode.json
 M bun.lock
 M src/analyze.ts
 M src/config.ts
 M src/correction.ts
 M src/index.ts
 M src/phrases.ts
 M src/toast.ts
```

## Pending Tasks

- Commit the direct-HTTP analysis path (logical atomic commits: analyze rewrite; non-blocking hooks; correction/phrases/toast/config hardening).
- Confirm the phrase tip actually fires on a real assistant-turn idle in the interactive TUI (only correction has been observed triggering in `opencode run`).
- Extend `buildProviderCall` in `src/analyze.ts` to support other providers currently in user's `auth.json`: `kimi-for-coding` (ApiAuth), `zhipuai-coding-plan` (ApiAuth), `github-copilot` (OAuth). Today only `codebuddy` is wired; others fall through to "unsupported provider" circuit-breaker.
- Clean up test debug artifacts: `debug.log`, `debug2.log`…`debug-final.log`, `debug-stream.log`, `debug-correction.log` in the repo root are gitignored but noisy.
- Update README/spec to document the Option B pivot (the spec flagged this as a risk in §6.3 and §11 "provider parity" — now resolved for codebuddy only).
- Consider whether to wrap the plugin in its own subdir install (`.opencode/` subdir plugin currently fails to load — not a real issue since the main plugin path works, but the repeated error in the log is noise).

## Key Files

- `src/analyze.ts` — Full rewrite. OAuth token loader, JWT decoder, provider registry, SSE streaming parser, circuit breaker. This is the core change.
- `src/index.ts` — Sync hook handlers (never block opencode main loop), `withConfig()` helper that queues actions until config resolves.
- `src/correction.ts` — `chat.message` handler, skips non-text parts, fire-and-forget IIFE.
- `src/phrases.ts` — `session.status` idle handler, fetches messages via SDK GET, calls `analyze()` in a fire-and-forget IIFE.
- `src/toast.ts` — v1-nested-body first with flat-param fallback, never throws on toast failure.
- `src/config.ts` — Robust `resolveSmallModel` handling both response shapes.
- `docs/superpowers/specs/2026-04-21-english-learning-plugin-design.md` — Original spec; §6.3 (Option B) is what we're now implementing.
- `.opencode/opencode.json` — Test config: `model=codebuddy/kimi-k2.6-ioa`, `small_model=codebuddy/minimax-m2.7-ioa`.
- `C:\Users\dluckdu\.local\share\opencode\auth.json` — **Not in repo**, but this is where the plugin reads OAuth tokens at runtime.
- `C:\Users\dluckdu\Documents\Github\codebuddy-auth\src\plugin.ts` — Reference implementation for codebuddy headers (userId, enterpriseId, domain); I mirrored its JWT-decoding logic in `analyze.ts`.

## Important Decisions

- **Abandoned session-based analysis entirely.** The SDK's `session.prompt` is unusable for background analysis in temp sessions. Evidence captured in `debug5.log` / `debug6.log` during investigation. Chose Option B from the spec instead.
- **Direct HTTP via `fetch` + SSE parsing**, no new npm deps. The spec's Option B suggested adding `@ai-sdk/openai` etc.; I avoided that because (a) codebuddy is OpenAI-compatible already, (b) native `fetch` is available in Bun, (c) fewer deps = faster plugin load.
- **Hook handlers are now sync `void`**, not `async`. Opencode awaits hook returns, so any `await` in the handler body blocks the main loop. Kept all async work inside detached IIFEs.
- **Pending-actions queue for config resolution**: first hook call fires before `resolveConfig` completes; instead of dropping it, the action is queued and flushed once `resolved` is set.
- **Circuit breaker on auth errors**: once the API returns 401/403, `analysisDisabled = true` for the process lifetime to avoid hammering.
- **Currently provider-specific (codebuddy only)**: `buildProviderCall` is a switch statement. Easy to extend; keeping the surface small until there's a concrete second-provider need.
- **Token expiry safety margin of 60s**: if `auth.expires < Date.now() + 60_000`, we treat the token as unusable. No auto-refresh yet — user will re-login via the separate codebuddy-auth plugin.
- **Did not modify spec yet** — spec still describes Option A as preferred. Should be updated to reflect the Option B pivot.

## Constraints

- From the spec (§6.4): "opencode's plugin dispatcher does not catch exceptions thrown by hook functions. A throw aborts the user's turn. Therefore: every hook handler in this plugin is wrapped in try/catch; nothing escapes. This is non-negotiable."
- From the spec (§3): "Both features: Read-only on `parts[]` — never mutate, never inject content into the session."
- From the spec (§4.2): "Hook returns immediately so opencode is not blocked."
- From user this session: "this plugin should never block normal flow with opencode. it work ouside the main agent loop."
- Plugin is loaded via `file://` path, no build step — Bun runtime loads `src/index.ts` directly (per `package.json` "main").

## Context for Continuation

- **How to verify the fix**: run `opencode run "your test english sentence"` from the plugin repo root. Capture stderr to a file. Then `Select-String` the matching log in `C:\Users\dluckdu\.local\share\opencode\log\` for `POST /tui/show-toast` — that's the correction toast rendering. Zero error lines in the debug log means success.
- **Interactive TUI testing**: the user disabled the plugin in their TUI session at one point to stop error loops. Re-enable `.opencode/opencode.json` plugin entry before testing phrase tips (correction should already work).
- **Known gotcha**: if `auth.json` has an expired codebuddy token, `analyze()` will log once "analysis disabled: unsupported provider or missing auth" and stay silent. Check `auth.expires` vs `Date.now()`.
- **Debugging approach that worked**: instead of trusting the user's error screenshots in isolation, I ran `opencode run` myself and captured stderr + the server log in `~/.local/share/opencode/log/`. That's what surfaced the syntax error (plugin never loaded) and the real request/response shape for `session.prompt`.
- **Not all providers supported yet**: `analyze.ts` only handles `codebuddy`. If the user changes `small_model` to `kimi-for-coding/...` or another provider, the circuit breaker trips immediately. Adding more cases to `buildProviderCall` is straightforward.
- **Two plugin paths register in the log** — the main one (`.../opencode-learn-english-plugin`) loads fine; the `.opencode/` subdir one fails with "Cannot find module". This is a pre-existing configuration issue, not caused by this session's work. Safe to ignore.

---

To continue: open a new session and paste this file's content as the first message, then add your next task.
