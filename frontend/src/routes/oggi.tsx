import { Loadable } from "@/components/Loadable";
import { formatDateLong, formatEuro } from "@/lib/format";
import { useDashboard } from "@/lib/queries";

// Placeholder for "Oggi" (D-21): proves the dashboard query; the real screen comes with the
// design system.
export function Component() {
  const dashboard = useDashboard();
  return (
    <>
      <h1>Oggi</h1>
      <Loadable query={dashboard}>
        {(data) => (
          <dl>
            <dt>Data</dt>
            <dd>{formatDateLong(data.today)}</dd>
            <dt>Prossime lezioni</dt>
            <dd>{data.upcoming.length}</dd>
            <dt>Studenti che ti devono soldi</dt>
            <dd>{data.owing.length}</dd>
            <dt>Studenti in credito</dt>
            <dd>{data.in_credit.length}</dd>
            <dt>Ti devono in totale</dt>
            <dd>{formatEuro(data.totals.owed_to_you_cents)}</dd>
            <dt>Lezioni di {data.month.label}</dt>
            <dd>{data.month.lessons}</dd>
          </dl>
        )}
      </Loadable>
    </>
  );
}
