// «Studenti» (docs/design/03-schermate.md §4): title + count → search → filter → the list, sorted
// by balance (who owes most first). Search is the API's `q` (250 ms after the last letter); the
// filter Tutti | Ti devono | In credito is on `balance.status`, client side. Archived students sit
// in a closed section at the bottom. Mobile: rows (02 §9.8); desktop: a table, max 1200 px.
import {
  CaretDownIcon,
  CaretRightIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useEffect, useId, useState } from "react";
import { Button as AriaButton, Input, SearchField } from "react-aria-components";
import { Link } from "react-router";
import { BalanceInline } from "@/components/BalanceBadge";
import { Button, InlineButton } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Select } from "@/components/Select";
import { LoadErrorBand, SkeletonRows } from "@/components/States";
import { StudentListItem } from "@/components/StudentListItem";
import { cx, formatAmountColumn, formatShortDate, useMediaQuery } from "@/components/utils";
import { isApiProblem } from "@/lib/api/problem";
import type { StudentSummary } from "@/lib/api/types";
import type { StudentListParams } from "@/lib/queries";
import { useStudents } from "@/lib/queries";
import { StudentFormDialog, useTutorClock } from "@/features/forms";

type Filter = "all" | "debt" | "credit";
type Sort = NonNullable<StudentListParams["sort"]>;

const FILTERS = [
  { value: "all", label: "Tutti" },
  { value: "debt", label: "Ti devono" },
  { value: "credit", label: "In credito" },
] as const;

const SORTS = [
  { id: "balance", label: "Saldo" },
  { id: "name", label: "Nome" },
  { id: "next_lesson", label: "Prossima" },
] as const;

const DESKTOP_QUERY = "(min-width: 64rem)";

/** The value, `delayMs` after it stopped changing (search 250 ms after the last letter). */
function useDebounced<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}

function activeCount(count: number): string {
  return count === 1 ? "1 attivo" : `${String(count)} attivi`;
}

/** «mer 7 ott 16:00» / «oggi 15:00» / «ultima lun 28 set» / «—» for the desktop column. */
function nextColumn(student: StudentSummary, today: string): string {
  if (student.next_lesson) {
    const time = student.next_lesson.start_time.slice(0, 5);
    return student.next_lesson.date === today
      ? `oggi ${time}`
      : `${formatShortDate(student.next_lesson.date, today)} ${time}`;
  }
  if (student.last_lesson_date) return `ultima ${formatShortDate(student.last_lesson_date, today)}`;
  return "—";
}

function matchesName(student: StudentSummary, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase("it-IT");
  return needle === "" || student.display_name.toLocaleLowerCase("it-IT").includes(needle);
}

