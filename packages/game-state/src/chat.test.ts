import { describe, expect, it } from "vitest";
import { chatReducer } from "./chat";

describe("chatReducer", () => {
  it("accumulates streamed tokens and clears pending on done", () => {
    let s = chatReducer([], { type: "npc-started", id: "n1" });
    s = chatReducer(s, { type: "dialogue-event", id: "n1", event: { type: "token", text: "Hel" } });
    s = chatReducer(s, { type: "dialogue-event", id: "n1", event: { type: "token", text: "lo" } });
    expect(s[0]).toMatchObject({ text: "Hello", pending: true });
    s = chatReducer(s, { type: "dialogue-event", id: "n1", event: { type: "done" } });
    expect(s[0].pending).toBe(false);
  });

  it("shows an error placeholder when nothing streamed", () => {
    let s = chatReducer([], { type: "npc-started", id: "n1" });
    s = chatReducer(s, { type: "dialogue-event", id: "n1", event: { type: "error", message: "boom" } });
    expect(s[0]).toMatchObject({ text: "(boom)", pending: false });
  });
});
