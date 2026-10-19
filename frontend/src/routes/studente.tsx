import { useParams } from "react-router";
import { usePageTitle } from "@/app/page";
import { StudentPage } from "@/features/students";
import { useStudent } from "@/lib/queries";

// The student's page and ledger (D-18, docs/design/03-schermate.md §5). Keyed by id: another
// student is a fresh page (dialogs closed, month window reset).
export function Component() {
  const { id = "" } = useParams();
  // Same query as the page itself (shared cache): the name appears in the tab once loaded.
  usePageTitle(useStudent(id).data?.display_name ?? "Studente");
  return <StudentPage key={id} id={id} />;
}
