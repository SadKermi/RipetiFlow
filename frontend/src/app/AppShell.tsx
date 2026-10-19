import { useQuery } from "@tanstack/react-query";
import { Outlet, useMatch } from "react-router";
import { AccountMenu, DemoBanner, SkipLink, TabBar, TopNav } from "@/components/shell/Navigation";
import { useMatitaSlots } from "@/components/shell/matita-slot";
import { useShellBottomInset } from "@/components/shell/useShellBottomInset";
import { Wordmark } from "@/components/shell/Wordmark";
import { initialsOf } from "@/components/utils";
import { profileQuery } from "@/lib/queries";
import { useAuth } from "./auth";
import { useFocusMainOnNavigation } from "./page";

/**
 * Frame of the authenticated pages (docs/design/02-design-system.md §9.14, 03):
 * - below 1024 px: content, then a fixed bottom stack = Matita bar (slot) + tab bar
 *   «Oggi · Studenti · Agenda · Altro»; no top bar (each page has its own title row);
 * - from 1024 px: 64 px top bar = wordmark · Oggi / Studenti / Agenda · Matita (slot) · avatar
 *   menu (Impostazioni, Esci); content max 1200 px.
 * Matita mounts through MatitaSlotContext (src/components/shell/matita-slot.ts). Student-first
 * sections only, no global lessons/payments pages (D-20).
 */
export function AppShell() {
  const { user, signOut } = useAuth();
  // Name for the avatar from the cache only: the shell never adds a request of its own.
  const profile = useQuery({ ...profileQuery(), enabled: false }).data;
  const { MobileBar, TopBarButton } = useMatitaSlots();
  const onStudentPage = useMatch("/studenti/:id") !== null;
  const bottomRef = useShellBottomInset<HTMLDivElement>();
  useFocusMainOnNavigation();
  const handleSignOut = () => void signOut();
  const name = profile?.full_name ?? null;
  const email = user?.email ?? profile?.email ?? null;

  return (
    <div className="flex min-h-dvh flex-col bg-paper text-ink">
      <SkipLink />
      {user?.mode === "demo" && <DemoBanner onSignOut={handleSignOut} />}
      <header className="hidden border-b border-rule bg-paper lg:block">
        <div className="mx-auto flex h-16 max-w-page items-center gap-10 px-gutter">
          <Wordmark />
          <TopNav />
          <div className="ml-auto flex items-center gap-4">
            {TopBarButton && <TopBarButton />}
            <AccountMenu
              initials={initialsOf(name, email)}
              name={name}
              email={email}
              onSignOut={handleSignOut}
            />
          </div>
        </div>
      </header>
      {/* A non-interactive skip target: it takes focus from «Salta al contenuto» without a ring. */}
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-page flex-1 px-gutter pt-4 pb-[calc(var(--rf-shell-bottom,0px)_+_2rem)] focus:outline-none focus-visible:shadow-none lg:pt-8 lg:pb-16"
      >
        <Outlet />
      </main>
      <div
        ref={bottomRef}
        className="fixed inset-x-0 bottom-0 z-(--rf-z-matita) bg-paper-raised pb-[env(safe-area-inset-bottom,0px)] lg:hidden"
      >
        {MobileBar && !onStudentPage && (
          <div data-slot="matita-bar" className="border-t border-rule-strong">
            <MobileBar />
          </div>
        )}
        <TabBar />
      </div>
    </div>
  );
}
