// Pure helpers of the «Profilo» form (03 §8), kept out of the component module.
import type { SelectOption } from "@/components";
import type { Profile, ProfilePatch } from "@/lib/api/types";
import { formatMinutes } from "@/lib/format";

export type ProfileField =
  "full_name" | "timezone" | "default_lesson_minutes" | "default_hourly_rate_cents";

/** Screen order: the first one in error takes the focus (03 §10.4). */
export const PROFILE_FIELDS: readonly ProfileField[] = [
  "full_name",
  "timezone",
  "default_lesson_minutes",
  "default_hourly_rate_cents",
];

/** 15 min … 8 h in steps of 15 (the API accepts 15–480). */
export const LESSON_LENGTHS: readonly SelectOption[] = Array.from({ length: 32 }, (_, index) => {
  const minutes = (index + 1) * 15;
  return { id: String(minutes), label: formatMinutes(minutes) };
});

/** «Salvato» stays this long next to the button. */
export const SAVED_MS = 2000;

export interface ProfileValues {
  full_name: string;
  timezone: string;
  default_lesson_minutes: number;
  default_hourly_rate_cents: number | null;
}

export function profileValues(profile: Profile): ProfileValues {
  return {
    full_name: profile.full_name ?? "",
    timezone: profile.timezone,
    default_lesson_minutes: profile.default_lesson_minutes,
    default_hourly_rate_cents: profile.default_hourly_rate_cents ?? null,
  };
}

/** Only what changed, with an empty name sent as null (the API clears it). */
export function profilePatch(profile: Profile, values: ProfileValues): ProfilePatch {
  const before = profileValues(profile);
  const patch: ProfilePatch = {};
  const name = values.full_name.trim();
  if (name !== before.full_name.trim()) patch.full_name = name === "" ? null : name;
  if (values.timezone !== before.timezone) patch.timezone = values.timezone;
  if (values.default_lesson_minutes !== before.default_lesson_minutes) {
    patch.default_lesson_minutes = values.default_lesson_minutes;
  }
  if (values.default_hourly_rate_cents !== before.default_hourly_rate_cents) {
    patch.default_hourly_rate_cents = values.default_hourly_rate_cents;
  }
  return patch;
}
