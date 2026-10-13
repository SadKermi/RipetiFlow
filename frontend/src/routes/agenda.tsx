import { Loadable } from "@/components/Loadable";
import { DEFAULT_TIMEZONE, addDays, formatDateShort, startOfWeek, todayIn } from "@/lib/format";
import { useLessons, useProfile } from "@/lib/queries";

// Placeholder for the week agenda (D-20): proves the lessons range query.
export function Component() {
  const profile = useProfile();
  const timezone = profile.data?.timezone ?? DEFAULT_TIMEZONE;
  const from = startOfWeek(todayIn(timezone));
  const to = addDays(from, 6);
  const lessons = useLessons({ from, to });

  return (
    <>
      <h1>Agenda</h1>
      <p>
        Settimana da {formatDateShort(from)} a {formatDateShort(to)}
      </p>
      <Loadable query={lessons}>
        {(items) => <p>{items.length} lezioni questa settimana</p>}
      </Loadable>
    </>
  );
}
