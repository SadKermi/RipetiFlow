import { type ReactNode, type Ref, useId } from "react";
import { cx } from "@/components";

/**
 * One section of Impostazioni (03 §8): 2 px ink rule on top (02 §5 «Filetto sopra una sezione»),
 * the title as a small capital label 12 px under it. Each section loads and fails on its own.
 */
export function SettingsSection({
  title,
  id,
  headingRef,
  children,
  className,
}: {
  title: string;
  /** Anchor for links from other pages («Impostazioni ›» → #google-calendar). */
  id?: string;
  /** The heading takes the focus when the section's content is replaced (e.g. after «Scollega»). */
  headingRef?: Ref<HTMLHeadingElement>;
  children: ReactNode;
  className?: string;
}) {
  const headingId = useId();
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cx("scroll-mt-6 border-t-2 border-ink pt-3", className)}
    >
      <h2
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className="m-0 text-caption text-ink-2 uppercase focus:outline-none focus-visible:shadow-none"
      >
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
