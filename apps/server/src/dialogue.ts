import Anthropic from "@anthropic-ai/sdk";
import type { DialogueEvent } from "@earthquest/types";
import { buildSystemPrompt, recordExchange, retrieve, type Retrieved } from "./rag/retrieve";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";
const NO_CONTEXT: Retrieved = { lore: [], history: [] };

async function* mockReply(message: string, ctx: Retrieved): AsyncGenerator<string> {
  const reply =
    `(mock NPC) Traveler, you said "${message}". ` +
    `I recall ${ctx.lore.length} lore entries and ${ctx.history.length} past talks. ` +
    "Set ANTHROPIC_API_KEY to hear me properly.";
  for (const word of reply.split(" ")) {
    await new Promise((r) => setTimeout(r, 40));
    yield `${word} `;
  }
}

async function* claudeReply(system: string, message: string): AsyncGenerator<string> {
  const client = new Anthropic();
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 300,
    system,
    messages: [{ role: "user", content: message }],
  });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}

/** Yields dialogue events; uses Claude when a key is configured, otherwise a mock. */
export async function* streamDialogue(params: {
  npcId: string;
  playerId: string;
  message: string;
}): AsyncGenerator<DialogueEvent> {
  // Retrieval is best-effort: if the database or embedding model is unavailable, talk without context.
  const ctx = await retrieve(params).catch((err) => {
    console.warn("retrieval unavailable:", err instanceof Error ? err.message : err);
    return NO_CONTEXT;
  });

  try {
    const source = process.env.ANTHROPIC_API_KEY
      ? claudeReply(buildSystemPrompt(params.npcId, ctx), params.message)
      : mockReply(params.message, ctx);

    let reply = "";
    for await (const text of source) {
      reply += text;
      yield { type: "token", text };
    }
    yield { type: "done" };

    await recordExchange({ ...params, playerMessage: params.message, npcReply: reply.trim() }).catch(
      (err) => console.warn("could not store history:", err instanceof Error ? err.message : err),
    );
  } catch (err) {
    yield { type: "error", message: err instanceof Error ? err.message : "dialogue failed" };
  }
}
