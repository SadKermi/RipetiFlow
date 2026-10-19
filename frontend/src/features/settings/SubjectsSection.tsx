// «Materie» (03 §8, D-14): the order here is the order of the «Materia» menu in the forms.
// Reorder with the handle (drag), «Sposta su / Sposta giù» in the row menu, or Alt + ↑/↓ on the
// handle; rename in line (Invio saves, Esc cancels); archive (kept on lessons, gone from menus),
// restore, delete (with confirmation: lessons keep existing without a subject).
import {
  ArchiveIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CaretRightIcon,
  DotsSixVerticalIcon,
  DotsThreeIcon,
  EraserIcon,
  PencilSimpleIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import {
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  Disclosure,
  DisclosurePanel,
  Heading,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  Button as AriaButton,
} from "react-aria-components";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  FormNote,
  Loadable,
  SkeletonRows,
  TextField,
  cx,
} from "@/components";
import { errorMessage } from "@/lib/api/problem";
import type { Subject } from "@/lib/api/types";
import { useFormErrors } from "@/lib/forms";
import { useCreateSubject, useDeleteSubject, useSubjects, useUpdateSubject } from "@/lib/queries";
import { useReorderSubjects } from "@/lib/queries/settings";
import { focusWhenLost } from "./focus";
import { SettingsSection } from "./SettingsSection";

/** Server limit of a subject name. */
const NAME_MAX = 60;
const EMPTY_NAME = "Scrivi il nome della materia.";
/** Focus target meaning «the new-name field» (see focusNext). */
const ADD_FIELD = "__add__";

const MENU_ITEM =
  "flex min-h-11 cursor-pointer items-center gap-2 rounded-xs px-3 text-body text-ink outline-none data-disabled:cursor-not-allowed data-disabled:opacity-40 data-focused:bg-paper-sunk data-hovered:bg-paper-sunk";

/** `ids` with `id` moved to position `to` (0-based). */
function moveId(ids: readonly string[], id: string, to: number): string[] {
  const rest = ids.filter((other) => other !== id);
  const index = Math.max(0, Math.min(to, rest.length));
  return [...rest.slice(0, index), id, ...rest.slice(index)];
}

type RowAction = "rename" | "up" | "down" | "archive" | "delete";

