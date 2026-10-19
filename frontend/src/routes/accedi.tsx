import { usePageTitle } from "@/app/page";
import { SignInPage } from "@/features/landing/SignInPage";

// Accesso: Google, link via email, demo (D-30). docs/design/03-schermate.md §2.
export function Component() {
  usePageTitle("Accedi");
  return <SignInPage />;
}
