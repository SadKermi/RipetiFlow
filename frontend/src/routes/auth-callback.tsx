import { usePageTitle } from "@/app/page";
import { AuthCallbackPage } from "@/features/landing/AuthCallbackPage";

// Return point of Google OAuth, magic links and the Calendar consent (D-30, D-31).
export function Component() {
  usePageTitle("Accesso");
  return <AuthCallbackPage />;
}
