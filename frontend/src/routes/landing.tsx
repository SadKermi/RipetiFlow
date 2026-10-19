import { usePageTitle } from "@/app/page";
import { LandingPage } from "@/features/landing/LandingPage";

// Public landing (D-22): docs/design/03-schermate.md §1.
export function Component() {
  usePageTitle(null);
  return <LandingPage />;
}
