import pg from "pg";
import { EMBEDDING_DIM } from "./embeddings";

export const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ?? "postgres://earthquest:earthquest@localhost:5440/earthquest",
});

export async function migrate(): Promise<void> {
  await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lore_chunks (
      id SERIAL PRIMARY KEY,
      source TEXT NOT NULL,
      content TEXT NOT NULL,
      embedding vector(${EMBEDDING_DIM}) NOT NULL
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS player_history (
      id SERIAL PRIMARY KEY,
      player_id TEXT NOT NULL,
      npc_id TEXT NOT NULL,
      content TEXT NOT NULL,
      embedding vector(${EMBEDDING_DIM}) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await pool.query(
    "CREATE INDEX IF NOT EXISTS player_history_player ON player_history (player_id, npc_id)",
  );
}