export function StudentsScreen() {
  const { today, timeZone } = useTutorClock();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 250);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("balance");
  const [showArchived, setShowArchived] = useState(false);
  const [newStudent, setNewStudent] = useState<string | null>(null);
  const archivedId = useId();

  const all = useStudents({ archived: false, sort });
  const searched = useStudents(q ? { archived: false, sort, q } : { archived: false, sort });
  const archived = useStudents({ archived: true, sort: "name" });
  const list = q ? searched : all;
  const items = list.data ?? [];
  const shown = items.filter((s) => filter === "all" || s.balance.status === filter);
  const archivedShown = (archived.data ?? []).filter((s) => matchesName(s, q));

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="m-0 font-display text-display-l font-normal text-ink">
          Studenti
          {desktop && all.data && (
            <>
              {" "}
              <span className="ml-2 align-middle font-ui text-body text-ink-3">
                · {activeCount(all.data.length)}
              </span>
            </>
          )}
        </h1>
        {!desktop && all.data && (
          <p className="m-0 mt-1 text-[0.9375rem] text-ink-3">{activeCount(all.data.length)}</p>
        )}
      </div>
      <Button variant={desktop ? "ink" : "line"} icon={PlusIcon} onPress={() => setNewStudent("")}>
        {desktop ? "Nuovo studente" : "Nuovo"}
      </Button>
    </div>
  );

  const controls = (
    <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
      <SearchField
        aria-label="Cerca per nome"
        value={search}
        onChange={setSearch}
        className="group relative flex items-center lg:w-80"
      >
        <MagnifyingGlassIcon
          size={18}
          aria-hidden
          className="pointer-events-none absolute left-3 text-ink-3"
        />
        <Input
          placeholder="Cerca per nome"
          className="h-control w-full rounded-xs border border-control bg-paper-raised pr-11 pl-10 text-body text-ink placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
        />
        <AriaButton
          aria-label="Cancella la ricerca"
          className="absolute right-0 grid size-touch cursor-pointer place-items-center text-ink-3 group-data-empty:hidden"
        >
          <XIcon size={16} aria-hidden />
        </AriaButton>
      </SearchField>
      <SegmentedControl
        aria-label="Filtra per saldo"
        options={FILTERS}
        value={filter}
        onChange={setFilter}
        fullWidth={!desktop}
      />
      {desktop && (
        <Select
          label="Ordina"
          options={SORTS}
          value={sort}
          onChange={(id) => setSort((id as Sort | null) ?? "balance")}
          // «Ordina: Saldo ▾» on the same line as search and filter (03 §4), not a label above.
          className="ml-auto flex items-center gap-2 [&>button]:w-40 [&>span]:mb-0"
        />
      )}
    </div>
  );

  const offline = isApiProblem(list.error) && list.error.code === "network_error";
  let body;
  if (list.isPending) {
    body = <SkeletonRows rows={4} rowClassName="min-h-16" />;
  } else if (list.isError && !list.data) {
    body = (
      <LoadErrorBand
        onRetry={() => void list.refetch()}
        isRetrying={list.isFetching}
        offline={offline}
        timeZone={timeZone}
      />
    );
  } else if (items.length === 0 && !q) {
    body = (
      <EmptyState
        action={
          <Button variant="ink" icon={PlusIcon} onPress={() => setNewStudent("")}>
            Aggiungi studente
          </Button>
        }
      >
        Nessuno studente. Inizia dal primo: nome e tariffa bastano.
      </EmptyState>
    );
  } else if (items.length === 0) {
    body = (
      <EmptyState
        action={
          <InlineButton onPress={() => setNewStudent(q)}>Aggiungi {q} come studente</InlineButton>
        }
      >
        Nessuno studente con “{q}” nel nome.
      </EmptyState>
    );
  } else if (shown.length === 0) {
    body = (
      <EmptyState tone="quiet">
        {filter === "debt" ? "Nessuno ti deve soldi." : "Nessuno è in credito."}
      </EmptyState>
    );
  } else {
    body = (
      <div className={cx(list.isError && "text-ink-2")}>
        {list.isError && (
          <LoadErrorBand
            className="mb-4"
            onRetry={() => void list.refetch()}
            isRetrying={list.isFetching}
            offline={offline}
            cachedAt={list.dataUpdatedAt}
            timeZone={timeZone}
          />
        )}
        {desktop ? (
          <StudentsTable students={shown} today={today} />
        ) : (
          <ul aria-label="Studenti" className="m-0 list-none p-0">
            {shown.map((student) => (
              <li key={student.id}>
                <StudentListItem student={student} today={today} />
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <>
      {header}
      {controls}
      <div className="mt-5 border-t-2 border-ink" aria-busy={list.isFetching || undefined}>
        {body}
      </div>
      {archivedShown.length > 0 && (
        <section className="mt-6">
          <h2 className="m-0">
            <button
              type="button"
              aria-expanded={showArchived}
              aria-controls={archivedId}
              onClick={() => setShowArchived((open) => !open)}
              className="flex min-h-11 cursor-pointer items-center gap-1.5 text-caption text-ink-3 uppercase hover:text-ink"
            >
              Archiviati ({archivedShown.length})
              {showArchived ? (
                <CaretDownIcon size={16} aria-hidden />
              ) : (
                <CaretRightIcon size={16} aria-hidden />
              )}
            </button>
          </h2>
          <ul
            id={archivedId}
            hidden={!showArchived}
            aria-label="Archiviati"
            className="m-0 list-none p-0"
          >
            {showArchived &&
              archivedShown.map((student) => (
                <li key={student.id}>
                  <StudentListItem student={student} today={today} className="text-ink-2" />
                </li>
              ))}
          </ul>
        </section>
      )}
      <StudentFormDialog
        isOpen={newStudent !== null}
        onOpenChange={(open) => {
          if (!open) setNewStudent(null);
        }}
        initialName={newStudent ?? ""}
      />
    </>
  );
}

const HEAD = "bg-paper px-3 pt-2.5 pb-2 text-left align-bottom text-caption text-ink-3 uppercase";
const CELL = "px-3 py-3 align-baseline";

/** Desktop: NOME | CLASSE | PROSSIMA | TARIFFA | SALDO; the whole row opens the student. */
function StudentsTable({
  students,
  today,
}: {
  students: readonly StudentSummary[];
  today: string;
}) {
  return (
    <table className="w-full border-collapse">
      <caption className="sr-only">Studenti attivi</caption>
      <thead>
        <tr>
          <th scope="col" className={HEAD}>
            Nome
          </th>
          <th scope="col" className={HEAD}>
            Classe
          </th>
          <th scope="col" className={HEAD}>
            Prossima
          </th>
          <th scope="col" className={cx(HEAD, "text-right")}>
            Tariffa
          </th>
          <th scope="col" className={cx(HEAD, "text-right")}>
            Saldo
          </th>
        </tr>
      </thead>
      <tbody>
        {students.map((student) => (
          <tr
            key={student.id}
            className="relative border-b border-rule bg-paper-raised transition-colors hover:bg-paper-sunk"
          >
            <td className={cx(CELL, "font-medium")}>
              <Link
                to={`/studenti/${student.id}`}
                className="text-ink no-underline after:absolute after:inset-0 after:content-['']"
              >
                {student.display_name}
              </Link>
            </td>
            <td className={cx(CELL, "text-[0.9375rem] text-ink-2")}>
              {student.grade ?? student.school ?? "—"}
            </td>
            <td className={cx(CELL, "text-[0.9375rem] text-ink-2")}>
              {nextColumn(student, today)}
            </td>
            <td className={cx(CELL, "text-right font-money text-money tabular-nums")}>
              {student.balance.current_hourly_rate_cents === null
                ? "—"
                : formatAmountColumn(student.balance.current_hourly_rate_cents)}
            </td>
            <td className={cx(CELL, "text-right")}>
              <BalanceInline
                cents={student.balance.balance_cents}
                creditMinutes={student.balance.credit_minutes}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
