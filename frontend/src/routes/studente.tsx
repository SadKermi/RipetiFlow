import { useMutation } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { Loadable } from "@/components/Loadable";
import { downloadStudentLedgerCsv } from "@/lib/api/download";
import { errorMessage } from "@/lib/api/problem";
import { formatEuro } from "@/lib/format";
import { useLedger, useStudent } from "@/lib/queries";

// Placeholder for the student's page and ledger (D-18): proves detail + ledger + CSV export.
export function Component() {
  const { id = "" } = useParams();
  const student = useStudent(id);
  const ledger = useLedger(id);
  const csv = useMutation({ mutationFn: () => downloadStudentLedgerCsv(id) });

  return (
    <>
      <p>
        <Link to="/studenti">← Studenti</Link>
      </p>
      <Loadable query={student}>
        {(data) => (
          <>
            <h1>{data.display_name}</h1>
            <p>Saldo: {formatEuro(data.balance.balance_cents)}</p>
            <p>Tariffe registrate: {data.rates.length}</p>
          </>
        )}
      </Loadable>
      <h2>Libro mastro</h2>
      <Loadable query={ledger}>{(data) => <p>{data.items.length} movimenti</p>}</Loadable>
      <p>
        <button type="button" onClick={() => csv.mutate()} disabled={csv.isPending}>
          Scarica CSV
        </button>
      </p>
      {csv.isError && <p role="alert">{errorMessage(csv.error)}</p>}
    </>
  );
}
