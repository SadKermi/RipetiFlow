// Glyphs the three fonts do not have (02 §3 «Glifi assenti», fonts.md): «≈» and «⌘» are icons.
import { ApproximateEqualsIcon, CommandIcon } from "@phosphor-icons/react";
import { formatCreditMinutesText, formatMinutes } from "@/lib/format";
import { cx } from "./utils";

/**
 * Compact «≈ 1 h 49 min»: the ApproximateEquals icon (14 px) + the duration, read as «circa 1 h
 * 49 min». Use the word «circa» in sentences instead (formatCreditMinutesText).
 */
export function ApproxDuration({ minutes, className }: { minutes: number; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-0.5 whitespace-nowrap", className)}>
      <span className="sr-only">{formatCreditMinutesText(minutes)}</span>
      <ApproximateEqualsIcon size={14} aria-hidden className="shrink-0" />
      <span aria-hidden>{formatMinutes(Math.abs(minutes))}</span>
    </span>
  );
}

function isApplePlatform(): boolean {
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform;
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/**
 * Keyboard shortcut chip: Command icon + «K» on Apple, «Ctrl K» elsewhere (02 §9.13). Desktop only:
 * hidden below 768 px, where there is no keyboard to speak of.
 */
export function ShortcutKbd({ keyName = "K", className }: { keyName?: string; className?: string }) {
  const apple = isApplePlatform();
  const spoken = `Scorciatoia: ${apple ? "Comando" : "Ctrl"} ${keyName}`;
  return (
    <kbd
      className={cx(
        "hidden items-center gap-0.5 rounded-xs border border-rule-strong px-1.5 py-[3px] font-money text-[0.75rem] leading-none whitespace-nowrap text-ink-3 md:inline-flex",
        className,
      )}
    >
      <span className="sr-only">{spoken}</span>
      {apple ? <CommandIcon size={12} aria-hidden /> : <span aria-hidden>Ctrl </span>}
      <span aria-hidden>{keyName}</span>
    </kbd>
  );
}
