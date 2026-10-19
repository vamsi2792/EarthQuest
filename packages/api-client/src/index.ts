import type { DialogueEvent, Player } from "@earthquest/types";

export interface ApiClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export function createApiClient({ baseUrl, fetchImpl = fetch }: ApiClientOptions) {
  async function getPlayer(id: string): Promise<Player> {
    const res = await fetchImpl(`${baseUrl}/players/${id}`);
    if (!res.ok) throw new Error(`getPlayer failed: ${res.status}`);
    return res.json();
  }

  /**
   * Streams an NPC reply. Server-Sent Events are parsed by hand from the
   * response body so the same code runs in browsers and React Native
   * (which has no EventSource).
   */
  async function streamDialogue(
    params: { npcId: string; playerId: string; message: string },
    onEvent: (event: DialogueEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const res = await fetchImpl(`${baseUrl}/dialogue`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
      signal,
    });
    if (!res.ok || !res.body) throw new Error(`dialogue failed: ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const data = frame
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim())
          .join("");
        if (data) onEvent(JSON.parse(data) as DialogueEvent);
      }
    }
  }

  return { getPlayer, streamDialogue };
}

export type ApiClient = ReturnType<typeof createApiClient>;
