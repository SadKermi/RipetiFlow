import type { UseQueryResult } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { ApiProblem } from "@/lib/api/problem";
import { Loadable } from "./Loadable";
import { LoadErrorBand, PageMessage, SessionExpiredNote, SkeletonRows } from "./States";
import { LinkButton } from "./Button";

describe("SkeletonRows", () => {
  it("is busy at once but shows its static bars only after 300 ms", () => {
    vi.useFakeTimers();
    const { container } = render(<SkeletonRows rows={6} />);
    const busy = container.querySelector('[aria-busy="true"]');
    expect(busy).not.toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Caricamento…");
    expect(container.querySelectorAll(".bg-paper-sunk")).toHaveLength(0);
    void act(() => vi.advanceTimersByTime(300));
    // at most 4 rows, 3 bars each (40 / 70 / 25 %), never animated
    expect(container.querySelectorAll(".bg-paper-sunk")).toHaveLength(12);
    expect(container.innerHTML).not.toMatch(/animate-/);
    vi.useRealTimers();
  });
});

describe("LoadErrorBand", () => {
  it("without cache: one sentence and «Riprova»", async () => {
    const onRetry = vi.fn();
    render(<LoadErrorBand onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Non riesco a caricare i dati.");
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("with cache: says how old the data is (tutor's timezone)", () => {
    render(<LoadErrorBand onRetry={() => undefined} cachedAt={Date.UTC(2026, 9, 6, 7, 12)} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Non riesco ad aggiornare i dati: quelli che vedi sono delle 9:12.",
    );
  });
});

describe("PageMessage / SessionExpiredNote", () => {
  it("title, one sentence, one way back", () => {
    render(
      <MemoryRouter>
        <PageMessage
          title="Studente non trovato"
          action={<LinkButton to="/studenti">Torna agli studenti</LinkButton>}
        >
          Forse è stato eliminato, o il link è di un altro account.
        </PageMessage>
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Studente non trovato" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Torna agli studenti" })).toHaveAttribute(
      "href",
      "/studenti",
    );
  });

  it("session expired note", () => {
    render(<SessionExpiredNote />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "La sessione è scaduta. Entra di nuovo: torni dove eri.",
    );
  });
});

function query<T>(state: Partial<UseQueryResult<T>>): UseQueryResult<T> {
  return {
    isPending: false,
    isError: false,
    isFetching: false,
    data: undefined,
    error: null,
    dataUpdatedAt: 0,
    refetch: vi.fn(),
    ...state,
  } as unknown as UseQueryResult<T>;
}

describe("Loadable", () => {
  it("pending → skeleton", () => {
    render(<Loadable query={query({ isPending: true })}>{() => "dati"}</Loadable>);
    expect(screen.getByRole("status")).toHaveTextContent("Caricamento…");
  });

  it("error without data → band only, with retry", async () => {
    const refetch = vi.fn();
    render(
      <Loadable query={query({ isError: true, error: ApiProblem.network(), refetch })}>
        {() => "dati"}
      </Loadable>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Non riesco a caricare i dati.");
    expect(screen.queryByText("dati")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("failed refresh with cache → band with the time + the old data in ink-2", () => {
    render(
      <Loadable
        query={query({
          isError: true,
          error: ApiProblem.network(),
          data: ["Giulia"],
          dataUpdatedAt: Date.UTC(2026, 9, 6, 7, 12),
        })}
      >
        {(data, { stale }) => `${data.join()} ${stale ? "(vecchi)" : ""}`}
      </Loadable>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Sei offline: quelli che vedi sono i dati delle 9:12.",
    );
    expect(screen.getByText("Giulia (vecchi)")).toHaveClass("text-ink-2");
  });

  it("success → children", () => {
    render(<Loadable query={query({ data: 3 })}>{(n) => `${String(n)} studenti`}</Loadable>);
    expect(screen.getByText("3 studenti")).toBeInTheDocument();
  });
});
