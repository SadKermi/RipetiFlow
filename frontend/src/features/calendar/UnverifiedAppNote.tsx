import { InfoIcon } from "@phosphor-icons/react";
import { cx } from "@/components";
import { UNVERIFIED_APP_NOTE } from "./messages";

/**
 * Graphite note under the Google buttons (03 §2, §8): while Google has not verified the app, the
 * consent screen may warn «app non verificata».
 */
export function UnverifiedAppNote({ className }: { className?: string }) {
  return (
    <p
      className={cx("m-0 flex items-start gap-2 text-[0.875rem] leading-5 text-pencil", className)}
    >
      <InfoIcon size={16} aria-hidden className="mt-0.5 shrink-0" />
      <span>{UNVERIFIED_APP_NOTE}</span>
    </p>
  );
}
