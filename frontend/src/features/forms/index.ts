// The forms of docs/design/03-schermate.md §7: lesson, payment, rate change, student and the
// confirmations. Lesson and payment forms take `initial` + `source` so a Matita draft can open them
// prefilled («Modifica» on a draft) and confirm with X-RipetiFlow-Source: assistant.
export { ActionMenu, type ActionMenuItem } from "./ActionMenu";
export { ChoiceGroup, type Choice } from "./ChoiceGroup";
export { type TutorClock, useTutorClock } from "./clock";
export {
  ArchiveStudentDialog,
  DeleteLessonDialog,
  DeletePaymentDialog,
  DeleteStudentDialog,
} from "./confirmations";
export { DuplicateToStudentDialog } from "./DuplicateToStudentDialog";
export {
  type LessonToDelete,
  type PaymentToDelete,
  archiveEffect,
  lessonDeleteEffect,
  paymentDeleteEffect,
} from "./effects";
export { LessonFormDialog, type LessonFormDialogProps } from "./LessonFormDialog";
export type { LessonInitial } from "./lesson-model";
export { lessonSavedMessage, paymentSavedMessage, rateSavedMessage } from "./messages";
export {
  balanceWords,
  dayMonth,
  formatRate,
  lessonAmountCents,
  lessonsCount,
  previousRate,
  rateOn,
} from "./money-words";
export { PaymentFormDialog, type PaymentFormDialogProps } from "./PaymentFormDialog";
export type { PaymentInitial } from "./payment-model";
export { DeleteRateDialog, RateChangeDialog } from "./RateDialogs";
export { StudentFormDialog, type StudentFormDialogProps } from "./StudentFormDialog";
export { deleteLessonNow, deletePaymentNow, setStudentArchivedNow } from "./undo";
export { useUndoToast } from "./useUndoToast";
