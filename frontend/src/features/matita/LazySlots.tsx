// Matita's slot components, loaded on demand: the shell (and the landing page that shares its
// entry chunk) does not carry Matita, the forms it opens or React Aria's dialogs until a signed-in
// page renders a slot. Each slot has its own Suspense boundary that shows nothing meanwhile.
import { lazy, Suspense } from "react";
import type { LedgerLineProps } from "@/components/shell/matita-slot";

const hosts = () => import("./hosts");
const LazyMobileBar = lazy(() => hosts().then((m) => ({ default: m.MobileBar })));
const LazyTopBarButton = lazy(() => hosts().then((m) => ({ default: m.TopBarButton })));
const LazyTodayLine = lazy(() => hosts().then((m) => ({ default: m.TodayLine })));
const LazyLedgerLine = lazy(() => hosts().then((m) => ({ default: m.LedgerLine })));

export function MobileBarSlot() {
  return (
    <Suspense fallback={null}>
      <LazyMobileBar />
    </Suspense>
  );
}

export function TopBarButtonSlot() {
  return (
    <Suspense fallback={null}>
      <LazyTopBarButton />
    </Suspense>
  );
}

export function TodayLineSlot() {
  return (
    <Suspense fallback={null}>
      <LazyTodayLine />
    </Suspense>
  );
}

export function LedgerLineSlot(props: LedgerLineProps) {
  return (
    <Suspense fallback={null}>
      <LazyLedgerLine {...props} />
    </Suspense>
  );
}
