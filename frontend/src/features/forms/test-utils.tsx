// Test helpers for the screens and forms (used only by *.test.tsx): a fake API behind the real
// typed client (global fetch stubbed, as in src/lib/queries/hooks.test.tsx) and the providers the
// screens need (query client, auth config, toasts, router, it-IT).
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "react-aria-components";
import { RouterProvider, createMemoryRouter } from "react-router";
import { vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/app/auth/context";
import { MatitaSlotContext, type MatitaSlots } from "@/components/shell/matita-slot";
import { ToastProvider } from "@/components/Toast";
import type {
  Balance,
  LedgerEntry,
  Lesson,
  Profile,
  PublicConfig,
  Student,
  StudentSummary,
} from "@/lib/api/types";
import { queryKeys } from "@/lib/queries";

/** «Oggi» of the design documents: martedì 6 ottobre 2026, 14:20 in Rome. */
export const NOW = new Date("2026-10-06T12:20:00Z");
export const TODAY = "2026-10-06";

export const TEST_PROFILE: Profile = {
  id: "u1",
  email: "d.marchi@esempio.it",
  full_name: "Daniele Marchi",
  timezone: "Europe/Rome",
  default_lesson_minutes: 90,
  default_hourly_rate_cents: 2000,
  created_at: "2026-09-01T10:00:00Z",
};

export const TEST_CONFIG: PublicConfig = {
  supabase_url: "",
  supabase_publishable_key: "",
  google_login_enabled: false,
  magic_link_enabled: false,
  dev_auth_enabled: true,
  calendar_sync_available: false,
  assistant_available: false,
};

export function balance(cents: number, extra: Partial<Balance> = {}): Balance {
  return {
    balance_cents: cents,
    projected_balance_cents: cents,
    charged_cents: 0,
    paid_cents: 0,
    scheduled_cents: 0,
    done_minutes: 0,
    scheduled_minutes: 0,
    current_hourly_rate_cents: 2200,
    status: cents < 0 ? "debt" : cents > 0 ? "credit" : "settled",
    credit_minutes: null,
    ...extra,
  };
}

export function summary(
  id: string,
  name: string,
  cents: number,
  extra: Partial<StudentSummary> = {},
): StudentSummary {
  const [first = name, ...rest] = name.split(" ");
  return {
    id,
    first_name: first,
    last_name: rest.join(" ") || null,
    display_name: name,
    grade: null,
    school: null,
    archived: false,
    balance: balance(cents),
    next_lesson: null,
    last_lesson_date: null,
    ...extra,
  };
}

/** Giulia Ferri of 03 «Dati d'esempio»: 22,00 €/h from 1 Oct (before 20,00), owes 67,00 €. */
export function giulia(extra: Partial<Student> = {}): Student {
  return {
    id: "giulia",
    first_name: "Giulia",
    last_name: "Ferri",
    display_name: "Giulia Ferri",
    grade: "3ª liceo scientifico",
    school: "Liceo Galilei",
    email: null,
    phone: null,
    guardian_name: "Anna Ferri",
    guardian_email: null,
    guardian_phone: "347 512 0896",
    notes: null,
    default_subject_id: "mat",
    archived: false,
    created_at: "2025-09-15T10:00:00Z",
    balance: balance(-6700, {
      projected_balance_cents: -8900,
      scheduled_cents: 2200,
      current_hourly_rate_cents: 2200,
    }),
    rates: [
      { id: "r2", hourly_rate_cents: 2200, effective_from: "2026-10-01", created_at: "" },
      { id: "r1", hourly_rate_cents: 2000, effective_from: "2025-09-15", created_at: "" },
    ],
    ...extra,
  };
}

export function lessonEntry(extra: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    kind: "lesson",
    id: "l-5ott",
    date: "2026-10-05",
    start_time: "17:00",
    end_time: "19:00",
    duration_minutes: 120,
    hourly_rate_cents: 2200,
    subject: { id: "fis", name: "Fisica" },
    topic: "moto rettilineo uniforme",
    method: null,
    note: null,
    debit_cents: 4400,
    credit_cents: 0,
    settled: true,
    running_balance_cents: -6700,
    calendar: { status: "off", error: null },
    ...extra,
  };
}

export function paymentEntry(extra: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    kind: "payment",
    id: "p-2ott",
    date: "2026-10-02",
    start_time: null,
    end_time: null,
    duration_minutes: null,
    hourly_rate_cents: null,
    subject: null,
    topic: null,
    method: "bank_transfer",
    note: null,
    debit_cents: 0,
    credit_cents: 5000,
    settled: true,
    running_balance_cents: -2300,
    calendar: null,
    ...extra,
  };
}

