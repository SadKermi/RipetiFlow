// App navigation (docs/design/02-design-system.md §9.14): tab bar «Oggi · Studenti · Agenda ·
// Altro» below 1024 px; from 1024 px a 64 px top bar with text links and the avatar menu.
// Student-first sections only (D-20): no global lessons or payments pages.
import {
  CalendarDotsIcon,
  GearSixIcon,
  HouseIcon,
  type Icon,
  StudentIcon,
  UserCircleDashedIcon,
} from "@phosphor-icons/react";
import {
  Button as AriaButton,
  Header,
  Menu,
  MenuItem,
  MenuSection,
  MenuTrigger,
  Popover,
} from "react-aria-components";
import { NavLink } from "react-router";
import { Button } from "../Button";
import { cx } from "../utils";

interface Section {
  to: string;
  label: string;
  icon: Icon;
}

/** Mobile tabs (02 §9.14): «Altro» is the settings page. */
const TAB_SECTIONS: readonly Section[] = [
  { to: "/oggi", label: "Oggi", icon: HouseIcon },
  { to: "/studenti", label: "Studenti", icon: StudentIcon },
  { to: "/agenda", label: "Agenda", icon: CalendarDotsIcon },
  { to: "/impostazioni", label: "Altro", icon: GearSixIcon },
];

/** Desktop links: settings live in the avatar menu. */
const TOP_SECTIONS = TAB_SECTIONS.slice(0, 3);

/** Tab bar: icon 22 + label 12/500; active in ink with a 3 px bar on top, inactive ink-3. */
export function TabBar() {
  return (
    <nav aria-label="Sezioni" className="border-t border-rule-strong bg-paper-raised">
      <ul className="m-0 grid h-tabbar list-none grid-cols-4 p-0">
        {TAB_SECTIONS.map(({ to, label, icon: IconComponent }) => (
          <li key={to} className="contents">
            <NavLink
              to={to}
              className={({ isActive }) =>
                cx(
                  "relative flex flex-col items-center justify-center gap-[3px] text-[0.75rem] leading-4 font-medium no-underline",
                  isActive
                    ? "text-ink before:absolute before:inset-x-[22%] before:top-0 before:h-[3px] before:bg-ink before:content-['']"
                    : "text-ink-3",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <IconComponent size={22} weight={isActive ? "fill" : "regular"} aria-hidden />
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Desktop text links 15/500; active underlined 2 px in ink, offset 6 px; 44 px tall. */
export function TopNav() {
  return (
    <nav aria-label="Sezioni">
      <ul className="m-0 flex list-none items-center gap-7 p-0">
        {TOP_SECTIONS.map(({ to, label }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                cx(
                  "inline-flex h-11 items-center text-[0.9375rem] font-medium decoration-2 underline-offset-[6px] transition-colors",
                  isActive ? "text-ink underline" : "text-ink-2 no-underline hover:text-ink",
                )
              }
            >
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const MENU_ITEM =
  "flex min-h-11 cursor-pointer items-center rounded-xs px-3 text-body text-ink no-underline outline-none data-focused:bg-paper-sunk data-hovered:bg-paper-sunk";

/** Avatar (initials) with the account menu: Impostazioni, Esci. */
export function AccountMenu({
  initials,
  name,
  email,
  onSignOut,
}: {
  initials: string;
  name: string | null;
  email: string | null;
  onSignOut: () => void;
}) {
  const who = name ?? email ?? "il tuo account";
  // The visible initials are part of the name too (WCAG 2.5.3, label in name): «TD» on screen,
  // «Account: Tutor Demo, TD» for screen readers and voice control.
  const label = initials ? `Account: ${who}, ${initials}` : `Account: ${who}`;
  return (
    <MenuTrigger>
      <AriaButton
        aria-label={label}
        className="grid size-11 cursor-pointer place-items-center rounded-full border border-rule-strong bg-paper-sunk text-[0.875rem] font-semibold text-ink-2 data-hovered:text-ink"
      >
        <span aria-hidden>{initials}</span>
      </AriaButton>
      <Popover
        placement="bottom end"
        offset={6}
        className="min-w-56 rounded-sm border border-control bg-paper-raised p-1 shadow-popover outline-none"
      >
        <Menu className="outline-none">
          <MenuSection>
            <Header className="px-3 pt-2 pb-2 text-[0.875rem] leading-5 text-ink-3">
              {name && <span className="block font-medium text-ink">{name}</span>}
              {email && <span className="block truncate">{email}</span>}
            </Header>
            <MenuItem href="/impostazioni" className={MENU_ITEM}>
              Impostazioni
            </MenuItem>
            <MenuItem onAction={onSignOut} className={MENU_ITEM}>
              Esci
            </MenuItem>
          </MenuSection>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}

/**
 * Demo-mode marker (only with dev_auth: sample data, no real account), with its own «Esci» so
 * the demo can be left from any page and any screen size.
 */
export function DemoBanner({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="border-b border-rule bg-paper-sunk">
      <div className="mx-auto flex max-w-page items-center gap-2 px-gutter py-0.5 text-[0.875rem] leading-5 text-ink-2">
        <UserCircleDashedIcon size={20} aria-hidden className="shrink-0" />
        <p className="m-0 min-w-0 flex-1">
          <span className="font-semibold text-ink">Modalità demo</span>
          <span className="max-sm:hidden">: dati di esempio, nessun account vero.</span>
        </p>
        <Button variant="quiet" size="sm" onPress={onSignOut}>
          Esci
        </Button>
      </div>
    </div>
  );
}

/** «Salta al contenuto»: first focusable element, visible only when focused. */
export function SkipLink({ targetId = "main" }: { targetId?: string }) {
  return (
    <a
      href={`#${targetId}`}
      onClick={(event) => {
        const target = document.getElementById(targetId);
        if (!target) return;
        event.preventDefault();
        target.focus();
      }}
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-(--rf-z-toast) focus:rounded-xs focus:bg-paper-raised focus:px-4 focus:py-3 focus:font-semibold focus:text-ink"
    >
      Salta al contenuto
    </a>
  );
}