function RowMenu({
  name,
  isFirst,
  isLast,
  onAction,
}: {
  name: string;
  isFirst: boolean;
  isLast: boolean;
  onAction: (action: RowAction) => void;
}) {
  const disabled: RowAction[] = [];
  if (isFirst) disabled.push("up");
  if (isLast) disabled.push("down");
  return (
    <MenuTrigger>
      <Button variant="quiet" square icon={DotsThreeIcon} aria-label={`Azioni per «${name}»`} />
      <Popover
        placement="bottom end"
        offset={4}
        className="min-w-52 rounded-sm border border-control bg-paper-raised p-1 shadow-popover outline-none"
      >
        <Menu
          aria-label={`Azioni per «${name}»`}
          disabledKeys={disabled}
          onAction={(key) => onAction(key as RowAction)}
          className="outline-none"
        >
          <MenuItem id="rename" className={MENU_ITEM}>
            <PencilSimpleIcon size={20} aria-hidden className="text-ink-3" />
            Rinomina
          </MenuItem>
          <MenuItem id="up" className={MENU_ITEM}>
            <ArrowUpIcon size={20} aria-hidden className="text-ink-3" />
            Sposta su
          </MenuItem>
          <MenuItem id="down" className={MENU_ITEM}>
            <ArrowDownIcon size={20} aria-hidden className="text-ink-3" />
            Sposta giù
          </MenuItem>
          <MenuItem id="archive" className={MENU_ITEM}>
            <ArchiveIcon size={20} aria-hidden className="text-ink-3" />
            Archivia
          </MenuItem>
          <MenuItem id="delete" className={cx(MENU_ITEM, "text-debito")}>
            <EraserIcon size={20} aria-hidden />
            Elimina
          </MenuItem>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}

/** Inline rename: Invio saves, Esc cancels; on touch the two buttons do the same. */
function RenameForm({ subject, onDone }: { subject: Subject; onDone: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const update = useUpdateSubject();
  const errors = useFormErrors({ fields: ["name"] as const }, formRef);
  const [name, setName] = useState(subject.name);

  useEffect(() => {
    const input = formRef.current?.querySelector("input");
    input?.focus();
    input?.select();
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // A pending button is only aria-disabled: Invio in the field would submit again.
    if (update.isPending) return;
    const trimmed = name.trim();
    if (trimmed === "") {
      errors.show({ name: EMPTY_NAME });
      return;
    }
    if (trimmed === subject.name) {
      onDone();
      return;
    }
    update.mutate(
      { id: subject.id, patch: { name: trimmed } },
      { onSuccess: onDone, onError: errors.fromProblem },
    );
  }

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onDone();
    }
  }

  return (
    // The form only listens for Esc bubbling up from its own field (cancel the rename).
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <form
      ref={formRef}
      noValidate
      onSubmit={submit}
      onKeyDown={onKeyDown}
      className="flex min-w-0 flex-1 flex-col gap-2 py-2 sm:flex-row sm:items-start"
    >
      <TextField
        label={`Nuovo nome di «${subject.name}»`}
        value={name}
        onChange={(value) => {
          setName(value);
          errors.clearField("name");
        }}
        maxLength={NAME_MAX}
        error={errors.fields.name ?? errors.form}
        className="min-w-0 flex-1"
      />
      <div className="flex gap-2 sm:pt-[1.625rem]">
        <Button type="submit" variant="line" isPending={update.isPending}>
          Salva
        </Button>
        <Button variant="quiet" onPress={onDone} isDisabled={update.isPending}>
          Annulla
        </Button>
      </div>
    </form>
  );
}

function AddSubjectForm({ onAdded }: { onAdded: (subject: Subject) => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const create = useCreateSubject();
  const errors = useFormErrors({ fields: ["name"] as const }, formRef);
  const [name, setName] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // A pending button is only aria-disabled: Invio in the field would add the subject twice.
    if (create.isPending) return;
    const trimmed = name.trim();
    if (trimmed === "") {
      errors.show({ name: EMPTY_NAME });
      return;
    }
    create.mutate(
      { name: trimmed },
      {
        onSuccess: (subject) => {
          setName("");
          errors.reset();
          onAdded(subject);
        },
        onError: errors.fromProblem,
      },
    );
  }

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={submit}
      // Field and button on one row at 390 too (03 §8: «‹ Nuova materia › [+ Aggiungi]»).
      className="mt-4 flex items-start gap-2"
    >
      <TextField
        label="Nuova materia"
        name="subject_name"
        value={name}
        onChange={(value) => {
          setName(value);
          errors.clearField("name");
        }}
        maxLength={NAME_MAX}
        error={errors.fields.name ?? errors.form}
        className="min-w-0 flex-1"
      />
      <div className="pt-[1.625rem]">
        <Button type="submit" variant="line" icon={PlusIcon} isPending={create.isPending}>
          Aggiungi
        </Button>
      </div>
    </form>
  );
}

interface DragState {
  id: string;
  startY: number;
  dy: number;
  /** Index the row would land on (among all rows). */
  target: number;
}

