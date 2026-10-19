// UI kit of the design system «Registro» (docs/design/02-design-system.md §9). Import from
// "@/components"; tokens and utilities (pencil-draft, marker, field-error…) are in styles/tokens.css.
export { AgendaItem, DayHeading, type AgendaItemProps } from "./AgendaItem";
export { BalanceBadge, BalanceInline, DraftBadge, type BalanceProps } from "./BalanceBadge";
export {
  Button,
  Dots,
  InlineButton,
  InlineLink,
  LinkButton,
  type ButtonProps,
  type LinkButtonProps,
} from "./Button";
export { buttonClasses, type ButtonSize, type ButtonVariant } from "./button-styles";
export { DayField, TimeRangeField, type DayFieldProps, type TimeRangeFieldProps } from "./DateTime";
export {
  ConfirmDialog,
  Sheet,
  SheetActions,
  type ConfirmDialogProps,
  type SheetApi,
  type SheetProps,
  type SheetSize,
} from "./Dialog";
export { BlankPage, EmptyState, type EmptyStateProps } from "./EmptyState";
export {
  FieldErrorMessage,
  FieldLabel,
  FormNote,
  INVALID_AMOUNT_MESSAGE,
  MoneyField,
  NumberField,
  TextAreaField,
  TextField,
  type MoneyFieldProps,
  type NumberFieldProps,
  type TextAreaFieldProps,
  type TextFieldProps,
} from "./Field";
export { INK_ICON, MATITA_ICON, PAYMENT_METHOD_ICON, PAYMENT_METHOD_LABEL } from "./icon-map";
export { ApproxDuration, ShortcutKbd } from "./icons";
export {
  Ledger,
  LedgerCarryRow,
  LedgerDraftRow,
  LedgerEntryRow,
  LedgerRateRow,
  LedgerSlotRow,
  RunningBalance,
  type LedgerDraftRowProps,
  type LedgerEntryRowProps,
  type LedgerProps,
} from "./Ledger";
export { type LedgerLayout, useLedgerLayout } from "./ledger-context";
export { Loadable, type LoadableInfo, type LoadableProps } from "./Loadable";
export {
  SegmentedControl,
  type SegmentOption,
  type SegmentedControlProps,
} from "./SegmentedControl";
export { SearchSelect, Select, type SearchSelectProps, type SelectOption } from "./Select";
export {
  LoadErrorBand,
  Note,
  PageMessage,
  SessionExpiredNote,
  SkeletonRows,
  type LoadErrorBandProps,
  type NoteProps,
  type PageMessageProps,
  type SkeletonRowsProps,
} from "./States";
export { StudentListItem, type StudentListItemProps } from "./StudentListItem";
export { ToastProvider } from "./Toast";
export { type ToastAction, type ToastApi, type ToastOptions, useToast } from "./toast-context";
export { MatitaSlotContext, type MatitaSlots, useMatitaSlots } from "./shell/matita-slot";
export { Wordmark } from "./shell/Wordmark";
export {
  balanceSpeech,
  balanceStatus,
  cx,
  formatAmountColumn,
  formatDayFieldValue,
  formatMinutesColumn,
  formatShortDate,
  lessonTiming,
  loadErrorText,
  speakEuro,
  studentMeta,
  useDelayedFlag,
  useIsMobile,
  useMediaQuery,
  useNow,
  type BalanceStatus,
} from "./utils";
