import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { PartyClientMessage, PartyServerMessage } from "@earthquest/types";
import { breadcrumb, captureError } from "./observability";
import { PartyRoom } from "./party";

const isPosition = (v: any) => Number.isInteger(v?.x) && Number.isInteger(v?.y);

function parse(raw: string): PartyClientMessage | null {
  try {
    const msg = JSON.parse(raw);
    if (msg?.type === "join" && typeof msg.playerId === "string" && msg.playerId) return msg;
    if (
      msg?.type === "move" &&
      typeof msg.playerId === "string" &&
      Number.isInteger(msg.seq) &&
      isPosition(msg.position)
    ) {
      return msg;
    }
  } catch {
    // fall through
  }
  return null;
}

export function attachPartySocket(server: Server, room = new PartyRoom("alpha")) {
  const wss = new WebSocketServer({ server, path: "/party" });
  const sockets = new Map<string, WebSocket>();

  const send = (ws: WebSocket, msg: PartyServerMessage) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };
  const broadcast = (msg: PartyServerMessage) => sockets.forEach((ws) => send(ws, msg));

  wss.on("connection", (ws) => {
    // The id is bound by the first valid `join`; later messages cannot act as someone else.
    let playerId: string | null = null;

    ws.on("message", (data) => {
      try {
        const msg = parse(data.toString());
        if (!msg) {
          breadcrumb("malformed message", { playerId });
          return;
        }

        if (msg.type === "join") {
          if (playerId && playerId !== msg.playerId) return;
          playerId = msg.playerId;
          const previous = sockets.get(playerId);
          if (previous && previous !== ws) previous.close(4000, "replaced by a newer connection");
          sockets.set(playerId, ws);
          broadcast({ type: "state", state: room.join(playerId) });
          return;
        }

        if (!playerId || msg.playerId !== playerId) {
          breadcrumb("move from unjoined or mismatched player", { claimed: msg.playerId, bound: playerId });
          return;
        }
        const result = room.move(playerId, msg.seq, msg.position);
        if (result.kind === "accepted") {
          broadcast({ type: "state", state: result.state });
        } else if (result.kind === "rejected") {
          breadcrumb("move rejected", { playerId, seq: msg.seq, reason: result.reason });
          send(ws, { type: "reject", seq: msg.seq, reason: result.reason, state: result.state });
        }
      } catch (err) {
        captureError(err, { playerId });
      }
    });

    ws.on("close", () => {
      if (playerId && sockets.get(playerId) === ws) {
        sockets.delete(playerId);
        broadcast({ type: "state", state: room.leave(playerId) });
      }
    });

    ws.on("error", (err) => captureError(err, { playerId }));
  });

  return { wss, room };
}