function SubjectsEditor({ subjects }: { subjects: readonly Subject[] }) {
  const hintId = useId();
  const active = subjects.filter((subject) => !subject.archived);
  const archived = subjects.filter((subject) => subject.archived);
  const ids = active.map((subject) => subject.id);

  const update = useUpdateSubject();
  const remove = useDeleteSubject();
  const reorder = useReorderSubjects();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Subject | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const editorRef = useRef<HTMLDivElement>(null);
  /** Row whose handle takes the focus at the next change of the list ("add": the new-name field). */
  const focusNext = useRef<string | null>(null);

  const focusTarget = (id: string) =>
    id === ADD_FIELD
      ? editorRef.current?.querySelector<HTMLInputElement>('input[name="subject_name"]')
      : handles.current.get(id);

  // A moved row is re-rendered elsewhere, a renamed one gets its handle back, an archived one
  // leaves: the focus goes to the same row or to its neighbour, never to <body>.
  const order = ids.join(",");
  useEffect(() => {
    const id = focusNext.current;
    if (!id) return;
    const target = focusTarget(id);
    if (!target) return;
    focusNext.current = null;
    target.focus();
  }, [order, renamingId]);

  /** The row after `id` (or before it, or the new-name field): where the focus goes when it leaves. */
  function neighbourOf(id: string): string {
    const index = ids.indexOf(id);
    return ids[index + 1] ?? ids[index - 1] ?? ADD_FIELD;
  }

  function moveTo(subject: Subject, to: number, { refocus = false } = {}) {
    const next = moveId(ids, subject.id, to);
    if (next.join(",") === order) return;
    if (refocus) focusNext.current = subject.id;
    setActionError(null);
    reorder.mutate(
      { subjects: active, orderedIds: next },
      { onError: (error) => setActionError(errorMessage(error)) },
    );
    setAnnouncement(
      `«${subject.name}» spostata in posizione ${String(next.indexOf(subject.id) + 1)} di ${String(next.length)}.`,
    );
  }

  function setArchived(subject: Subject, value: boolean) {
    setActionError(null);
    if (value) focusNext.current = neighbourOf(subject.id);
    update.mutate(
      { id: subject.id, patch: { archived: value } },
      {
        onSuccess: () =>
          setAnnouncement(
            value ? `«${subject.name}» archiviata.` : `«${subject.name}» ripristinata.`,
          ),
        onError: (error) => {
          focusNext.current = null;
          setActionError(errorMessage(error));
        },
      },
    );
  }

  function onAction(subject: Subject, index: number, action: RowAction) {
    switch (action) {
      case "rename":
        setRenamingId(subject.id);
        return;
      case "up":
        moveTo(subject, index - 1);
        return;
      case "down":
        moveTo(subject, index + 1);
        return;
      case "archive":
        setArchived(subject, true);
        return;
      case "delete":
        setDeleting(subject);
        return;
    }
  }

  function onHandleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    subject: Subject,
    index: number,
  ) {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    moveTo(subject, event.key === "ArrowUp" ? index - 1 : index + 1, { refocus: true });
  }

  // --- Drag with the handle (pointer events: mouse, pen and touch alike) ---------------------

  function onPointerDown(event: PointerEvent<HTMLButtonElement>, subject: Subject, index: number) {
    if (event.button !== 0) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // no pointer capture (old browsers, jsdom): the drag still works while over the handle
    }
    setDrag({ id: subject.id, startY: event.clientY, dy: 0, target: index });
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    let target = 0;
    for (const id of ids) {
      if (id === drag.id) continue;
      const rect = rows.current.get(id)?.getBoundingClientRect();
      if (rect && event.clientY > rect.top + rect.height / 2) target += 1;
    }
    setDrag({ ...drag, dy: event.clientY - drag.startY, target });
  }

  function onPointerUp(subject: Subject) {
    if (!drag) return;
    const target = drag.target;
    setDrag(null);
    moveTo(subject, target);
  }

  const others = drag ? ids.filter((id) => id !== drag.id) : [];
  const insertBefore = drag ? (others[drag.target] ?? null) : null;
  const insertAfterLast = drag !== null && insertBefore === null ? others.at(-1) : undefined;
  const dragMoved = drag !== null && drag.target !== ids.indexOf(drag.id);

  return (
    <div ref={editorRef}>
      <p id={hintId} className="sr-only">
        Per cambiare l&apos;ordine trascina la maniglia, oppure usa Alt e le frecce su e giù.
      </p>
      {active.length === 0 ? (
        <EmptyState tone="quiet" className="py-2">
          Nessuna materia attiva. Aggiungine una qui sotto.
        </EmptyState>
      ) : (
        <ol aria-label="Materie, nell'ordine del menu" className="m-0 list-none p-0">
          {active.map((subject, index) => {
            const dragging = drag?.id === subject.id;
            const lineBefore = dragMoved && insertBefore === subject.id;
            const lineAfter = dragMoved && insertAfterLast === subject.id;
            return (
              <li
                key={subject.id}
                ref={(element) => {
                  if (element) rows.current.set(subject.id, element);
                  else rows.current.delete(subject.id);
                }}
                style={dragging ? { transform: `translateY(${String(drag.dy)}px)` } : undefined}
                className={cx(
                  "relative flex min-h-row items-center gap-1 border-b border-rule bg-paper",
                  dragging && "z-10 border border-control bg-paper-raised shadow-popover",
                  lineBefore &&
                    "before:absolute before:inset-x-0 before:-top-px before:h-0.5 before:bg-ink before:content-['']",
                  lineAfter &&
                    "after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-ink after:content-['']",
                )}
              >
                {renamingId === subject.id ? (
                  <RenameForm
                    subject={subject}
                    onDone={() => {
                      focusNext.current = subject.id;
                      setRenamingId(null);
                    }}
                  />
                ) : (
                  <>
                    <button
                      type="button"
                      ref={(element) => {
                        if (element) handles.current.set(subject.id, element);
                        else handles.current.delete(subject.id);
                      }}
                      aria-label={`Riordina «${subject.name}», posizione ${String(index + 1)} di ${String(active.length)}`}
                      aria-describedby={hintId}
                      onKeyDown={(event) => onHandleKeyDown(event, subject, index)}
                      onPointerDown={(event) => onPointerDown(event, subject, index)}
                      onPointerMove={onPointerMove}
                      onPointerUp={() => onPointerUp(subject)}
                      onPointerCancel={() => setDrag(null)}
                      className="grid size-touch shrink-0 cursor-grab touch-none place-items-center text-ink-3 hover:text-ink active:cursor-grabbing"
                    >
                      <DotsSixVerticalIcon size={20} aria-hidden />
                    </button>
                    <span className="min-w-0 flex-1 truncate text-body text-ink">
                      {subject.name}
                    </span>
                    <RowMenu
                      name={subject.name}
                      isFirst={index === 0}
                      isLast={index === active.length - 1}
                      onAction={(action) => onAction(subject, index, action)}
                    />
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <FormNote className="mt-3">{actionError}</FormNote>

      <AddSubjectForm
        onAdded={(subject) => setAnnouncement(`«${subject.name}» aggiunta alle materie.`)}
      />

      {archived.length > 0 && (
        <Disclosure className="mt-6 border-t border-rule">
          <Heading level={3} className="m-0">
            <AriaButton
              slot="trigger"
              className="group flex min-h-touch w-full cursor-pointer items-center gap-2 text-left text-[0.9375rem] font-medium text-ink-2 data-hovered:text-ink"
            >
              <CaretRightIcon
                size={16}
                aria-hidden
                className="shrink-0 transition-transform group-aria-expanded:rotate-90"
              />
              Archiviate ({archived.length})
            </AriaButton>
          </Heading>
          <DisclosurePanel>
            <ul className="m-0 list-none p-0">
              {archived.map((subject) => (
                <li
                  key={subject.id}
                  className="flex min-h-row items-center gap-3 border-b border-rule pl-3"
                >
                  <span className="min-w-0 flex-1 truncate text-body text-ink-2">
                    {subject.name}
                  </span>
                  <Button
                    variant="line"
                    size="sm"
                    icon={ArchiveIcon}
                    aria-label={`Ripristina «${subject.name}»`}
                    onPress={() => setArchived(subject, false)}
                  >
                    Ripristina
                  </Button>
                </li>
              ))}
            </ul>
          </DisclosurePanel>
        </Disclosure>
      )}

      <div role="status" className="sr-only">
        {announcement}
      </div>

      <ConfirmDialog
        isOpen={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Eliminare «${deleting?.name ?? ""}»?`}
        effect="Le lezioni con questa materia restano, senza materia. Per toglierla solo dal menu, archiviala."
        confirmLabel="Elimina materia"
        onConfirm={async () => {
          if (!deleting) return;
          const name = deleting.name;
          const neighbour = neighbourOf(deleting.id);
          await remove.mutateAsync(deleting.id);
          setAnnouncement(`«${name}» eliminata.`);
          focusWhenLost(() => focusTarget(neighbour));
        }}
      />
    </div>
  );
}

export function SubjectsSection() {
  const subjects = useSubjects(true);
  return (
    <SettingsSection title="Materie">
      <p className="mt-0 mb-3 text-[0.875rem] leading-5 text-ink-3">
        L&apos;ordine è quello del menu Materia nei moduli.
      </p>
      <Loadable query={subjects} skeleton={<SkeletonRows rows={2} />}>
        {(items) => <SubjectsEditor subjects={items} />}
      </Loadable>
    </SettingsSection>
  );
}
