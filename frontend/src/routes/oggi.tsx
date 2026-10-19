import { usePageTitle } from "@/app/page";
import { TodayScreen } from "@/features/dashboard";

// «Oggi» (D-21, docs/design/03-schermate.md §3).
export function Component() {
  usePageTitle("Oggi");
  return <TodayScreen />;
}
