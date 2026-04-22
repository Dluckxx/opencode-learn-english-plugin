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
  smallModel: { providerID: string; modelID: string }
}

function stripJsoncComments(text: string): string {
  let result = ""
  let inString = false
  let escapeNext = false
  let i = 0
  while (i < text.length) {
    const char = text[i]
    const next = text[i + 1]

    if (escapeNext) {
      result += char
      escapeNext = false
      i++
      continue
    }

    if (char === "\\" && inString) {
      result += char
      escapeNext = true
      i++
      continue
    }

    if (char === '"') {
      inString = !inString
      result += char
      i++
      continue
    }

    if (!inString && char === "/" && next === "/") {
      // Skip until end of line
      while (i < text.length && text[i] !== "\n" && text[i] !== "\r") {
        i++
      }
      continue
    }

    if (!inString && char === "/" && next === "*") {
      // Skip until end of block comment
      i += 2
      while (i < text.length) {
        if (text[i] === "*" && text[i + 1] === "/") {
          i += 2
          break
        }
        i++
      }
      continue
    }

    result += char
    i++
  }
  return result
}

export function readPluginConfig(directory: string): PluginConfig {
  for (const filename of ["opencode.jsonc", "opencode.json"]) {
    const filepath = join(directory, filename)
    if (!existsSync(filepath)) continue
    try {
      const raw = readFileSync(filepath, "utf-8")
      const stripped = stripJsoncComments(raw)
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
  client: { config: { get: () => Promise<{ data?: { small_model?: string } }> } },
): Promise<{ providerID: string; modelID: string } | null> {
  try {
    const result = await client.config.get()
    const raw = result.data?.small_model
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