/** The ledger of Giulia in 03 «Dati d'esempio», newest first. */
export function giuliaLedger(): LedgerEntry[] {
  return [
    lessonEntry({
      id: "l-8ott",
      date: "2026-10-08",
      start_time: "15:00",
      end_time: "16:00",
      duration_minutes: 60,
      subject: { id: "mat", name: "Matematica" },
      topic: null,
      debit_cents: 2200,
      settled: false,
      running_balance_cents: -8900,
    }),
    lessonEntry(),
    paymentEntry(),
    lessonEntry({
      id: "l-1ott",
      date: "2026-10-01",
      start_time: "16:00",
      end_time: "17:30",
      duration_minutes: 90,
      topic: "vettori e componenti",
      debit_cents: 3300,
      running_balance_cents: -7300,
    }),
    lessonEntry({
      id: "l-28set",
      date: "2026-09-28",
      start_time: "15:00",
      end_time: "17:00",
      duration_minutes: 120,
      subject: { id: "mat", name: "Matematica" },
      topic: "disequazioni fratte",
      hourly_rate_cents: 2000,
      debit_cents: 4000,
      running_balance_cents: -4000,
    }),
  ];
}

export function lesson(extra: Partial<Lesson> = {}): Lesson {
  return {
    id: "l-5ott",
    student: { id: "giulia", display_name: "Giulia Ferri" },
    subject: { id: "fis", name: "Fisica" },
    date: "2026-10-05",
    start_time: "17:00",
    end_time: "19:00",
    duration_minutes: 120,
    hourly_rate_cents: 2200,
    amount_cents: 4400,
    topic: "moto rettilineo uniforme",
    notes: "esercizi 4–9",
    settled: true,
    calendar: { status: "off", error: null },
    created_at: "2026-10-05T17:00:00Z",
    updated_at: "2026-10-05T17:00:00Z",
    ...extra,
  };
}

export const SUBJECTS = [
  { id: "mat", name: "Matematica", position: 0, archived: false },
  { id: "fis", name: "Fisica", position: 1, archived: false },
];

export function json(body: unknown, status = 200): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": status < 400 ? "application/json" : "application/problem+json",
    },
  });
}

/** An RFC 9457 answer: `problem(422, "Dati non validi", [{field, message}])`. */
export function problem(
  status: number,
  detail: string,
  errors?: { field: string; message: string }[],
): Response {
  const code =
    status === 404
      ? "not_found"
      : status === 409
        ? "conflict"
        : status === 422
          ? "validation_error"
          : "internal_error";
  return json({ type: "about:blank", title: "Errore", status, detail, code, errors }, status);
}

export interface RecordedRequest {
  method: string;
  /** Path without /api/v1. */
  path: string;
  url: URL;
  body: unknown;
  headers: Headers;
}

type Handler = (request: RecordedRequest) => unknown;

/**
 * Stubs fetch. `routes` maps "METHOD /path" (without /api/v1) to a body, a Response, or a function
 * of the request returning either. Anything else answers 404. Returns the recorded requests.
 */
export function mockApi(routes: Record<string, unknown>): RecordedRequest[] {
  const requests: RecordedRequest[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: Request) => {
      const url = new URL(input.url);
      const path = url.pathname.replace(/^\/api\/v1/, "");
      const text = await input.clone().text();
      const recorded: RecordedRequest = {
        method: input.method,
        path,
        url,
        body: text ? (JSON.parse(text) as unknown) : undefined,
        headers: input.headers,
      };
      requests.push(recorded);
      const route = routes[`${input.method} ${path}`];
      if (route === undefined) return problem(404, `Nessuna risposta per ${input.method} ${path}`);
      const result = typeof route === "function" ? await (route as Handler)(recorded) : route;
      return result instanceof Response
        ? result
        : json(result, input.method === "POST" ? 201 : 200);
    }),
  );
  return requests;
}

export function renderWithProviders(
  ui: ReactNode,
  {
    path = "/",
    config = TEST_CONFIG,
    profile = TEST_PROFILE,
    slots = {},
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
        mutations: { retry: false },
      },
    }),
  }: {
    path?: string;
    config?: PublicConfig;
    profile?: Profile | null;
    slots?: MatitaSlots;
    queryClient?: QueryClient;
  } = {},
) {
  if (profile) queryClient.setQueryData(queryKeys.profile(), profile);
  const auth = {
    status: "signedIn",
    user: { id: "u1", email: "d.marchi@esempio.it", mode: "demo" },
    config,
    notice: null,
    error: null,
    signOut: () => Promise.resolve(),
  } as unknown as AuthContextValue;
  const router = createMemoryRouter(
    [
      { path: "/studenti/:id", element: ui },
      { path: "*", element: ui },
    ],
    { initialEntries: [path] },
  );
  const result = render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider locale="it-IT">
        <AuthContext value={auth}>
          <MatitaSlotContext value={slots}>
            <ToastProvider>
              <RouterProvider router={router} />
            </ToastProvider>
          </MatitaSlotContext>
        </AuthContext>
      </I18nProvider>
    </QueryClientProvider>,
  );
  return { ...result, router, queryClient };
}
