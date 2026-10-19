export type ItemKind = "weapon" | "armor" | "consumable" | "quest";

export interface Item {
  id: string;
  name: string;
  kind: ItemKind;
  quantity: number;
}

export interface Position {
  x: number;
  y: number;
}

export interface Player {
  id: string;
  name: string;
  position: Position;
  inventory: Item[];
}

export interface Npc {
  id: string;
  name: string;
  role: string;
}

export interface ChatMessage {
  id: string;
  role: "player" | "npc";
  text: string;
  /** true while the NPC reply is still streaming in */
  pending?: boolean;
}

export interface PartyState {
  partyId: string;
  /** Increases by one for every accepted change; clients ignore snapshots older than what they hold. */
  version: number;
  members: Record<string, Position>;
  /** Highest move `seq` the server has processed (accepted or rejected) per player. */
  lastSeq: Record<string, number>;
}

/** Events the server pushes over the dialogue SSE stream. */
export type DialogueEvent =
  | { type: "token"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

/** Messages exchanged over the party WebSocket. */
export type PartyClientMessage =
  | { type: "join"; playerId: string }
  /** `seq` is per player and strictly increasing; `position` is the destination cell. */
  | { type: "move"; playerId: string; seq: number; position: Position };

export type PartyServerMessage =
  | { type: "state"; state: PartyState }
  /** Sent only to the mover; carries a fresh snapshot to roll back to. */
  | { type: "reject"; seq: number; reason: string; state: PartyState };
