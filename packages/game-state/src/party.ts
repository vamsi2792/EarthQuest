import type { PartyState, Position } from "@earthquest/types";
import type { Grid } from "./pathfinding";

/** Shared world parameters so server, web and mobile agree on which cells are walls. */
export const PARTY_WORLD = { size: 1000, seed: 3, wallDensity: 0.25 } as const;

export type MoveCheck = { ok: true } | { ok: false; reason: string };

/**
 * The single source of truth for what a legal move is. The server enforces it and
 * clients use the same function to predict, so prediction only diverges on real conflicts.
 */
export function checkMove(
  members: Record<string, Position>,
  grid: Grid,
  playerId: string,
  to: Position,
): MoveCheck {
  const from = members[playerId];
  if (!from) return { ok: false, reason: "not in party" };
  if (to.x < 0 || to.y < 0 || to.x >= grid.width || to.y >= grid.height) {
    return { ok: false, reason: "out of bounds" };
  }
  if (Math.abs(to.x - from.x) + Math.abs(to.y - from.y) !== 1) return { ok: false, reason: "not adjacent" };
  if (grid.cells[to.y * grid.width + to.x]) return { ok: false, reason: "blocked by wall" };
  for (const [id, pos] of Object.entries(members)) {
    if (id !== playerId && pos.x === to.x && pos.y === to.y) return { ok: false, reason: "cell occupied" };
  }
  return { ok: true };
}

export interface PendingMove {
  seq: number;
  position: Position;
}

export interface ClientParty {
  /** Latest authoritative snapshot, or null before the first one arrives. */
  server: PartyState | null;
  /** Moves already applied locally that the server has not yet processed. */
  pending: PendingMove[];
  nextSeq: number;
}

export type Anomaly = "stale-snapshot" | "stale-reject";

export const initialClientParty: ClientParty = { server: null, pending: [], nextSeq: 1 };

/** The state to render: the server snapshot with unacknowledged moves replayed on top. */
export function predictedMembers(
  party: ClientParty,
  grid: Grid,
  playerId: string,
): Record<string, Position> {
  if (!party.server) return {};
  let members = party.server.members;
  for (const move of party.pending) {
    if (checkMove(members, grid, playerId, move.position).ok) {
      members = { ...members, [playerId]: move.position };
    }
  }
  return members;
}

/** Queue a local move optimistically. Returns null when the move is illegal even locally. */
export function queueMove(
  party: ClientParty,
  grid: Grid,
  playerId: string,
  to: Position,
): { party: ClientParty; move: PendingMove } | null {
  if (!party.server) return null;
  const current = predictedMembers(party, grid, playerId);
  if (!checkMove(current, grid, playerId, to).ok) return null;
  const move = { seq: party.nextSeq, position: to };
  return { party: { ...party, pending: [...party.pending, move], nextSeq: party.nextSeq + 1 }, move };
}

/**
 * Apply a snapshot from the server. A snapshot older than what we already hold is dropped:
 * applying it would rewind other players and re-show moves we've already seen acknowledged.
 */
export function receiveState(
  party: ClientParty,
  state: PartyState,
  playerId: string,
): { party: ClientParty; anomaly?: Anomaly } {
  if (party.server && state.version < party.server.version) {
    return { party, anomaly: "stale-snapshot" };
  }
  const acked = state.lastSeq[playerId] ?? 0;
  return { party: { ...party, server: state, pending: party.pending.filter((m) => m.seq > acked) } };
}

/**
 * The server refused move `seq`. Every later pending move was built on top of it, so they are
 * all discarded too; the server will refuse (or has refused) them for the same reason.
 */
export function receiveReject(
  party: ClientParty,
  reject: { seq: number; state: PartyState },
  playerId: string,
): { party: ClientParty; anomaly?: Anomaly } {
  const stale = party.server !== null && reject.state.version < party.server.version;
  const base = stale ? party.server : reject.state;
  const server = base ?? reject.state;
  const acked = server.lastSeq[playerId] ?? 0;
  const pending = party.pending.filter((m) => m.seq < reject.seq && m.seq > acked);
  return { party: { ...party, server, pending }, anomaly: stale ? "stale-reject" : undefined };
}
