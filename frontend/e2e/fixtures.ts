// Shared fixtures for the journeys (docs/design/03-schermate.md). Every test runs twice: on the
// "mobile" project (390×844) and on the "desktop" one (1440×900), against the real backend in demo
// mode (D-30) with ASSISTANT_PROVIDER=none.
//
// - `problems` (automatic): any console error or uncaught exception fails the test, except the
//   ones a test declares as expected (e.g. the 409 of a refused delete, logged by Chromium).
// - `demo`: the demo tutor with freshly seeded data, signed in without going through the UI (the
//   session is the one the SPA keeps in sessionStorage), plus a small API client for test setup.
// - `screens`: full-page screenshots for the design review in docs/design/screens/ (only with
//   E2E_SCREENSHOTS=1, i.e. `make screens`).
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  type APIRequestContext,
  type Locator,
  type Page,
  test as base,
  expect,
} from "@playwright/test";

export { expect };

const DEMO_STORAGE_KEY = "ripetiflow.demo-session"; // src/app/auth/store.ts
const SCREENS_DIR = fileURLToPath(new URL("../../docs/design/screens/", import.meta.url));
// The demo data is relative to today, so the pictures change at every run: they are written only
// on request (`make screens`), not by every `make e2e`.
const SAVE_SCREENS = process.env.E2E_SCREENSHOTS === "1";
const TIME_ZONE = "Europe/Rome"; // the demo tutor's profile timezone

/** A calendar day in the tutor's timezone, `offset` days from today ("YYYY-MM-DD"). */
export function isoDay(offset = 0): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

/** The first day of the month before the current one: a rate valid from there covers «ieri». */
export function firstOfPreviousMonth(): string {
  const [year, month] = isoDay().split("-").map(Number) as [number, number];
  const date = new Date(Date.UTC(year, month - 2, 1));
  return date.toISOString().slice(0, 10);
}

