import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import type { PartyClientMessage, PartyServerMessage } from "@earthquest/types";
import { PartyRoom } from "./party";
import { attachPartySocket } from "./partySocket";

const openGrid = { width: 10, height: 10, cells: new Uint8Array(100) };

let server: Server;
let url: string;
let room: PartyRoom;

beforeAll(async () => {
  server = createServer();
  room = new PartyRoom("test", openGrid);
  attachPartySocket(server, room);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  url = `ws://localhost:${(server.address() as AddressInfo).port}/party`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

class Client {
  messages: PartyServerMessage[] = [];
  private constructor(private ws: WebSocket) {
    ws.on("message", (d) => this.messages.push(JSON.parse(d.toString())));
  }
  static async connect(): Promise<Client> {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => ws.once("open", resolve).once("error", reject));
    return new Client(ws);
  }
  send(msg: PartyClientMessage) {
    this.ws.send(JSON.stringify(msg));
  }
  close() {
    this.ws.close();
  }
  /** Waits until a message matching `predicate` has arrived. */
  async waitFor(predicate: (m: PartyServerMessage) => boolean, ms = 3000): Promise<PartyServerMessage> {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const found = this.messages.find(predicate);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`timed out; got ${JSON.stringify(this.messages)}`);
  }
}

const settle = () => new Promise((r) => setTimeout(r, 100));

describe("party WebSocket", () => {
  it("lets two players join and see each other", async () => {
    const a = await Client.connect();
    const b = await Client.connect();
    a.send({ type: "join", playerId: "a" });
    b.send({ type: "join", playerId: "b" });
    const seen = await a.waitFor((m) => m.type === "state" && "b" in m.state.members);
    expect(seen.type === "state" && Object.keys(seen.state.members).sort()).toEqual(["a", "b"]);
    a.close();
    b.close();
    await settle();
  });

  it("gives a contested cell to whoever arrives first and rolls the loser back", async () => {
    const a = await Client.connect();
    const b = await Client.connect();
    a.send({ type: "join", playerId: "ra" }); // spawns (0,0)
    await a.waitFor((m) => m.type === "state" && "ra" in m.state.members);
    b.send({ type: "join", playerId: "rb" }); // spawns (0,1)
    await b.waitFor((m) => m.type === "state" && "rb" in m.state.members);
    b.send({ type: "move", playerId: "rb", seq: 1, position: { x: 1, y: 1 } });
    await b.waitFor((m) => m.type === "state" && m.state.lastSeq.rb === 1);

    // ra at (0,0) and rb at (1,1) both neighbour (1,0); send both moves back to back.
    a.send({ type: "move", playerId: "ra", seq: 1, position: { x: 1, y: 0 } });
    b.send({ type: "move", playerId: "rb", seq: 2, position: { x: 1, y: 0 } });

    const winner = await a.waitFor((m) => m.type === "state" && m.state.members.ra?.x === 1);
    const rejection = await b.waitFor((m) => m.type === "reject");
    expect(winner.type).toBe("state");
    expect(rejection).toMatchObject({ type: "reject", seq: 2, reason: "cell occupied" });
    if (rejection.type === "reject") expect(rejection.state.members.rb).toEqual({ x: 1, y: 1 });

    a.close();
    b.close();
    await settle();
  });

  it("ignores a replayed seq and does not let one socket move another player", async () => {
    const a = await Client.connect();
    const intruder = await Client.connect();
    a.send({ type: "join", playerId: "da" });
    await a.waitFor((m) => m.type === "state" && "da" in m.state.members);
    const before = room.snapshot().version;
    a.send({ type: "move", playerId: "da", seq: 1, position: { x: 0, y: 1 } });
    await a.waitFor((m) => m.type === "state" && m.state.lastSeq.da === 1);
    const afterFirst = room.snapshot();

    a.send({ type: "move", playerId: "da", seq: 1, position: { x: 0, y: 2 } }); // duplicate seq
    intruder.send({ type: "join", playerId: "intruder" });
    await intruder.waitFor((m) => m.type === "state" && "intruder" in m.state.members);
    intruder.send({ type: "move", playerId: "da", seq: 2, position: { x: 0, y: 2 } }); // spoofed id
    await settle();

    expect(room.snapshot().members.da).toEqual(afterFirst.members.da);
    expect(afterFirst.version).toBeGreaterThan(before);
    a.close();
    intruder.close();
    await settle();
  });

  it("removes a player who disconnects and tells the others", async () => {
    const a = await Client.connect();
    const b = await Client.connect();
    a.send({ type: "join", playerId: "la" });
    b.send({ type: "join", playerId: "lb" });
    await a.waitFor((m) => m.type === "state" && "lb" in m.state.members);
    b.close();
    await a.waitFor((m) => m.type === "state" && !("lb" in m.state.members) && "la" in m.state.members);
    a.close();
    await settle();
  });
});
