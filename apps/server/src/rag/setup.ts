import { migrate, pool } from "./db";
import { ingestLore } from "./retrieve";

await migrate();
const count = await ingestLore();
console.log(`Migrated schema and ingested ${count} lore chunks.`);
await pool.end();
