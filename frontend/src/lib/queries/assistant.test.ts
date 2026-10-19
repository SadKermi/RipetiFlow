import { describe, expect, it, vi } from "vitest";
import { ApiProblem } from "../api/problem";
import type { ChatTurn } from "../api/types";
import { ASSISTANT_MAX_CHARS, assistantTurns, sendAssistantMessage } from "./assistant";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": status < 400 ? "application/json" : "application/problem+json" },
  });
}

describe("assistantTurns", () => {
  it("keeps the last 20 turns, starting from a tutor's turn, each cut to 2000 characters", () => {
    const turns: ChatTurn[] = [];
    for (let i = 0; i < 12; i += 1) {
      turns.push({ role: "user", content: `domanda ${String(i)}` });
      turns.push({ role: "assistant", content: `risposta ${String(i)}` });
    }
    turns.push({ role: "user", content: "x".repeat(2500) });
    const sent = assistantTurns(turns);
    expect(sent.length).toBeLessThanOrEqual(20);
    expect(sent[0]?.role).toBe("user");
    expect(sent.at(-1)?.content).toHaveLength(ASSISTANT_MAX_CHARS);
    expect(assistantTurns([{ role: "assistant", content: "Ciao" }])).toEqual([]);
  });
});

describe("sendAssistantMessage", () => {
  it("posts the conversation and the context, and returns the structured reply", async () => {
    const answer = {
      reply: "Giulia ti deve **67,00 €**.",
      drafts: [],
      refused: false,
      usage: { requests_today: 4, daily_limit: 60 },
    };
    const fetch = vi.fn((_request: Request) => Promise.resolve(json(answer)));
    vi.stubGlobal("fetch", fetch);
    const body = {
      messages: [{ role: "user" as const, content: "quanto mi deve Giulia?" }],
      context: { student_id: null, today: "2026-10-06" },
    };
    await expect(sendAssistantMessage(body)).resolves.toEqual(answer);
    const request = fetch.mock.calls[0]![0];
    expect(request.method).toBe("POST");
    expect(new URL(request.url).pathname).toBe("/api/v1/assistant/messages");
    expect(await request.json()).toEqual(body);
  });

  it("throws the 429 as an ApiProblem with the server's sentence", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          json(
            {
              code: "rate_limited",
              title: "Troppe richieste",
              detail: "Hai raggiunto il limite di 60 richieste a Matita per oggi. Riprova domani.",
            },
            429,
          ),
        ),
      ),
    );
    const error: unknown = await sendAssistantMessage({
      messages: [{ role: "user", content: "ciao" }],
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiProblem);
    expect((error as ApiProblem).code).toBe("rate_limited");
    expect((error as ApiProblem).detail).toMatch(/limite di 60 richieste/);
  });
});