/** «lun 19 ott»: the short day used by the ledger rows and the confirmations. */
export function shortDay(iso: string): string {
  const date = new Date(`${iso}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}`;
}

interface StudentInput {
  first_name: string;
  last_name?: string;
  hourly_rate_cents: number;
  rate_effective_from?: string;
  guardian_name?: string;
  guardian_phone?: string;
}
interface LessonInput {
  student_id: string;
  date: string;
  start_time: string;
  end_time: string;
  topic?: string;
}
interface PaymentInput {
  student_id: string;
  amount_cents: number;
  paid_on: string;
  method: "cash" | "bank_transfer" | "other";
}

export interface DemoApi {
  createStudent(body: StudentInput): Promise<{ id: string; display_name: string }>;
  createLesson(body: LessonInput): Promise<{ id: string; amount_cents: number }>;
  createPayment(body: PaymentInput): Promise<{ id: string }>;
}

export interface Demo {
  api: DemoApi;
  /** Bearer token of the demo tutor, for direct API calls. */
  token: string;
}

export interface Problems {
  /** Console errors matching `pattern` are expected in this test. */
  allow(pattern: RegExp): void;
}

export interface Screens {
  /** Full-page screenshot of what is on screen: docs/design/screens/<name>-<390|1440>.png. */
  page(name: string): Promise<void>;
  /** Screenshot of the viewport with an open dialog or sheet (its content scrolls inside). */
  dialog(name: string, dialog: Locator): Promise<void>;
}

async function settle(page: Page) {
  // Web fonts and the skeleton delay (300 ms) must not leak into the screenshots.
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.waitForTimeout(150);
}

function client(request: APIRequestContext, token: string): DemoApi {
  const headers = { Authorization: `Bearer ${token}` };
  async function post<T>(path: string, data: object): Promise<T> {
    const response = await request.post(`/api/v1${path}`, { headers, data });
    expect(response.status(), `POST ${path}: ${await response.text()}`).toBe(201);
    return (await response.json()) as T;
  }
  return {
    createStudent: (body) => post("/students", body),
    createLesson: (body) => post("/lessons", body),
    createPayment: (body) => post("/payments", body),
  };
}

export const test = base.extend<{
  mobile: boolean;
  problems: Problems;
  demo: Demo;
  screens: Screens;
}>({
  mobile: async ({ isMobile }, provide) => {
    await provide(isMobile);
  },

  problems: [
    async ({ page }, provide) => {
      const seen: string[] = [];
      const allowed: RegExp[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") seen.push(message.text());
      });
      page.on("pageerror", (error) => seen.push(error.message));
      // Chromium logs a failed request without its URL: keep them to explain such an error.
      const failed: string[] = [];
      page.on("response", (response) => {
        if (response.status() >= 400) {
          failed.push(
            `${String(response.status())} ${response.request().method()} ${response.url()}`,
          );
        }
      });
      await provide({ allow: (pattern) => allowed.push(pattern) });
      expect(
        seen.filter((text) => !allowed.some((pattern) => pattern.test(text))),
        `console errors (failed requests: ${failed.join(", ") || "none"})`,
      ).toEqual([]);
    },
    { auto: true },
  ],

  demo: async ({ page, request }, provide) => {
    const login = await request.post("/api/v1/dev/login");
    expect(login.ok(), "demo login (is the backend running with DEV_AUTH=1?)").toBe(true);
    const session = (await login.json()) as { access_token: string };
    const seed = await request.post("/api/v1/dev/seed", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    expect(seed.ok()).toBe(true);
    await page.addInitScript(
      ([key, value]) => {
        window.sessionStorage.setItem(key, value);
      },
      [DEMO_STORAGE_KEY, JSON.stringify(session)] as const,
    );
    await provide({ api: client(request, session.access_token), token: session.access_token });
  },

  screens: async ({ page }, provide) => {
    if (!SAVE_SCREENS) {
      await provide({
        async page() {},
        async dialog(_name, dialog) {
          await expect(dialog).toBeVisible();
        },
      });
      return;
    }
    mkdirSync(SCREENS_DIR, { recursive: true });
    const viewport = page.viewportSize() ?? { width: 1440, height: 900 };
    const file = (name: string) => `${SCREENS_DIR}${name}-${String(viewport.width)}.png`;
    await provide({
      async page(name) {
        await settle(page);
        // A taller viewport instead of `fullPage`: fixed bars (tab bar, Matita bar) stay at the
        // bottom of the picture instead of floating halfway down the page.
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        await page.setViewportSize({
          width: viewport.width,
          height: Math.max(height, viewport.height),
        });
        await settle(page);
        await page.screenshot({ path: file(name), animations: "disabled", caret: "hide" });
        await page.setViewportSize(viewport);
      },
      async dialog(name, dialog) {
        await expect(dialog).toBeVisible();
        await settle(page);
        await page.screenshot({ path: file(name), animations: "disabled", caret: "hide" });
      },
    });
  },
});

// --- accessibility -------------------------------------------------------------------------------

const require = createRequire(import.meta.url);
let axeSource: string | null | undefined;

/** axe-core is already installed (through eslint-plugin-jsx-a11y): no extra dependency. */
function axePath(): string | null {
  if (axeSource !== undefined) return axeSource;
  try {
    axeSource = require.resolve("axe-core/axe.min.js");
  } catch {
    axeSource = null;
  }
  return axeSource;
}

interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodes: { target: string[]; html: string }[];
}

/**
 * WCAG 2.2 A/AA checks with axe-core on the current page (or inside `scope`). Without axe the
 * check falls back to the essentials: every control has an accessible name.
 */
export async function expectAccessible(page: Page, scope?: string) {
  const path = axePath();
  if (path) {
    await page.addScriptTag({ path });
    const violations = await page.evaluate(async (include) => {
      const axe = (
        window as unknown as {
          axe: {
            run: (context: unknown, options: unknown) => Promise<{ violations: AxeViolation[] }>;
          };
        }
      ).axe;
      // react-aria's live announcer (role="log" with role="img" entries labelled by elements that
      // may be gone) is library plumbing, not page content.
      const context = {
        include: include ? [include] : [["html"]],
        exclude: [["[data-live-announcer]"]],
      };
      const result = await axe.run(context, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
        resultTypes: ["violations"],
      });
      return result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.slice(0, 5).map((n) => ({ target: n.target, html: n.html })),
      }));
    }, scope ?? null);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
    return;
  }
  const unnamed = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        "button, a[href], input, select, textarea, [role=button]",
      ),
    )
      .filter((el) => !el.closest("[aria-hidden=true]") && el.offsetParent !== null)
      .filter((el) => {
        const text = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim();
        const labels = el instanceof HTMLInputElement ? (el.labels?.length ?? 0) : 0;
        return !text && !el.getAttribute("aria-labelledby") && labels === 0;
      })
      .map((el) => el.outerHTML.slice(0, 120)),
  );
  expect(unnamed).toEqual([]);
}
