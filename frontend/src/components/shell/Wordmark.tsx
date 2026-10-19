import { Link } from "react-router";
import { cx } from "../utils";

/**
 * «▮R RipetiFlow»: the ink square with the red margin line and the Literata wordmark
 * (specimen.html). A link to `to` (home of the area: /oggi inside the app, / outside).
 */
export function Wordmark({
  to = "/oggi",
  size = "md",
  className,
}: {
  to?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cx(
        "inline-flex min-h-11 items-center gap-2.5 font-display font-medium tracking-[-0.01em] text-ink no-underline",
        size === "md" ? "text-[1.375rem]" : "text-[1.1875rem]",
        className,
      )}
    >
      <span
        aria-hidden
        className={cx(
          "relative grid place-items-center rounded-xs bg-ink font-display font-medium text-on-ink italic",
          "after:absolute after:inset-y-0 after:left-[7px] after:w-px after:bg-margin after:content-['']",
          size === "md" ? "size-7 text-[1.0625rem]" : "size-6 text-[0.9375rem]",
        )}
      >
        R
      </span>
      <span>
        Ripeti<i className="font-normal">Flow</i>
      </span>
    </Link>
  );
}
