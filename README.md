# english-learn-probe

A minimal opencode probe plugin to verify TUI toast rendering of multi-line Chinese+English text.

## Install

```bash
bun install
# or npm install
```

## Enable

Add to your `opencode.json`:

```json
{
  "plugin": [
    "file:///C:/Users/dluckdu/Documents/GitHub/opencode-learn-english-plugin"
  ]
}
```

## Visual Checklist

- [ ] Multi-line message renders with line breaks preserved
- [ ] CJK characters display without garbling
- [ ] CJK + Latin mixed text aligns cleanly
- [ ] Word-wrap behaves around ~60 columns
- [ ] Toast stays visible for 15 seconds (`duration: 15000`)
- [ ] Title "English tip" appears bold / emphasized
- [ ] Only one toast fires per idle turn (no duplicates)

## Note

This is a **PROBE only** — not the real English-learning plugin.
