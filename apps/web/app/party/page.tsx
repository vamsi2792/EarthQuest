"use client";

import { useEffect, useMemo, useState } from "react";
import { useParty, type Direction } from "@earthquest/game-state";
import { initSentry, reportAnomaly } from "../../lib/sentry";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000/party";
const VIEW = 21; // cells shown, centred on the local player
const CELL = 22;
const COLORS = ["#ff5a36", "#4fc3f7", "#aed581", "#ffd54f", "#ba68c8", "#f06292"];

const KEYS: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
};

export default function Party() {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [latency, setLatency] = useState(0);
  const [lastReject, setLastReject] = useState("");

  useEffect(() => {
    initSentry();
    const params = new URLSearchParams(window.location.search);
    setPlayerId(params.get("player") ?? `player-${Math.random().toString(36).slice(2, 6)}`);
    setLatency(Number(params.get("latency") ?? 0) || 0);
  }, []);

  if (!playerId) return null;
  return <PartyView playerId={playerId} latency={latency} setLatency={setLatency} lastReject={lastReject} setLastReject={setLastReject} />;
}

function PartyView(props: {
  playerId: string;
  latency: number;
  setLatency: (n: number) => void;
  lastReject: string;
  setLastReject: (s: string) => void;
}) {
  const { playerId, latency } = props;
  const party = useParty({
    url: WS_URL,
    playerId,
    latencyMs: latency,
    onAnomaly: reportAnomaly,
    onReject: (reason, seq) => props.setLastReject(`move ${seq} rejected: ${reason}`),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const direction = KEYS[e.key];
      if (!direction) return;
      e.preventDefault();
      party.move(direction);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [party.move]);

  const me = party.members[playerId];
  const origin = me ? { x: me.x - Math.floor(VIEW / 2), y: me.y - Math.floor(VIEW / 2) } : { x: 0, y: 0 };
  const memberIds = useMemo(() => Object.keys(party.members).sort(), [party.members]);

  const cells = [];
  for (let row = 0; row < VIEW; row++) {
    for (let col = 0; col < VIEW; col++) {
      const x = origin.x + col;
      const y = origin.y + row;
      const inside = x >= 0 && y >= 0 && x < party.grid.width && y < party.grid.height;
      const wall = !inside || party.grid.cells[y * party.grid.width + x] === 1;
      const occupant = memberIds.findIndex((id) => party.members[id].x === x && party.members[id].y === y);
      cells.push(
        <div
          key={`${col},${row}`}
          style={{
            width: CELL,
            height: CELL,
            background: occupant >= 0 ? COLORS[occupant % COLORS.length] : wall ? "#222a35" : "#cdd3da",
            outline: occupant >= 0 && memberIds[occupant] === playerId ? "2px solid white" : undefined,
          }}
        />,
      );
    }
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Party</h1>
      <p data-testid="status" data-members={JSON.stringify(party.members)} data-pending={party.pendingMoves}>
        you: {playerId} · {party.status} · server v{party.version} · pending moves: {party.pendingMoves} · members:{" "}
        {memberIds.length}
      </p>
      <p>
        Move with arrow keys or WASD. Simulated latency:{" "}
        <input type="range" min={0} max={1000} step={50} value={latency} onChange={(e) => props.setLatency(Number(e.target.value))} />{" "}
        {latency} ms each way
      </p>
      <p data-testid="reject" style={{ minHeight: 24, color: "#ff8a80" }}>
        {props.lastReject}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${VIEW}, ${CELL}px)`, width: VIEW * CELL }}>{cells}</div>
    </main>
  );
}
