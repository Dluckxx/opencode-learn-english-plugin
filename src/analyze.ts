interface AnalysisClient {
  session: {
    create: (input: {
      body?: { title?: string }
      query?: { directory?: string }
    }) => Promise<{
      data?: { id: string } | { info: { id: string } }
      error?: unknown
    }>
    prompt: (input: {
      path: { id: string }
      body: {
        parts: Array<{ type: "text"; text: string }>
        model?: { providerID: string; modelID: string }
        agent?: string
        system?: string
        tools?: Record<string, boolean>
      }
      query: { directory: string }
    }) => Promise<{
      data?: {
        info: { id?: string; role: string; error?: unknown }
        parts: Array<{ type: string; text?: string }>
      }
      error?: unknown
    }>
    messages: (input: {
      path: { id: string }
      query?: { directory?: string; limit?: number }
    }) => Promise<{
      data?: Array<{
        info: { id?: string; role: string; error?: unknown }
        parts: Array<{ type: string; text?: string }>
      }>
      error?: unknown
    }>
    delete: (input: { path: { id: string } }) => Promise<unknown>
  }
}

interface AnalysisDeps {
  client: AnalysisClient
  directory: string
  smallModel: { providerID: string; modelID: string }
}

const ANALYSIS_TIMEOUT_MS = 15_000

export async function analyze(
  deps: AnalysisDeps,
  systemPrompt: string,
  userText: string,
): Promise<string | null> {
  const { client, directory, smallModel } = deps

  let sessionID: string | null = null

  try {
    // Create a temporary session for the analysis
    const created = await client.session.create({
      body: { title: "English learning analysis" },
      query: { directory },
    })

    if (created.error) {
      console.error("[english-learn] session creation failed:", created.error)
      return null
    }

    const createdData = created.data
    if (!createdData) {
      console.error("[english-learn] session creation returned no data")
      return null
    }

    // Handle both possible response shapes
    sessionID = "id" in createdData ? createdData.id : "info" in createdData ? createdData.info.id : null
    if (!sessionID) {
      console.error("[english-learn] failed to get session ID from create response")
      return null
    }

    // Send the analysis prompt synchronously — waits for full response
    let timer: ReturnType<typeof setTimeout> | null = null
    const result = await Promise.race([
      client.session.prompt({
        path: { id: sessionID },
        body: {
          parts: [{ type: "text", text: userText }],
          model: smallModel,
          system: systemPrompt,
          tools: {}, // no tools — pure text completion
        },
        query: { directory },
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("analysis timeout")), ANALYSIS_TIMEOUT_MS)
      }),
    ])
    if (timer) clearTimeout(timer)

    if (result.error) {
      console.error("[english-learn] prompt returned error:", result.error)
      return null
    }

    const response = result.data
    if (!response) {
      console.error("[english-learn] prompt returned no data")
      return null
    }

    // Check for errors in the assistant response
    if (response.info.error) return null

    // Extract text from the response parts
    const text = response.parts
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text)
      .join("")

    return text || null
  } catch (err: unknown) {
    // Classify error for proper handling
    const status =
      typeof err === "object" && err !== null
        ? (err as Record<string, unknown>).status ??
          (err as Record<string, unknown>).statusCode
        : undefined
    if (status === 429) {
      return "__RATE_LIMITED__"
    }
    if (status === 401 || status === 403) {
      return "__AUTH_ERROR__"
    }
    if (
      err instanceof Error &&
      err.message.includes("timeout")
    ) {
      console.warn("[english-learn] analysis timed out after", ANALYSIS_TIMEOUT_MS, "ms")
      return null
    }
    console.error("[english-learn] analysis failed:", err)
    return null
  } finally {
    // Clean up the temporary session
    if (sessionID) {
      try {
        await client.session.delete({ path: { id: sessionID } })
      } catch (cleanupErr) {
        console.warn("[english-learn] session cleanup failed:", cleanupErr)
      }
    }
  }
}
