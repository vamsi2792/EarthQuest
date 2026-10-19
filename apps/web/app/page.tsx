"use client";

import { useMemo, useState } from "react";
import { createApiClient } from "@earthquest/api-client";
import { useNpcChat } from "@earthquest/game-state";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function Home() {
  const api = useMemo(() => createApiClient({ baseUrl: API_URL }), []);
  const { messages, send } = useNpcChat(api, "elder-maren", "player-1");
  const [draft, setDraft] = useState("");

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: 24 }}>
      <h1>EarthQuest</h1>
      <h2 style={{ fontSize: 16, opacity: 0.7 }}>Elder Maren</h2>

      <div style={{ minHeight: 240, display: "grid", gap: 8, alignContent: "start" }}>
        {messages.map((m) => (
          <p
            key={m.id}
            style={{
              margin: 0,
              padding: "8px 12px",
              borderRadius: 8,
              background: m.role === "player" ? "#23405e" : "#1d2733",
              justifySelf: m.role === "player" ? "end" : "start",
            }}
          >
            {m.text}
            {m.pending ? "▍" : ""}
          </p>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          void send(draft.trim());
          setDraft("");
        }}
        style={{ display: "flex", gap: 8, marginTop: 16 }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Speak to the elder..."
          style={{ flex: 1, padding: 8 }}
        />
        <button type="submit">Send</button>
      </form>
    </main>
  );
}
