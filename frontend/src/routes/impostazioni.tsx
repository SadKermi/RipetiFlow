import { usePageTitle } from "@/app/page";
import { SettingsPage } from "@/features/settings/SettingsPage";

// Impostazioni («Altro» on mobile): docs/design/03-schermate.md §8.
export function Component() {
  usePageTitle("Impostazioni");
  return <SettingsPage />;
}
