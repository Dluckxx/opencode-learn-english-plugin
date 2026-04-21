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
