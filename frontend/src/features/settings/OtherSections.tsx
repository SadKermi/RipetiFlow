// The small sections of Impostazioni (03 §8): Aspetto, Esporta, Modalità demo, Esci.
import {
  DownloadSimpleIcon,
  MoonIcon,
  SignOutIcon,
  SunIcon,
  UserCircleDashedIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useAuth, useSeedDemo } from "@/app/auth";
import { Button, ConfirmDialog, Note, SegmentedControl, type SegmentOption } from "@/components";
import { downloadFullLedgerCsv } from "@/lib/api/download";
import { errorMessage } from "@/lib/api/problem";
import { SettingsSection } from "./SettingsSection";
import { type ThemeChoice, applyThemeChoice, readThemeChoice } from "./theme";

const THEMES: readonly SegmentOption<ThemeChoice>[] = [
  { value: "system", label: "Sistema" },
  { value: "light", label: "Chiaro", icon: SunIcon },
  { value: "dark", label: "Scuro", icon: MoonIcon },
];

/** Sistema / Chiaro / Scuro, saved in this browser (02 §4). */
export function AppearanceSection() {
  const [theme, setTheme] = useState<ThemeChoice>(readThemeChoice);
  return (
    <SettingsSection title="Aspetto">
      <SegmentedControl
        aria-label="Tema"
        options={THEMES}
        value={theme}
        onChange={(choice) => {
          setTheme(choice);
          applyThemeChoice(choice);
        }}
      />
      <p className="mt-2 mb-0 text-[0.875rem] leading-5 text-ink-3">
        «Sistema» segue l&apos;impostazione del telefono o del computer. La scelta vale per questo
        browser.
      </p>
    </SettingsSection>
  );
}

/** «Scarica tutto il registro (CSV)»: GET /export/ledger.csv (D-24). */
export function ExportSection() {
  const download = useMutation({ mutationFn: downloadFullLedgerCsv });
  return (
    <SettingsSection title="Esporta">
      <Button
        icon={DownloadSimpleIcon}
        onPress={() => download.mutate()}
        isPending={download.isPending}
      >
        Scarica tutto il registro (CSV)
      </Button>
      <p className="mt-2 mb-0 text-[0.875rem] leading-5 text-ink-3">
        Tutti gli studenti, con lezioni, pagamenti e saldo riga per riga. Si apre con Excel o Fogli
        Google.
      </p>
      {download.isError && (
        <Note role="alert" tone="danger" icon={WarningIcon} className="mt-3">
          {errorMessage(download.error)}
        </Note>
      )}
    </SettingsSection>
  );
}

/** Only with `dev_auth_enabled` and the demo tutor: POST /dev/seed (D-30). */
export function DemoSection() {
  const seed = useSeedDemo();
  const [confirming, setConfirming] = useState(false);
  return (
    <SettingsSection title="Modalità demo">
      <Button icon={UserCircleDashedIcon} onPress={() => setConfirming(true)}>
        Ricrea i dati di esempio
      </Button>
      {seed.isSuccess && (
        <p role="status" className="mt-3 mb-0 text-[0.9375rem] text-ink-2">
          Dati demo ricreati: {seed.data.students} studenti, {seed.data.lessons} lezioni,{" "}
          {seed.data.payments} pagamenti.
        </p>
      )}
      <ConfirmDialog
        isOpen={confirming}
        onOpenChange={setConfirming}
        title="Ricreare i dati di esempio?"
        effect="Cancella e ricrea studenti, lezioni e pagamenti di esempio."
        confirmLabel="Ricrea i dati"
        onConfirm={() => seed.mutateAsync()}
      />
    </SettingsSection>
  );
}

/** «Esci»: closes the session and goes back to the landing (03 §8). */
export function SignOutSection() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);
  return (
    <div className="border-t-2 border-ink pt-6">
      <Button
        icon={SignOutIcon}
        isPending={leaving}
        onPress={() => {
          setLeaving(true);
          // Leave the protected pages first: signing out on them would redirect to /accedi.
          void Promise.resolve(navigate("/", { replace: true })).then(() => signOut());
        }}
      >
        Esci
      </Button>
    </div>
  );
}
