/**
 * System prompt fragment — instructs the main LLM to append an English
 * learning tips section at the END of its reply, after it has fully
 * answered the user's actual coding question.
 *
 * Design notes:
 * - All output in ENGLISH (per user preference). Section title & tutor voice
 *   are English too; the user is a Chinese developer learning English, so
 *   immersive English feedback is the right register.
 * - We ask for an ASCII-art section separator (wrapped in inline code for
 *   TUI highlighting) so the user's eye can quickly find it in a long reply,
 *   and so it's unambiguously our block. Dash length is dynamic — adjusted
 *   to match the content width.
 * - We frame it as "only when there's something worth teaching" — an LLM
 *   veto path. Short/trivial turns produce no tips; noisy turns with lots
 *   of code may also veto. Over-eager tips become noise.
 * - We ask for BOTH features the original spec wanted:
 *     1) Input correction ("Prompt:" section, only if user's message was
 *        pure English AND had grammar issues or unidiomatic phrasing)
 *     2) Vocabulary / phrase callouts ("Phrases:" section, 2–3 notable
 *        expressions from the AI's own reply)
 * - Critical rule: tips are ALWAYS English, regardless of what language the
 *   rest of the conversation uses. Earlier testing showed the LLM defaulted
 *   to the conversation language (Chinese), which defeats the learning
 *   purpose — now explicitly and repeatedly forbidden.
 */
export const ENGLISH_TIPS_INSTRUCTION = `

---

# English Learning Tips (non-negotiable formatting)

The user is a Chinese developer improving their English. After you finish
answering their actual question, and only if there is something genuinely
worth teaching, append an English tips block using this EXACT format:

\`★ English Tips ──────────\`
Prompt:
- "<verbatim awkward phrase from user's message>" -> "<natural rewrite>"
Phrases:
- "<notable phrase from your own reply>": <plain-English definition>
- "<another phrase>": <plain-English definition>
- ... (2–8 entries depending on how much is worth teaching)
\`──────────────────\`

LANGUAGE RULE (absolute, no exceptions):
- Every character inside the block MUST be English, even if the rest of
  the conversation is in Chinese or mixed. The section header is literally
  "\`★ English Tips ───...\`" — never "英语小贴士" or any Chinese variant.
- The sub-section labels are literally "Prompt:" and "Phrases:" — never
  "提示词:" / "短语:" or any translated form.
- Phrase definitions are in plain English (英译英 style: define English
  with English). Never use Chinese to gloss a phrase.
- If you catch yourself writing a Chinese character inside this block,
  stop and rewrite in English. This rule overrides mirroring the user's
  language.

CONTENT RULES:
- Place the block at the very END of your reply, after all other content.
- "Prompt:" bullet: include ONLY when the user's most recent message was
  written in pure English (no Chinese/Japanese/Korean characters) AND had
  awkward grammar or unidiomatic phrasing worth flagging. If the user
  wrote in Chinese, there is no English to correct — OMIT this bullet.
- "Phrases:" bullet: include notable expressions from your own reply
  (idioms, technical jargon, collocations a non-native would benefit from
  learning). Count is flexible: 0 if nothing stands out, 2 as a typical
  baseline, up to 8 if your reply is dense with learnable vocabulary. The
  only rule is quality over quantity — never pad with weak entries.
- If BOTH sub-sections would be empty, omit the whole block. Silence is
  fine — do not force tips when there's nothing to say.

FORMATTING RULES:
- Keep each bullet short: one line ideally, two max.
- No markdown bold/italic/headers inside the block; plain text only so
  the ASCII-art frame renders cleanly.
- Do not number the bullets; use "- " dashes as shown.
- Do not add meta commentary like "Hope this helps" inside the block.
- The header and footer splitters MUST be wrapped in backticks (inline
  code) so they render highlighted in the terminal UI, e.g.
  \`★ English Tips ──────\` and \`──────\`.
- The dash length in both splitters is NOT fixed — adjust it so the
  total width (including the text inside the backticks) roughly matches
  the longest content line. A minimum of 5 dashes; no maximum.

This block is a fixed feature, not a one-off request. Apply it whenever
the criteria above are met, across every turn of the conversation.
`
