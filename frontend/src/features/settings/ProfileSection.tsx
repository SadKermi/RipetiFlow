// «Profilo» (03 §8, GET/PATCH /me): email read-only, name (signature of Matita's reminders),
// timezone (decides when a lesson ends and enters the balance), default lesson length and rate.
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  FormNote,
  INVALID_AMOUNT_MESSAGE,
  Loadable,
  MoneyField,
  SearchSelect,
  Select,
  SkeletonRows,
  TextField,
  cx,
} from "@/components";
import { initialsOf } from "@/components/utils";
import type { Profile } from "@/lib/api/types";
import { parseEuroInput } from "@/lib/format";
import { useFormErrors } from "@/lib/forms";
import { useProfile, useUpdateProfile } from "@/lib/queries";
import {
  LESSON_LENGTHS,
  SAVED_MS,
  PROFILE_FIELDS,
  type ProfileValues,
  profilePatch,
  profileValues,
} from "./profile";
import { SettingsSection } from "./SettingsSection";
import { timezoneOptions } from "./timezones";

function ProfileForm({ profile }: { profile: Profile }) {
  const formRef = useRef<HTMLFormElement>(null);
  const update = useUpdateProfile();
  const errors = useFormErrors({ fields: PROFILE_FIELDS }, formRef);
  const [draft, setDraft] = useState<Partial<ProfileValues>>({});
  const [zoneQuery, setZoneQuery] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const values: ProfileValues = { ...profileValues(profile), ...draft };
  const patch = profilePatch(profile, values);
  const dirty = Object.keys(patch).length > 0;
  const zones = useMemo(() => timezoneOptions(profile.timezone), [profile.timezone]);

  useEffect(() => {
    if (savedAt === null) return;
    const timer = window.setTimeout(() => setSavedAt(null), SAVED_MS);
    return () => window.clearTimeout(timer);
  }, [savedAt]);

  function change<K extends keyof ProfileValues>(field: K, value: ProfileValues[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
    setSavedAt(null);
    errors.clearField(field);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || update.isPending) return;
    // MoneyField reports unreadable text as null, like an empty field: check the text itself.
    const rateInput = formRef.current?.elements.namedItem("default_hourly_rate_cents");
    const rateText = rateInput instanceof HTMLInputElement ? rateInput.value.trim() : "";
    if (rateText !== "" && parseEuroInput(rateText) === null) {
      errors.show({ default_hourly_rate_cents: INVALID_AMOUNT_MESSAGE });
      return;
    }
    update.mutate(patch, {
      onSuccess: () => {
        setDraft({});
        errors.reset();
        setSavedAt(Date.now());
      },
      onError: errors.fromProblem,
    });
  }

  return (
    <form ref={formRef} noValidate onSubmit={submit} className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-full border border-rule-strong bg-paper-sunk text-[0.875rem] font-semibold text-ink-2"
        >
          {initialsOf(profile.full_name, profile.email)}
        </span>
        <p className="m-0 min-w-0 text-body text-ink">
          <span className="sr-only">Email: </span>
          <span className="break-all">{profile.email}</span>
        </p>
      </div>

      <TextField
        label="Nome e cognome"
        name="full_name"
        autoComplete="name"
        maxLength={120}
        value={values.full_name}
        onChange={(value) => change("full_name", value)}
        error={errors.fields.full_name}
        hint="È la firma dei promemoria che prepara Matita."
      />

      <SearchSelect
        label="Fuso orario"
        options={zones}
        value={values.timezone}
        onChange={(zone) => {
          if (zone) change("timezone", zone);
        }}
        query={zoneQuery}
        onQueryChange={setZoneQuery}
        searchLabel="Cerca un fuso orario"
        emptyText={(query) => `Nessun fuso orario con «${query}».`}
        error={errors.fields.timezone}
        hint="Decide quando una lezione è finita ed entra nel saldo."
      />

      <div className="grid gap-6 sm:grid-cols-2">
        <Select
          label="Durata predefinita"
          options={LESSON_LENGTHS}
          value={String(values.default_lesson_minutes)}
          onChange={(minutes) => {
            if (minutes) change("default_lesson_minutes", Number(minutes));
          }}
          error={errors.fields.default_lesson_minutes}
          hint="La durata proposta per una nuova lezione."
        />
        <MoneyField
          label="Tariffa predefinita"
          name="default_hourly_rate_cents"
          unit="€/h"
          optional
          value={values.default_hourly_rate_cents}
          onChange={(cents) => change("default_hourly_rate_cents", cents)}
          error={errors.fields.default_hourly_rate_cents}
          hint="Proposta per i nuovi studenti."
        />
      </div>

      <FormNote>{errors.form}</FormNote>

      <div
        className={cx("flex items-center gap-3", (dirty || savedAt !== null) && "min-h-control")}
      >
        {dirty && (
          <Button type="submit" variant="ink" isPending={update.isPending}>
            Salva profilo
          </Button>
        )}
        <span role="status" className="text-[0.875rem] text-ink-3">
          {savedAt !== null && !dirty ? "Salvato" : ""}
        </span>
      </div>
    </form>
  );
}

export function ProfileSection() {
  const profile = useProfile();
  return (
    <SettingsSection title="Profilo">
      <Loadable query={profile} skeleton={<SkeletonRows rows={2} />}>
        {(data) => <ProfileForm profile={data} />}
      </Loadable>
    </SettingsSection>
  );
}
