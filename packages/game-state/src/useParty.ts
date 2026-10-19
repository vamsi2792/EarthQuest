import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PartyClientMessage, PartyServerMessage, Position } from "@earthquest/types";
import {
  PARTY_WORLD,
  initialClientParty,
  predictedMembers,
  queueMove,
  receiveReject,
  receiveState,
  type Anomaly,
  type ClientParty,
} from "./party";
import { makeWorld } from "./pathfinding";

export type Direction = "up" | "down" | "left" | "right";
export type ConnectionStatus = "connecting" | "open" | "closed";

const STEP: Record<Direction, Position> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export interface UsePartyOptions {
  url: string;
  playerId: string;
  /** Artificial one-way delay for demos and tests; 0 in production. */
  latencyMs?: number;
  /** Called for out-of-order traffic, which is how desync bugs first show up. */
  onAnomaly?: (anomaly: Anomaly, detail: Record<string, unknown>) => void;
  onReject?: (reason: string, seq: number) => void;
}

export function useParty({ url, playerId, latencyMs = 0, onAnomaly, onReject }: UsePartyOptions) {
  const grid = useMemo(
    () => makeWorld(PARTY_WORLD.size, PARTY_WORLD.size, PARTY_WORLD.seed, PARTY_WORLD.wallDensity),
    [],
  );
  const [party, setParty] = useState<ClientParty>(initialClientParty);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  // The ref is the source of truth between renders so rapid key presses never read stale state.
  const partyRef = useRef(party);
  const wsRef = useRef<WebSocket | null>(null);
  const latencyRef = useRef(latencyMs);
  const callbacks = useRef({ onAnomaly, onReject });
  latencyRef.current = latencyMs;
  callbacks.current = { onAnomaly, onReject };

  const commit = useCallback((next: ClientParty) => {
    partyRef.current = next;
    setParty(next);
  }, []);

  useEffect(() => {
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const connect = () => {
      setStatus("connecting");
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        // The server forgets us on disconnect, so a new connection starts from a clean slate.
        commit(initialClientParty);
        setStatus("open");
        ws.send(JSON.stringify({ type: "join", playerId } satisfies PartyClientMessage));
      };

      ws.onmessage = (event) => {
        const raw = String(event.data);
        // Delay every message by the same amount so ordering is preserved, as on a real link.
        setTimeout(() => {
          if (disposed || wsRef.current !== ws) return;
          const msg = JSON.parse(raw) as PartyServerMessage;
          if (msg.type === "state") {
            const { party: next, anomaly } = receiveState(partyRef.current, msg.state, playerId);
            if (anomaly) callbacks.current.onAnomaly?.(anomaly, { version: msg.state.version });
            commit(next);
          } else if (msg.type === "reject") {
            const { party: next, anomaly } = receiveReject(partyRef.current, msg, playerId);
            if (anomaly) callbacks.current.onAnomaly?.(anomaly, { version: msg.state.version, seq: msg.seq });
            callbacks.current.onReject?.(msg.reason, msg.seq);
            commit(next);
          }
        }, latencyRef.current);
      };

      ws.onclose = () => {
        if (disposed || wsRef.current !== ws) return;
        setStatus("closed");
        retry = setTimeout(connect, Math.min(1000 * 2 ** attempt++, 10_000));
      };
    };

    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      wsRef.current?.close();
    };
  }, [url, playerId, commit]);

  const move = useCallback(
    (direction: Direction) => {
      const current = predictedMembers(partyRef.current, grid, playerId)[playerId];
      if (!current) return;
      const to = { x: current.x + STEP[direction].x, y: current.y + STEP[direction].y };
      const queued = queueMove(partyRef.current, grid, playerId, to);
      if (!queued) return;
      commit(queued.party); // optimistic: visible now, confirmed or rolled back later
      const ws = wsRef.current;
      const message: PartyClientMessage = { type: "move", playerId, seq: queued.move.seq, position: to };
      setTimeout(() => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify(message)), latencyRef.current);
    },
    [grid, playerId, commit],
  );

  return {
    status,
    members: predictedMembers(party, grid, playerId),
    pendingMoves: party.pending.length,
    version: party.server?.version ?? 0,
    grid,
    move,
  };
}
