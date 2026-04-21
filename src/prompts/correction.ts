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
