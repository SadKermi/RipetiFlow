import { Link } from "react-router";
import { Loadable } from "@/components/Loadable";
import { formatEuro } from "@/lib/format";
import { useStudents } from "@/lib/queries";

// Placeholder for the students index (D-20): proves the list query.
export function Component() {
  const students = useStudents({ sort: "name" });
  return (
    <>
      <h1>Studenti</h1>
      <Loadable query={students}>
        {(items) => (
          <>
            <p>{items.length === 1 ? "1 studente" : `${String(items.length)} studenti`}</p>
            <ul>
              {items.map((student) => (
                <li key={student.id}>
                  <Link to={`/studenti/${student.id}`}>{student.display_name}</Link> —{" "}
                  {formatEuro(student.balance.balance_cents)}
                </li>
              ))}
            </ul>
          </>
        )}
      </Loadable>
    </>
  );
}
