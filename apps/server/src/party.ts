import { PARTY_WORLD, checkMove, makeWorld, type Grid } from "@earthquest/game-state/core";
import type { PartyState, Position } from "@earthquest/types";

export type MoveResult =
  | { kind: "accepted"; state: PartyState }
  | { kind: "rejected"; reason: string; state: PartyState }
  /** A seq we have already processed (duplicate or out of order); changes nothing. */
  | { kind: "ignored" };

/**
 * Authoritative state for one party. Everything here is synchronous, so two moves can
 * never interleave: whichever message is handled first wins a contested cell.
 */
export class PartyRoom {
  private version = 0;
  private members: Record<string, Position> = {};
  private lastSeq: Record<string, number> = {};

  constructor(
    readonly partyId: string,
    private readonly grid: Grid = makeWorld(
      PARTY_WORLD.size,
      PARTY_WORLD.size,
      PARTY_WORLD.seed,
      PARTY_WORLD.wallDensity,
    ),
  ) {}

  snapshot(): PartyState {
    return {
      partyId: this.partyId,
      version: this.version,
      members: { ...this.members },
      lastSeq: { ...this.lastSeq },
    };
  }

  /** Adds a player at the nearest free cell to the origin. Re-joining keeps the existing position. */
  join(playerId: string): PartyState {
    if (!this.members[playerId]) {
      this.members[playerId] = this.findSpawn();
      // A fresh join restarts the player's move numbering, so stale acks cannot hide new moves.
      this.lastSeq[playerId] = 0;
    }
    this.version++;
    return this.snapshot();
  }

  leave(playerId: string): PartyState {
    delete this.members[playerId];
    delete this.lastSeq[playerId];
    this.version++;
    return this.snapshot();
  }

  has(playerId: string): boolean {
    return playerId in this.members;
  }

  move(playerId: string, seq: number, to: Position): MoveResult {
    if (!this.has(playerId)) return { kind: "rejected", reason: "not in party", state: this.snapshot() };
    if (seq <= (this.lastSeq[playerId] ?? 0)) return { kind: "ignored" };

    this.lastSeq[playerId] = seq;
    this.version++;
    const check = checkMove(this.members, this.grid, playerId, to);
    if (!check.ok) return { kind: "rejected", reason: check.reason, state: this.snapshot() };

    this.members[playerId] = to;
    return { kind: "accepted", state: this.snapshot() };
  }

  private findSpawn(): Position {
    const taken = new Set(Object.values(this.members).map((p) => `${p.x},${p.y}`));
    for (let d = 0; d < this.grid.width + this.grid.height; d++) {
      for (let x = 0; x <= d; x++) {
        const y = d - x;
        if (x >= this.grid.width || y >= this.grid.height) continue;
        if (!this.grid.cells[y * this.grid.width + x] && !taken.has(`${x},${y}`)) return { x, y };
      }
    }
    throw new Error("no free spawn cell");
  }
}
