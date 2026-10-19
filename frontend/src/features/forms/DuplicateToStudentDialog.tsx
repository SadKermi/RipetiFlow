// «Duplica per un altro studente» (03 §5, lezioni di gruppo): POST /lessons/{id}/duplicate with
// the other student; the copy takes that student's rate from the history (docs/05).
import { CopySimpleIcon, StudentIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Button } from "@/components/Button";
import { Sheet, SheetActions } from "@/components/Dialog";
import { FormNote } from "@/components/Field";
import { SearchSelect } from "@/components/Select";
import { formatShortDate } from "@/components/utils";
import { useFormErrors } from "@/lib/forms";
import { studentsQuery, useDuplicateLesson } from "@/lib/queries";
import { useTutorClock } from "./clock";
import { lessonSavedMessage } from "./messages";
import { deleteLessonNow } from "./undo";
import { useUndoToast } from "./useUndoToast";

export function DuplicateToStudentDialog({
  isOpen,
  onOpenChange,
  lesson,
  onDuplicated,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  lesson: {
    id: string;
    date: string;
    start_time: string | null;
    student: { id: string; display_name: string };
  };
  onDuplicated?: () => void;
}) {
  const { today } = useTutorClock();
  const [studentId, setStudentId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  const errors = useFormErrors({ fields: ["student"], map: { student_id: "student" } }, bodyRef);
  const duplicate = useDuplicateLesson();
  const showToast = useUndoToast();
  const students = useQuery({
    ...studentsQuery({ archived: false, sort: "name" }),
    enabled: isOpen,
  }).data;
  const options = (students ?? [])
    .filter((s) => s.id !== lesson.student.id)
    .map((s) => ({ id: s.id, label: s.display_name, detail: s.grade ?? s.school ?? undefined }));

  async function submit() {
    if (duplicate.isPending) return;
    if (!studentId) {
      errors.show({ student: "Scegli lo studente." });
      return;
    }
    try {
      const copy = await duplicate.mutateAsync({ id: lesson.id, body: { student_id: studentId } });
      onOpenChange(false);
      setStudentId(null);
      showToast(lessonSavedMessage(copy, today, copy.student.display_name), (qc) =>
        deleteLessonNow(qc, copy),
      );
      onDuplicated?.();
    } catch (error) {
      errors.fromProblem(error);
    }
  }

  return (
    <Sheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Duplica per un altro studente"
      subtitle={`Lezione di ${lesson.student.display_name}, ${formatShortDate(lesson.date, today)}${
        lesson.start_time ? ` alle ${lesson.start_time.slice(0, 5)}` : ""
      }`}
      size="small"
      hideCloseButton
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      note={errors.form ? <FormNote>{errors.form}</FormNote> : null}
      actions={({ close }) => (
        <SheetActions>
          <Button variant="line" onPress={close} isDisabled={duplicate.isPending}>
            Annulla
          </Button>
          <Button variant="ink" type="submit" icon={CopySimpleIcon} isPending={duplicate.isPending}>
            Duplica
          </Button>
        </SheetActions>
      )}
    >
      <div ref={bodyRef} className="flex flex-col gap-3 pt-1">
        <SearchSelect
          label="Studente"
          icon={StudentIcon}
          required
          options={options}
          value={studentId}
          onChange={(id) => {
            setStudentId(id);
            errors.clearField("student");
          }}
          query={query}
          onQueryChange={setQuery}
          placeholder="Scegli lo studente"
          error={errors.fields.student}
          hint="Stesso giorno e orario; la tariffa è quella dello studente scelto."
        />
      </div>
    </Sheet>
  );
}
