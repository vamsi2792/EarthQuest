import { useCallback, useReducer, useRef } from "react";
import type { ApiClient } from "@earthquest/api-client";
import { chatReducer } from "./chat";

let counter = 0;
const nextId = () => `m${Date.now()}-${counter++}`;

export function useNpcChat(api: ApiClient, npcId: string, playerId: string) {
  const [messages, dispatch] = useReducer(chatReducer, []);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (text: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      dispatch({ type: "player-sent", id: nextId(), text });
      const replyId = nextId();
      dispatch({ type: "npc-started", id: replyId });

      try {
        await api.streamDialogue(
          { npcId, playerId, message: text },
          (event) => dispatch({ type: "dialogue-event", id: replyId, event }),
          controller.signal,
        );
      } catch (err) {
        if (controller.signal.aborted) return;
        dispatch({
          type: "dialogue-event",
          id: replyId,
          event: { type: "error", message: err instanceof Error ? err.message : "stream failed" },
        });
      }
    },
    [api, npcId, playerId],
  );

  return { messages, send };
}
