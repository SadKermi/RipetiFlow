// "Today" and "now" in the tutor's timezone (profile.timezone, default Europe/Rome): it decides
// when a lesson ends and enters the balance, so the screens never use the browser's own date.
import { useNow } from "@/components/utils";
import type { Profile } from "@/lib/api/types";
import { DEFAULT_TIMEZONE, minutesNowIn, todayIn } from "@/lib/format";
import { useProfile } from "@/lib/queries";

export interface TutorClock {
  timeZone: string;
  /** "YYYY-MM-DD" in the tutor's timezone. */
  today: string;
  /** Minutes since midnight in the tutor's timezone. */
  nowMinutes: number;
  now: Date;
  /** The profile when loaded (default lesson length, default rate). */
  profile: Profile | null;
}

/** Refreshed every minute («tra 40 min», a lesson that just ended). */
export function useTutorClock(): TutorClock {
  const profile = useProfile().data ?? null;
  const timeZone = profile?.timezone ?? DEFAULT_TIMEZONE;
  const now = useNow();
  return {
    timeZone,
    today: todayIn(timeZone, now),
    nowMinutes: minutesNowIn(timeZone, now),
    now,
    profile,
  };
}
