// Menus for «Materia» and «Studente» (docs/design/02-design-system.md §9.4). Values are ids
// (strings); `null` is a valid «no choice» («Nessuna materia»).
import {
  CaretDownIcon,
  CheckIcon,
  type Icon,
  MagnifyingGlassIcon,
  PlusIcon,
  XIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import {
  Autocomplete,
  Button as AriaButton,
  Dialog,
  Heading,
  Input,
  type Key,
  ListBox,
  ListBoxItem,
  Modal,
  ModalOverlay,
  Popover,
  SearchField,
  Select as AriaSelect,
  SelectValue,
  Text,
  useFilter,
} from "react-aria-components";
import { FieldErrorMessage, FieldLabel } from "./Field";
import { CONTROL_BOX, HINT } from "./field-styles";
import { cx, useIsMobile } from "./utils";

export interface SelectOption {
  id: string;
  label: string;
  /** Second line in the list (e.g. the student's class). */
  detail?: string;
}

const NONE_KEY = "__rf_none__";
const CREATE_KEY = "__rf_create__";

const POPOVER =
  "min-w-(--trigger-width) overflow-auto rounded-sm border border-control bg-paper-raised shadow-popover outline-none";

const OPTION =
  "flex min-h-11 cursor-pointer items-center gap-2 rounded-xs px-3 py-2 text-body text-ink outline-none data-focused:bg-paper-sunk data-hovered:bg-paper-sunk data-disabled:opacity-40";

function OptionContent({
  label,
  detail,
  isSelected,
}: {
  label: string;
  detail?: string;
  isSelected: boolean;
}) {
  return (
    <>
      <span className="flex min-w-0 flex-1 flex-col">
        <Text slot="label" className={cx("truncate", isSelected && "font-semibold")}>
          {label}
        </Text>
        {detail && (
          <Text slot="description" className="truncate text-[0.875rem] leading-5 text-ink-3">
            {detail}
          </Text>
        )}
      </span>
      {isSelected && <CheckIcon size={16} aria-hidden className="shrink-0" />}
    </>
  );
}

function CreateOption({ label }: { label: string }) {
  return (
    <ListBoxItem id={CREATE_KEY} textValue={label} className={cx(OPTION, "text-pencil")}>
      <PlusIcon size={16} aria-hidden className="shrink-0" />
      <span>{label}</span>
    </ListBoxItem>
  );
}

interface CommonSelectProps {
  label: string;
  options: readonly SelectOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  /** Shown when nothing is chosen. */
  placeholder?: string;
  /** Explicit empty choice at the top («Nessuna materia»): selecting it gives `null`. */
  emptyOption?: string;
  /** Last option in graphite («Nuova materia», «Nuovo studente»). */
  createLabel?: string;
  onCreate?: (query: string) => void;
  /** Icon at the start of the field (Student for «Studente»). */
  icon?: Icon;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  required?: boolean;
  isDisabled?: boolean;
  className?: string;
}

function toKey(value: string | null, emptyOption?: string): Key | null {
  if (value !== null) return value;
  return emptyOption ? NONE_KEY : null;
}

function Trigger({ icon: IconComponent, error }: { icon?: Icon; error?: string | null }) {
  return (
    <AriaButton className={CONTROL_BOX} data-rf-invalid={error ? "true" : undefined}>
      {IconComponent && <IconComponent size={18} aria-hidden className="shrink-0 text-ink-3" />}
      <SelectValue className="min-w-0 flex-1 truncate data-placeholder:text-ink-3" />
      <CaretDownIcon size={16} aria-hidden className="shrink-0 text-ink-3" />
    </AriaButton>
  );
}

function useChangeHandler(
  onChange: (id: string | null) => void,
  onCreate: ((query: string) => void) | undefined,
  query = "",
) {
  return (key: Key | null) => {
    if (key === CREATE_KEY) {
      onCreate?.(query);
      return;
    }
    onChange(key === null || key === NONE_KEY ? null : String(key));
  };
}

/** Short menu without search (Materia: the tutor's active subjects, in their order). */
export function Select({
  label,
  options,
  value,
  onChange,
  placeholder = "Scegli…",
  emptyOption,
  createLabel,
  onCreate,
  icon,
  hint,
  error,
  optional,
  required,
  isDisabled,
  className,
}: CommonSelectProps) {
  const handleChange = useChangeHandler(onChange, onCreate);
  return (
    <AriaSelect
      value={toKey(value, emptyOption)}
      onChange={handleChange}
      placeholder={placeholder}
      isDisabled={isDisabled}
      isRequired={required}
      isInvalid={Boolean(error)}
      validationBehavior="aria"
      className={cx("block", className)}
    >
      <FieldLabel label={label} optional={optional} required={required} />
      <Trigger icon={icon} error={error} />
      <FieldErrorMessage>{error}</FieldErrorMessage>
      {hint && (
        <Text slot="description" className={HINT}>
          {hint}
        </Text>
      )}
      <Popover offset={6} className={cx(POPOVER, "max-h-80 p-1")}>
        <ListBox className="outline-none">
          {emptyOption && (
            <ListBoxItem id={NONE_KEY} textValue={emptyOption} className={OPTION}>
              {({ isSelected }) => (
                <OptionContent label={emptyOption} isSelected={isSelected} />
              )}
            </ListBoxItem>
          )}
          {options.map((option) => (
            <ListBoxItem key={option.id} id={option.id} textValue={option.label} className={OPTION}>
              {({ isSelected }) => (
                <OptionContent label={option.label} detail={option.detail} isSelected={isSelected} />
              )}
            </ListBoxItem>
          ))}
          {createLabel && <CreateOption label={createLabel} />}
        </ListBox>
      </Popover>
    </AriaSelect>
  );
}

export interface SearchSelectProps extends CommonSelectProps {
  /** Text typed in the search box (controlled, so «Nuovo studente» can receive it). */
  query: string;
  onQueryChange: (query: string) => void;
  /** Label of the search box. */
  searchLabel?: string;
  /** Shown when nothing matches the search. */
  emptyText?: (query: string) => string;
}

/**
 * Menu with search (Studente): typing filters the list and Enter takes the first match. On desktop
 * a popover under the field; on mobile a full-height sheet with the search on top and 56 px rows.
 */
export function SearchSelect({
  label,
  options,
  value,
  onChange,
  placeholder = "Scegli…",
  emptyOption,
  createLabel,
  onCreate,
  icon,
  hint,
  error,
  optional,
  required,
  isDisabled,
  className,
  query,
  onQueryChange,
  searchLabel = "Cerca per nome",
  emptyText = (q) => `Nessun risultato per «${q}».`,
}: SearchSelectProps) {
  const mobile = useIsMobile();
  const { contains } = useFilter({ sensitivity: "base" });
  const handleChange = useChangeHandler(onChange, onCreate, query);

  const list = (
    <Autocomplete
      inputValue={query}
      onInputChange={onQueryChange}
      filter={(text, input, node) =>
        node.key === CREATE_KEY || node.key === NONE_KEY || contains(text, input)
      }
    >
      <SearchField
        aria-label={searchLabel}
        autoFocus
        className="group relative m-1 flex items-center"
      >
        <MagnifyingGlassIcon
          size={18}
          aria-hidden
          className="pointer-events-none absolute left-3 text-ink-3"
        />
        <Input
          placeholder={searchLabel}
          className="h-control w-full rounded-xs border border-control bg-paper-raised pr-10 pl-10 text-body text-ink placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
        />
        <AriaButton
          aria-label="Cancella la ricerca"
          className="absolute right-0 grid size-touch cursor-pointer place-items-center text-ink-3 group-data-empty:hidden"
        >
          <XIcon size={16} aria-hidden />
        </AriaButton>
      </SearchField>
      <ListBox
        className={cx("min-h-0 flex-1 overflow-auto p-1 outline-none", !mobile && "max-h-72")}
        renderEmptyState={() => (
          <p className="px-3 py-3 text-[0.875rem] text-ink-3">{emptyText(query)}</p>
        )}
      >
        {emptyOption && (
          <ListBoxItem id={NONE_KEY} textValue={emptyOption} className={OPTION}>
            {({ isSelected }) => <OptionContent label={emptyOption} isSelected={isSelected} />}
          </ListBoxItem>
        )}
        {options.map((option) => (
          <ListBoxItem
            key={option.id}
            id={option.id}
            textValue={option.label}
            className={cx(OPTION, mobile && "min-h-row")}
          >
            {({ isSelected }) => (
              <OptionContent label={option.label} detail={option.detail} isSelected={isSelected} />
            )}
          </ListBoxItem>
        ))}
        {createLabel && <CreateOption label={createLabel} />}
      </ListBox>
    </Autocomplete>
  );

  return (
    <AriaSelect
      value={toKey(value, emptyOption)}
      onChange={handleChange}
      onOpenChange={(open) => {
        if (!open) onQueryChange("");
      }}
      placeholder={placeholder}
      isDisabled={isDisabled}
      isRequired={required}
      isInvalid={Boolean(error)}
      validationBehavior="aria"
      className={cx("block", className)}
    >
      <FieldLabel label={label} optional={optional} required={required} />
      <Trigger icon={icon} error={error} />
      <FieldErrorMessage>{error}</FieldErrorMessage>
      {hint && (
        <Text slot="description" className={HINT}>
          {hint}
        </Text>
      )}
      {mobile ? (
        <ModalOverlay isDismissable className="fixed inset-0 z-(--rf-z-overlay) bg-scrim">
          <Modal className="fixed inset-x-0 top-[4dvh] bottom-0 flex flex-col rounded-t-sheet bg-paper-raised pb-[env(safe-area-inset-bottom)] shadow-sheet outline-none">
            <Dialog aria-label={label} className="flex min-h-0 flex-1 flex-col outline-none">
              {({ close }) => (
                <>
                  <div className="flex items-center justify-between gap-2 px-4 pt-3">
                    <Heading slot="title" className="font-display text-display-s font-normal">
                      {label}
                    </Heading>
                    <AriaButton
                      aria-label="Chiudi"
                      onPress={close}
                      className="grid size-touch cursor-pointer place-items-center text-ink-2"
                    >
                      <XIcon size={20} aria-hidden />
                    </AriaButton>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">{list}</div>
                </>
              )}
            </Dialog>
          </Modal>
        </ModalOverlay>
      ) : (
        <Popover offset={6} className={cx(POPOVER, "flex max-h-96 flex-col p-1")}>
          {list}
        </Popover>
      )}
    </AriaSelect>
  );
}
