import { useMutation } from "@tanstack/react-query";
import { api, unwrap } from "../api/client";
import type { AssistantReply, AssistantRequest, ChatTurn } from "../api/types";

// --- Matita (D-40…D-42, docs/05-api.md «Assistente Matita») -----------------------------------

/** At most this many turns per request; the last one is the tutor's (docs/05). */
export const ASSISTANT_MAX_TURNS = 20;
/** Characters per turn (the tutor's line and every reply sent back). */
export const ASSISTANT_MAX_CHARS = 2000;

/**
 * The conversation to send: the last ASSISTANT_MAX_TURNS turns, each cut to ASSISTANT_MAX_CHARS,
 * starting from a tutor's turn (leading `assistant` turns are dropped by the server anyway).
 */
export function assistantTurns(turns: readonly ChatTurn[]): ChatTurn[] {
  const recent = turns.slice(-ASSISTANT_MAX_TURNS).map((turn) => ({
    role: turn.role,
    content: turn.content.slice(0, ASSISTANT_MAX_CHARS),
  }));
  const firstUser = recent.findIndex((turn) => turn.role === "user");
  return firstUser === -1 ? [] : recent.slice(firstUser);
}

/**
 * One request to Matita. Nothing is written: the drafts are confirmed with useCreateLesson /
 * useCreatePayment and `source: "assistant"`. Errors arrive as ApiProblem: 429 `rate_limited`
 * (daily limit, Europe/Rome day), 502 `upstream_error` (provider down or over 60 s), 503
 * `unavailable` (no provider configured).
 */
export async function sendAssistantMessage(
  body: AssistantRequest,
  signal?: AbortSignal,
): Promise<AssistantReply> {
  return unwrap(await api.POST("/assistant/messages", { body, signal }));
}

/** Mutation around sendAssistantMessage; pass an AbortSignal to cancel a request in flight. */
export function useSendAssistantMessage() {
  return useMutation({
    mutationFn: ({ body, signal }: { body: AssistantRequest; signal?: AbortSignal }) =>
      sendAssistantMessage(body, signal),
  });
}
