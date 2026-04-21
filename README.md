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
