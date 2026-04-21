import notifier from "node-notifier"

export function notifyError(message: string): void {
  try {
    notifier.notify({
      title: "English plugin",
      message,
      sound: false,
    })
  } catch (err) {
    console.error("[english-learn] OS notification failed:", err)
  }
}
