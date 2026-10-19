// The four places Matita mounts (src/components/shell/matita-slot.ts), in one module so the
// shell loads them as a single chunk, after its first paint (see LazySlots.tsx).
export { LedgerLine } from "./LedgerLine";
export { MobileBar } from "./MobileBar";
export { TodayLine } from "./TodayLine";
export { TopBarButton } from "./TopBarButton";
