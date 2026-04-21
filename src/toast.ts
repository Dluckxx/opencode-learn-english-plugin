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

async function showToast(
  client: ToastClient,
  title: string,
  message: string,
  duration: number,
): Promise<void> {
  try {
    await client.tui.showToast({
      body: {
        title,
        message,
        variant: "info",
        duration,
      },
    })
  } catch (err) {
    console.error(`[english-learn] toast failed (${title.toLowerCase()}):`, err)
  }
}

export async function showCorrectionTip(
  client: ToastClient,
  config: PluginConfig,
  message: string,
): Promise<void> {
  await showToast(client, "English tip", message, config.correction.duration)
}

export async function showPhrasesTip(
  client: ToastClient,
  config: PluginConfig,
  message: string,
): Promise<void> {
  await showToast(client, "English phrases", message, config.phrases.duration)
}
