import { usePageTitle } from "@/app/page";
import { AgendaPage } from "@/features/agenda/AgendaPage";

// Agenda (week, planning only, D-20): docs/design/03-schermate.md §6.
export function Component() {
  usePageTitle("Agenda");
  return <AgendaPage />;
}
