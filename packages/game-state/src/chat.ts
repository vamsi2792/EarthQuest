import type { ChatMessage, DialogueEvent } from "@earthquest/types";

/** Pure reducer so web and mobile (and tests) share identical chat behaviour. */
export type ChatAction =
  | { type: "player-sent"; id: string; text: string }
  | { type: "npc-started"; id: string }
  | { type: "dialogue-event"; id: string; event: DialogueEvent };

export function chatReducer(state: ChatMessage[], action: ChatAction): ChatMessage[] {
  switch (action.type) {
    case "player-sent":
      return [...state, { id: action.id, role: "player", text: action.text }];
    case "npc-started":
      return [...state, { id: action.id, role: "npc", text: "", pending: true }];
    case "dialogue-event":
      return state.map((m) => {
        if (m.id !== action.id) return m;
        switch (action.event.type) {
          case "token":
            return { ...m, text: m.text + action.event.text };
          case "done":
            return { ...m, pending: false };
          case "error":
            return { ...m, pending: false, text: m.text || `(${action.event.message})` };
        }
      });
  }
}
