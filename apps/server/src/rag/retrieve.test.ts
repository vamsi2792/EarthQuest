import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, pool } from "./db";
import { buildSystemPrompt, ingestLore, recordExchange, retrieve } from "./retrieve";

// Integration test: needs `docker compose up -d` and downloads the embedding model on first run.
const dbUp = await pool.query("SELECT 1").then(
  () => true,
  () => false,
);

describe.skipIf(!dbUp)("RAG retrieval", () => {
  beforeAll(async () => {
    await migrate();
    await ingestLore();
    await pool.query("DELETE FROM player_history WHERE player_id LIKE 'test-%'");
  }, 120_000);

  afterAll(async () => {
    await pool.query("DELETE FROM player_history WHERE player_id LIKE 'test-%'");
    await pool.end();
  });

  it("retrieves the lore relevant to the question", async () => {
    const { lore } = await retrieve({
      playerId: "test-a",
      npcId: "elder-maren",
      message: "What metal can hurt the wyrms?",
    });
    expect(lore[0]).toContain("Moonsilver");
  }, 60_000);

  it("only returns history for the same player", async () => {
    await recordExchange({
      playerId: "test-a",
      npcId: "elder-maren",
      playerMessage: "I carry a moonsilver dagger",
      npcReply: "Then you are welcome here.",
    });
    const mine = await retrieve({ playerId: "test-a", npcId: "elder-maren", message: "my dagger" });
    const other = await retrieve({ playerId: "test-b", npcId: "elder-maren", message: "my dagger" });
    expect(mine.history.length).toBe(1);
    expect(other.history).toEqual([]);
  }, 60_000);

  it("includes retrieved context in the system prompt", () => {
    const prompt = buildSystemPrompt("elder-maren", { lore: ["A fact"], history: ["A memory"] });
    expect(prompt).toContain("- A fact");
    expect(prompt).toContain("- A memory");
  });
});
