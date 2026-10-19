import { pool } from "./db";
import { localEmbeddings, toVectorLiteral, type EmbeddingProvider } from "./embeddings";
import { SEED_LORE, chunkLore } from "./lore";

export interface Retrieved {
  lore: string[];
  history: string[];
}

export async function ingestLore(provider: EmbeddingProvider = localEmbeddings): Promise<number> {
  const chunks = chunkLore(SEED_LORE);
  const vectors = await provider.embed(chunks);
  await pool.query("DELETE FROM lore_chunks WHERE source = 'seed'");
  for (let i = 0; i < chunks.length; i++) {
    await pool.query("INSERT INTO lore_chunks (source, content, embedding) VALUES ('seed', $1, $2)", [
      chunks[i],
      toVectorLiteral(vectors[i]),
    ]);
  }
  return chunks.length;
}

export async function recordExchange(
  params: { playerId: string; npcId: string; playerMessage: string; npcReply: string },
  provider: EmbeddingProvider = localEmbeddings,
): Promise<void> {
  const content = `Player said: ${params.playerMessage}\nYou replied: ${params.npcReply}`;
  const [vector] = await provider.embed([content]);
  await pool.query(
    "INSERT INTO player_history (player_id, npc_id, content, embedding) VALUES ($1, $2, $3, $4)",
    [params.playerId, params.npcId, content, toVectorLiteral(vector)],
  );
}

/** Nearest lore chunks (global) and nearest past exchanges (this player and NPC only). */
export async function retrieve(
  params: { playerId: string; npcId: string; message: string },
  provider: EmbeddingProvider = localEmbeddings,
  k = { lore: 3, history: 3 },
): Promise<Retrieved> {
  const [vector] = await provider.embed([params.message]);
  const literal = toVectorLiteral(vector);

  const lore = await pool.query<{ content: string }>(
    "SELECT content FROM lore_chunks ORDER BY embedding <=> $1 LIMIT $2",
    [literal, k.lore],
  );
  const history = await pool.query<{ content: string }>(
    `SELECT content FROM player_history
     WHERE player_id = $1 AND npc_id = $2
     ORDER BY embedding <=> $3 LIMIT $4`,
    [params.playerId, params.npcId, literal, k.history],
  );
  return { lore: lore.rows.map((r) => r.content), history: history.rows.map((r) => r.content) };
}

export function buildSystemPrompt(npcId: string, ctx: Retrieved): string {
  const sections = [
    `You are ${npcId}, a character in the narrative RPG EarthQuest. Stay in character and keep replies under 80 words.`,
    "Only state facts about the world that appear in the lore below; if unsure, say your character does not know.",
  ];
  if (ctx.lore.length) sections.push(`World lore:\n${ctx.lore.map((l) => `- ${l}`).join("\n")}`);
  if (ctx.history.length) {
    sections.push(`What you remember of this player:\n${ctx.history.map((h) => `- ${h}`).join("\n")}`);
  }
  return sections.join("\n\n");
}
