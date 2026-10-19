import { usePageTitle } from "@/app/page";
import { StudentsScreen } from "@/features/students";

// Students index (D-20, docs/design/03-schermate.md §4).
export function Component() {
  usePageTitle("Studenti");
  return <StudentsScreen />;
}
