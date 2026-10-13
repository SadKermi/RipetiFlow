import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient, sourceHeaders, unwrap } from "./client";
import { filenameFromDisposition } from "./download";
import { ApiProblem } from "./problem";
import { setSessionBridge } from "./session";

function json(body: unknown, status = 200, contentType = "application/json"): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": contentType } });
}

function setup(responder: (request: Request) => Response | Promise<Response>) {
  const requests: Request[] = [];
  const fetch = vi.fn(async (request: Request) => {
    requests.push(request);
    return responder(request);
  });
  const api = createApiClient({ baseUrl: "http://test.local/api/v1", fetch });
  return { api, requests, fetch };
}

let restoreBridge: (() => void) | undefined;
afterEach(() => restoreBridge?.());

function bridge(token: string | null) {
  const onUnauthorized = vi.fn();
  restoreBridge = setSessionBridge({
    getAccessToken: () => Promise.resolve(token),
    onUnauthorized,
  });
  return onUnauthorized;
}

describe("API client", () => {
  it("prefixes /api/v1 and sends the bearer token", async () => {
    bridge("token-123");
    const { api, requests } = setup(() => json({ items: [] }));
    const data = unwrap(await api.GET("/students", { params: { query: { sort: "name" } } }));
    expect(data).toEqual({ items: [] });
    expect(requests[0]!.url).toBe("http://test.local/api/v1/students?sort=name");
    expect(requests[0]!.headers.get("Authorization")).toBe("Bearer token-123");
    expect(requests[0]!.headers.get("X-RipetiFlow-Source")).toBeNull();
  });

  it("sends no Authorization header when signed out", async () => {
    bridge(null);
    const { api, requests } = setup(() => json({ dev_auth_enabled: true }));
    await api.GET("/public/config");
    expect(requests[0]!.headers.has("Authorization")).toBe(false);
  });

  it("marks writes confirmed from Matita with X-RipetiFlow-Source", async () => {
    bridge("t");
    const { api, requests } = setup(() => json({ id: "p1" }, 201));
    await api.POST("/payments", {
      body: { student_id: "s1", amount_cents: 4500, paid_on: "2026-10-06", method: "cash" },
      headers: sourceHeaders("assistant"),
    });
    expect(requests[0]!.headers.get("X-RipetiFlow-Source")).toBe("assistant");
    expect(await requests[0]!.json()).toMatchObject({ amount_cents: 4500 });
    expect(sourceHeaders("app")).toEqual({});
    expect(sourceHeaders()).toEqual({});
  });

  it("throws ApiProblem with field errors for a 422", async () => {
    bridge("t");
    const { api } = setup(() =>
      json(
        {
          type: "https://ripetiflow.app/errors/validation",
          title: "Dati non validi",
          status: 422,
          detail: "L'orario di fine deve essere successivo a quello di inizio.",
          code: "validation_error",
          errors: [
            {
              field: "end_time",
              message: "L'orario di fine deve essere successivo a quello di inizio.",
            },
          ],
        },
        422,
        "application/problem+json",
      ),
    );
    const call = api.POST("/lessons", {
      body: { student_id: "s1", date: "2026-10-06", start_time: "16:00", end_time: "15:00" },
    });
    await expect(call).rejects.toBeInstanceOf(ApiProblem);
    await expect(call).rejects.toMatchObject({
      status: 422,
      code: "validation_error",
      fieldErrors: { end_time: expect.stringMatching(/fine/) as unknown },
    });
  });

  it("signs out on 401 (and still throws)", async () => {
    const onUnauthorized = bridge("expired");
    const { api } = setup(() =>
      json(
        {
          status: 401,
          code: "unauthorized",
          title: "Accesso richiesto",
          detail: "Sessione scaduta.",
        },
        401,
      ),
    );
    await expect(api.GET("/me")).rejects.toMatchObject({ status: 401, code: "unauthorized" });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("does not sign out on other errors", async () => {
    const onUnauthorized = bridge("t");
    const { api } = setup(() => json({ code: "not_found", detail: "Studente non trovato." }, 404));
    await expect(
      api.GET("/students/{student_id}", { params: { path: { student_id: "x" } } }),
    ).rejects.toMatchObject({ status: 404, detail: "Studente non trovato." });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("turns network failures into a network_error problem", async () => {
    bridge("t");
    const { api } = setup(() => Promise.reject(new TypeError("Failed to fetch")));
    await expect(api.GET("/me")).rejects.toMatchObject({ status: 0, code: "network_error" });
  });

  it("keeps aborts as aborts (query cancellation)", async () => {
    bridge("t");
    const { api } = setup(() => Promise.reject(new DOMException("aborted", "AbortError")));
    await expect(api.GET("/me")).rejects.toMatchObject({ name: "AbortError" });
  });

  it("returns undefined data for 204 responses", async () => {
    bridge("t");
    const { api } = setup(() => new Response(null, { status: 204 }));
    const result = await api.DELETE("/lessons/{lesson_id}", {
      params: { path: { lesson_id: "l1" } },
    });
    expect(unwrap(result)).toBeUndefined();
  });
});

describe("unwrap", () => {
  it("throws for an error result even without the middleware", () => {
    const response = new Response(null, { status: 409 });
    expect(() => unwrap({ error: { detail: "Conflitto." }, response })).toThrow(ApiProblem);
  });
});

describe("filenameFromDisposition", () => {
  it("prefers the UTF-8 filename", () => {
    expect(
      filenameFromDisposition(
        "attachment; filename=\"libro-mastro-nicolo.csv\"; filename*=UTF-8''libro-mastro-nicol%C3%B2.csv",
      ),
    ).toBe("libro-mastro-nicolò.csv");
  });

  it("falls back to the plain filename", () => {
    expect(filenameFromDisposition('attachment; filename="export.csv"')).toBe("export.csv");
    expect(filenameFromDisposition("attachment; filename=export.csv")).toBe("export.csv");
    expect(
      filenameFromDisposition("attachment; filename*=UTF-8''%E0%A4%A; filename=\"a.csv\""),
    ).toBe("a.csv");
  });

  it("returns null without a filename", () => {
    expect(filenameFromDisposition(null)).toBeNull();
    expect(filenameFromDisposition("attachment")).toBeNull();
  });
});
