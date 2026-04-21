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
