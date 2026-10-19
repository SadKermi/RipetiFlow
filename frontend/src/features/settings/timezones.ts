// Options of «Fuso orario» (03 §8): every IANA name the browser knows, searchable by name, with the
// country for the zones a tutor of this app is likely to pick.
import type { SelectOption } from "@/components";
import { DEFAULT_TIMEZONE } from "@/lib/format";

/** Country (Italian) of the zones most likely here; the others show only their IANA name. */
const COUNTRY: Readonly<Record<string, string>> = {
  "Europe/Rome": "Italia",
  "Europe/San_Marino": "San Marino",
  "Europe/Vatican": "Città del Vaticano",
  "Europe/Zurich": "Svizzera",
  "Europe/Malta": "Malta",
  "Europe/Ljubljana": "Slovenia",
  "Europe/Vienna": "Austria",
  "Europe/Paris": "Francia",
  "Europe/Monaco": "Monaco",
  "Europe/Berlin": "Germania",
  "Europe/Madrid": "Spagna",
  "Europe/Lisbon": "Portogallo",
  "Europe/London": "Regno Unito",
  "Europe/Dublin": "Irlanda",
  "Europe/Brussels": "Belgio",
  "Europe/Amsterdam": "Paesi Bassi",
  "Europe/Luxembourg": "Lussemburgo",
  "Europe/Athens": "Grecia",
  "Europe/Bucharest": "Romania",
  "Europe/Tirane": "Albania",
  "Europe/Zagreb": "Croazia",
  "Europe/Warsaw": "Polonia",
  "Europe/Prague": "Repubblica Ceca",
  "Europe/Stockholm": "Svezia",
  "Europe/Oslo": "Norvegia",
  "Europe/Copenhagen": "Danimarca",
  "Europe/Helsinki": "Finlandia",
  "Europe/Moscow": "Russia",
  "Europe/Istanbul": "Turchia",
  "America/New_York": "Stati Uniti (est)",
  "America/Los_Angeles": "Stati Uniti (ovest)",
  "America/Argentina/Buenos_Aires": "Argentina",
  "America/Sao_Paulo": "Brasile",
  "Asia/Tokyo": "Giappone",
  "Australia/Sydney": "Australia (Sydney)",
};

/** «Europe/Rome · Italia», or the bare IANA name. */
export function timezoneLabel(zone: string): string {
  const country = COUNTRY[zone];
  return country ? `${zone} · ${country}` : zone;
}

function knownZones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [DEFAULT_TIMEZONE];
  }
}

let cached: SelectOption[] | null = null;

/**
 * All zones (computed once per page), plus `current` if the browser does not list it (e.g. a
 * legacy alias saved earlier), so the field never shows an empty value.
 */
export function timezoneOptions(current: string): SelectOption[] {
  cached ??= knownZones().map((zone) => ({ id: zone, label: timezoneLabel(zone) }));
  if (cached.some((option) => option.id === current)) return cached;
  return [{ id: current, label: timezoneLabel(current) }, ...cached];
}
