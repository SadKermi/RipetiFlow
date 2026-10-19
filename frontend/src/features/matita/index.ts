// Matita, the assistant (docs/06-assistente-matita.md, 02 §9.13, 03 §9). The app fills the shell's
// slots with MATITA_SLOTS (src/app/router.tsx); everything else in this folder loads lazily.
import type { MatitaSlots } from "@/components/shell/matita-slot";
import { LedgerLineSlot, MobileBarSlot, TodayLineSlot, TopBarButtonSlot } from "./LazySlots";

export const MATITA_SLOTS: MatitaSlots = {
  MobileBar: MobileBarSlot,
  TopBarButton: TopBarButtonSlot,
  TodayLine: TodayLineSlot,
  LedgerLine: LedgerLineSlot,
};
