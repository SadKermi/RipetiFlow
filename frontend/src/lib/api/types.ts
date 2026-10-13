// Friendly names for the generated schemas. Aliases only: the shapes come from schema.d.ts
// (regenerated with `npm run gen:api`), never written by hand.
import type { components } from "./schema";

type Schemas = components["schemas"];

export type PublicConfig = Schemas["PublicConfig"];
export type Profile = Schemas["Profile"];
export type ProfilePatch = Schemas["ProfilePatch"];
export type Subject = Schemas["Subject"];
export type SubjectCreate = Schemas["SubjectCreate"];
export type SubjectPatch = Schemas["SubjectPatch"];
export type Balance = Schemas["Balance"];
export type StudentSummary = Schemas["StudentSummary"];
export type Student = Schemas["Student"];
export type StudentCreate = Schemas["StudentCreate"];
export type StudentPatch = Schemas["StudentPatch"];
export type Rate = Schemas["Rate"];
export type RateInput = Schemas["RateInput"];
export type RateCreate = Schemas["RateCreate"];
export type RateCreated = Schemas["RateCreated"];
export type RatePreview = Schemas["RatePreview"];
export type Ledger = Schemas["Ledger"];
export type LedgerEntry = Schemas["LedgerEntry"];
export type Activity = Schemas["Activity"];
export type ActivityPage = Schemas["ActivityPage"];
export type Lesson = Schemas["Lesson"];
export type LessonCreate = Schemas["LessonCreate"];
export type LessonPatch = Schemas["LessonPatch"];
export type LessonDuplicate = Schemas["LessonDuplicate"];
export type Payment = Schemas["Payment"];
export type PaymentCreate = Schemas["PaymentCreate"];
export type PaymentPatch = Schemas["PaymentPatch"];
export type PaymentMethod = Payment["method"];
export type Dashboard = Schemas["Dashboard"];
export type CalendarStatus = Schemas["CalendarStatus"];
export type CalendarConnect = Schemas["CalendarConnect"];
export type CalendarResync = Schemas["CalendarResync"];
export type CalendarQueued = Schemas["CalendarQueued"];
export type AssistantRequest = Schemas["AssistantRequest"];
export type AssistantReply = Schemas["AssistantReply"];
export type AssistantDraft = AssistantReply["drafts"][number];
export type LessonDraft = Schemas["LessonDraft"];
export type PaymentDraft = Schemas["PaymentDraft"];
export type MessageDraft = Schemas["MessageDraft"];
export type ChatTurn = Schemas["ChatTurn"];
