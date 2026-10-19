import type { PartyState } from "@earthquest/types";
import { describe, expect, it } from "vitest";
import {
  checkMove,
  initialClientParty,
  predictedMembers,
  queueMove,
  receiveReject,
  receiveState,
  type ClientParty,
} from "./party";
import type { Grid } from "./pathfinding";

const open: Grid = { width: 10, height: 10, cells: new Uint8Array(100) };

const snapshot = (version: number, members: PartyState["members"], lastSeq: PartyState["lastSeq"] = {}): PartyState => ({
  partyId: "p",
  version,
  members,
  lastSeq,
});

function joined(): ClientParty {
  return receiveState(initialClientParty, snapshot(1, { me: { x: 1, y: 1 }, you: { x: 5, y: 5 } }), "me").party;
}

describe("checkMove", () => {
  const members = { me: { x: 1, y: 1 }, you: { x: 2, y: 1 } };
  it("accepts a free adjacent cell", () => {
    expect(checkMove(members, open, "me", { x: 1, y: 2 })).toEqual({ ok: true });
  });
  it.each([
    [{ x: 3, y: 3 }, "not adjacent"],
    [{ x: 2, y: 1 }, "cell occupied"],
    [{ x: -1, y: 1 }, "out of bounds"],
  ])("rejects %j: %s", (to, reason) => {
    expect(checkMove(members, open, "me", to)).toEqual({ ok: false, reason });
  });
  it("rejects walls", () => {
    const walled: Grid = { ...open, cells: Uint8Array.from(open.cells) };
    walled.cells[2 * 10 + 1] = 1;
    expect(checkMove(members, walled, "me", { x: 1, y: 2 })).toEqual({ ok: false, reason: "blocked by wall" });
  });
});

describe("optimistic movement", () => {
  it("shows a move immediately, before the server answers", () => {
    const { party } = queueMove(joined(), open, "me", { x: 2, y: 1 })!;
    expect(predictedMembers(party, open, "me").me).toEqual({ x: 2, y: 1 });
    expect(party.pending).toHaveLength(1);
  });

  it("chains several unacknowledged moves", () => {
    let party = joined();
    party = queueMove(party, open, "me", { x: 2, y: 1 })!.party;
    party = queueMove(party, open, "me", { x: 3, y: 1 })!.party;
    expect(predictedMembers(party, open, "me").me).toEqual({ x: 3, y: 1 });
  });

  it("refuses to queue a move that is illegal locally", () => {
    expect(queueMove(joined(), open, "me", { x: 9, y: 9 })).toBeNull();
  });
});

describe("reconciliation races", () => {
  it("an ack for move 1 keeps move 2 replayed on top (no visual snap-back)", () => {
    let party = joined();
    party = queueMove(party, open, "me", { x: 2, y: 1 })!.party; // seq 1
    party = queueMove(party, open, "me", { x: 3, y: 1 })!.party; // seq 2
    party = receiveState(party, snapshot(2, { me: { x: 2, y: 1 }, you: { x: 5, y: 5 } }, { me: 1 }), "me").party;
    expect(party.pending.map((m) => m.seq)).toEqual([2]);
    expect(predictedMembers(party, open, "me").me).toEqual({ x: 3, y: 1 });
  });

  it("ignores a stale snapshot that arrives after a newer one", () => {
    let party = joined();
    party = receiveState(party, snapshot(5, { me: { x: 1, y: 1 }, you: { x: 6, y: 5 } }), "me").party;
    const late = receiveState(party, snapshot(3, { me: { x: 1, y: 1 }, you: { x: 4, y: 5 } }), "me");
    expect(late.anomaly).toBe("stale-snapshot");
    expect(late.party.server?.version).toBe(5);
    expect(predictedMembers(late.party, open, "me").you).toEqual({ x: 6, y: 5 });
  });

  it("treats a duplicate snapshot as harmless", () => {
    const party = joined();
    const again = receiveState(party, party.server!, "me");
    expect(again.anomaly).toBeUndefined();
    expect(again.party.server).toEqual(party.server);
  });

  it("a rejection rolls back the move and everything queued after it", () => {
    let party = joined();
    party = queueMove(party, open, "me", { x: 2, y: 1 })!.party; // seq 1
    party = queueMove(party, open, "me", { x: 3, y: 1 })!.party; // seq 2
    party = queueMove(party, open, "me", { x: 4, y: 1 })!.party; // seq 3
    const rejected = receiveReject(
      party,
      { seq: 2, state: snapshot(3, { me: { x: 2, y: 1 }, you: { x: 3, y: 1 } }, { me: 2 }) },
      "me",
    );
    expect(rejected.party.pending).toEqual([]); // seq 1 acked, seq 2 refused, seq 3 depended on it
    expect(predictedMembers(rejected.party, open, "me").me).toEqual({ x: 2, y: 1 });
  });

  it("two players racing for the same cell: loser rolls back to its old position", () => {
    // 'me' predicted a move into (2,1); the server gave that cell to 'you' and rejects 'me'.
    let party = joined();
    party = queueMove(party, open, "me", { x: 2, y: 1 })!.party;
    expect(predictedMembers(party, open, "me").me).toEqual({ x: 2, y: 1 });
    const { party: after } = receiveReject(
      party,
      { seq: 1, state: snapshot(2, { me: { x: 1, y: 1 }, you: { x: 2, y: 1 } }, { me: 1 }) },
      "me",
    );
    expect(predictedMembers(after, open, "me")).toEqual({ me: { x: 1, y: 1 }, you: { x: 2, y: 1 } });
  });

  it("a stale reject cannot rewind a newer snapshot", () => {
    let party = joined();
    party = receiveState(party, snapshot(9, { me: { x: 4, y: 4 }, you: { x: 5, y: 5 } }, { me: 3 }), "me").party;
    const result = receiveReject(
      party,
      { seq: 1, state: snapshot(2, { me: { x: 1, y: 1 }, you: { x: 5, y: 5 } }, { me: 1 }) },
      "me",
    );
    expect(result.anomaly).toBe("stale-reject");
    expect(result.party.server?.version).toBe(9);
  });
});
