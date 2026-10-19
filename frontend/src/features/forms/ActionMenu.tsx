// «⋯» menus (rows of the ledger, Oggi, the student's page): a 44 px square trigger with an
// accessible name, a popover menu of text items with their icon (02 §6: never an icon alone for
// a destructive action).
import { DotsThreeIcon, type Icon } from "@phosphor-icons/react";
import { Button as AriaButton, Menu, MenuItem, MenuTrigger, Popover } from "react-aria-components";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "@/components/button-styles";
import { cx } from "@/components/utils";

export interface ActionMenuItem {
  id: string;
  label: string;
  icon?: Icon;
  /** Pericolo: Elimina… */
  danger?: boolean;
  onAction: () => void;
}

const ITEM =
  "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xs px-3 text-body outline-none data-focused:bg-paper-sunk data-hovered:bg-paper-sunk";

export function ActionMenu({
  label,
  items,
  triggerLabel,
  variant = "quiet",
  size = "md",
  className,
}: {
  /** Accessible name of the trigger: «Altre azioni per la lezione di lun 5 ott». */
  label: string;
  items: readonly ActionMenuItem[];
  /** Visible text next to the dots (e.g. «Duplica»); icon-only when absent. */
  triggerLabel?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  return (
    <MenuTrigger>
      <AriaButton
        aria-label={triggerLabel ? undefined : label}
        className={buttonClasses({ variant, size, square: !triggerLabel, className })}
      >
        {triggerLabel ?? <DotsThreeIcon size={20} aria-hidden />}
      </AriaButton>
      <Popover
        placement="bottom end"
        offset={6}
        className="min-w-56 rounded-sm border border-control bg-paper-raised p-1 shadow-popover outline-none"
      >
        <Menu
          aria-label={label}
          className="outline-none"
          onAction={(key) => items.find((item) => item.id === key)?.onAction()}
        >
          {items.map(({ id, label: itemLabel, icon: ItemIcon, danger }) => (
            <MenuItem
              key={id}
              id={id}
              textValue={itemLabel}
              className={cx(ITEM, danger ? "text-debito" : "text-ink")}
            >
              {ItemIcon && <ItemIcon size={20} aria-hidden className="shrink-0" />}
              {itemLabel}
            </MenuItem>
          ))}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
