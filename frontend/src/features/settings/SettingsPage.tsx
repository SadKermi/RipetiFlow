// Impostazioni («Altro» on mobile, 03 §8): one column (640 px on desktop) of independent sections;
// each one loads with its own skeleton rows and shows its own error band without blocking the rest.
// There is no «Elimina account»: the API does not offer it (03 §8).
import { useEffect } from "react";
import { useLocation } from "react-router";
import { useAuth } from "@/app/auth";
import { CalendarSection } from "@/features/calendar/CalendarSection";
import { AppearanceSection, DemoSection, ExportSection, SignOutSection } from "./OtherSections";
import { ProfileSection } from "./ProfileSection";
import { SubjectsSection } from "./SubjectsSection";

export function SettingsPage() {
  const { config, user } = useAuth();
  const { hash } = useLocation();
  const showDemo = config?.dev_auth_enabled === true && user?.mode === "demo";

  // Links such as «Impostazioni ›» from Oggi point at a section (#google-calendar).
  useEffect(() => {
    if (!hash) return;
    const target = document.getElementById(decodeURIComponent(hash.slice(1)));
    target?.scrollIntoView?.({ block: "start" });
  }, [hash]);

  return (
    <div className="max-w-[40rem]">
      <h1 className="m-0 mb-6 font-display text-display-l font-normal text-ink lg:mb-8">
        Impostazioni
      </h1>
      <div className="flex flex-col gap-10">
        <ProfileSection />
        <SubjectsSection />
        <CalendarSection />
        <AppearanceSection />
        <ExportSection />
        {showDemo && <DemoSection />}
        <SignOutSection />
      </div>
    </div>
  );
}
