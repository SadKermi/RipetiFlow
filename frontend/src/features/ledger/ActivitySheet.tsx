// «Storico modifiche» (docs/design/03-schermate.md §5.1): GET /students/{id}/activity, newest first,
// 50 at a time with the opaque cursor («Mostra altre»). Read-only; full-height sheet on mobile,
// 560 px dialog on desktop. Deleted rows stay here: it is how a lesson deleted by mistake is found.
import { ArrowRightIcon, CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Fragment, type ReactNode, useId, useState } from "react";
import { Button } from "@/components/Button";
import { Sheet, SheetActions } from "@/components/Dialog";
import { MATITA_ICON } from "@/components/icon-map";
import { LoadErrorBand, SkeletonRows } from "@/components/States";
import { isApiProblem } from "@/lib/api/problem";
import type { Activity } from "@/lib/api/types";
import { activityQuery } from "@/lib/queries";
import { fieldLabel, groupByDay, hidesValues, sourceLabel, timeOf } from "./activity-model";

/** The server writes «→» in its texts; our fonts have no such glyph: it is drawn as an icon. */
function withArrows(text: string): ReactNode {
  const parts = text.split("→");
  return parts.map((part, index) => (
    <Fragment key={index}>
      {index > 0 && (
        <>
          <ArrowRightIcon size={14} aria-hidden className="mx-0.5 inline-block align-[-2px]" />
          <span className="sr-only">→</span>
        </>
      )}
      {part}
    </Fragment>
  ));
}

function Changes({ activity }: { activity: Activity }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (activity.changes.length === 0) return null;
  return (
    <div className="mt-0.5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className="-mx-1 -my-2.5 inline-flex min-h-11 cursor-pointer items-center gap-1 px-1 text-[0.875rem] font-medium text-ink-2 hover:text-ink"
      >
        {open ? <CaretDownIcon size={14} aria-hidden /> : <CaretRightIcon size={14} aria-hidden />}
        Dettagli
      </button>
      <ul
        id={id}
        hidden={!open}
        className="m-0 mt-1 list-none p-0 text-[0.875rem] leading-5 text-ink-2"
      >
        {activity.changes.map((change) => (
          <li key={change.field} className="py-0.5">
            <span className="font-medium text-ink">
              {fieldLabel(activity.entity, change.field)}
            </span>
            {" · "}
            {hidesValues(change.field) ? (
              "modificate"
            ) : (
              <>
                {change.before ?? "—"}
                <ArrowRightIcon size={14} aria-hidden className="mx-1 inline-block align-[-2px]" />
                <span className="sr-only">→</span>
                {change.after ?? "—"}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ActivitySheet({
  isOpen,
  onOpenChange,
  studentId,
  studentName,
  timeZone,
  today,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  studentId: string;
  studentName: string;
  timeZone: string;
  today: string;
}) {
  const query = useInfiniteQuery({ ...activityQuery(studentId), enabled: isOpen });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const days = groupByDay(items, timeZone, today);
  const offline = isApiProblem(query.error) && query.error.code === "network_error";

  let content: ReactNode;
  if (query.isPending) {
    content = <SkeletonRows rows={3} rowClassName="min-h-14" />;
  } else if (query.isError && items.length === 0) {
    content = (
      <LoadErrorBand
        onRetry={() => void query.refetch()}
        isRetrying={query.isFetching}
        offline={offline}
        timeZone={timeZone}
      />
    );
  } else if (items.length === 0) {
    content = <p className="m-0 py-4 text-body text-ink-2">Nessuna modifica registrata.</p>;
  } else {
    content = (
      <div aria-live="polite">
        {days.map((day) => (
          <section key={day.date} aria-label={day.label}>
            <h3 className="m-0 pt-3.5 pb-1 text-caption text-ink-3 uppercase">{day.label}</h3>
            <ol className="m-0 list-none p-0">
              {day.items.map((activity) => {
                const source = sourceLabel(activity.source);
                return (
                  <li
                    key={activity.id}
                    className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3 border-b border-rule py-2.5"
                  >
                    <span className="pt-0.5 font-money text-[0.8125rem] text-ink-3 tabular-nums">
                      {timeOf(activity.occurred_at, timeZone)}
                    </span>
                    <div className="min-w-0">
                      <p className="m-0 text-[0.9375rem] leading-[1.375rem] text-ink">
                        {withArrows(activity.summary)}
                      </p>
                      {source && (
                        <p className="m-0 mt-0.5 flex items-center gap-1 text-[0.8125rem] leading-[1.125rem] text-pencil">
                          {activity.source === "assistant" && (
                            <MATITA_ICON size={16} aria-hidden className="shrink-0" />
                          )}
                          {source}
                        </p>
                      )}
                      <Changes activity={activity} />
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
        {query.isError && (
          <LoadErrorBand
            className="mt-3"
            onRetry={() => void query.fetchNextPage()}
            isRetrying={query.isFetchingNextPage}
            offline={offline}
            timeZone={timeZone}
          />
        )}
      </div>
    );
  }

  return (
    <Sheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Storico modifiche"
      subtitle={studentName}
      size="full"
      actions={({ close }) => (
        <SheetActions>
          {query.hasNextPage && (
            <Button
              variant="line"
              isPending={query.isFetchingNextPage}
              onPress={() => void query.fetchNextPage()}
            >
              Mostra altre
            </Button>
          )}
          <Button variant="line" onPress={close}>
            Chiudi
          </Button>
        </SheetActions>
      )}
    >
      {content}
    </Sheet>
  );
}
