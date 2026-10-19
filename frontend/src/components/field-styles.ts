// Class recipes of the form fields (docs/design/02-design-system.md §9.2), shared by text, money,
// date and select fields so they all look and behave the same.

/** Label above the field: Schibsted 500 14 px ink-2, 6 px from the field. Never a placeholder. */
export const LABEL = "mb-1.5 block text-[0.875rem] leading-5 font-medium text-ink-2";

/** «(facoltativo)» after a label. */
export const LABEL_OPTIONAL = "font-normal text-ink-3";

/**
 * Field surface: raised paper, 1 px control border, radius 3, 16 px text (iOS never zooms). Hover
 * darkens the border (not when invalid); errors are a 2 px BORDER (`field-error`), never a shadow,
 * so the focus ring adds to it instead of hiding it.
 */
const SURFACE =
  "w-full min-w-0 rounded-xs border border-control bg-paper-raised text-body text-ink placeholder:text-ink-3 transition-[border-color] [&[data-hovered]:not([data-invalid])]:border-ink-3 data-invalid:field-error data-disabled:cursor-not-allowed data-disabled:bg-paper-sunk data-disabled:text-ink-3 read-only:border-transparent read-only:bg-paper-sunk";

/** Field box: 44 px, padding 0 12. */
export const CONTROL = `${SURFACE} h-control px-3`;

/** Multi-line field: three lines of text, grows by hand. */
export const TEXTAREA = `${SURFACE} block min-h-[6.5rem] resize-y px-3 py-2.5`;

/** Same look for a box that is not an <input> (day field, select trigger): flex row. */
export const CONTROL_BOX =
  "flex h-control w-full min-w-0 cursor-pointer items-center gap-2 rounded-xs border border-control bg-paper-raised px-3 text-left text-body text-ink transition-[border-color] [&[data-hovered]:not([data-rf-invalid=true])]:border-ink-3 data-[rf-invalid=true]:field-error data-disabled:cursor-not-allowed data-disabled:bg-paper-sunk data-disabled:text-ink-3";

/** Help under the field: 13/18 ink-3. */
export const HINT = "mt-1.5 text-[0.8125rem] leading-[1.125rem] text-ink-3";

/** Error under the field: Warning icon + message in --rf-danger. */
export const ERROR =
  "mt-1.5 flex items-start gap-1.5 text-[0.8125rem] leading-[1.125rem] text-danger";
