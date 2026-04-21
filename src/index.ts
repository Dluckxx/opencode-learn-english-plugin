import type { Plugin } from "@opencode-ai/plugin"

export const EnglishProbe: Plugin = async ({ client }) => {
  return {
    event: async ({ event }) => {
      if (event.type !== "session.idle") return

      try {
        await client.tui.showToast({
          body: {
            title: "English tip",
            message:
              "意思清楚，但有几处不太自然：crashed at gamemode loading phase\n" +
              "少了冠词；does this time reproduced 时态混了，应该 did...reproduce；\n" +
              "proved the game load... 偏口语堆叠。\n\n" +
              "改写一下会更顺：\n" +
              "Last time we crashed during the gamemode loading phase. Did this\n" +
              "run reproduce the issue, or did the game load the gamemode\n" +
              "successfully?",
            variant: "info",
            duration: 15000,
          },
        })
      } catch (err) {
        console.error("[english-learn-probe] toast failed:", err)
      }
    },
  }
}
