// Matita's `reply` with the limited markdown of docs/05 (bold, lists): paragraphs, line breaks,
// «**bold**» in Schibsted 600, «- item» / «1. item» lists. Everything else is plain text: no links,
// no HTML (React escapes it), numbers exactly as the server wrote them.
import type { ReactNode } from "react";
import { cx } from "@/components/utils";
import { parseReply } from "./model";

const INLINE = /\*\*(.+?)\*\*|__(.+?)__|\*(\S(?:.*?\S)?)\*/g;

/** «**67,00 €**» → bold; single «*…*» marks are dropped (the voice is already italic). */
function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const bold = match[1] ?? match[2];
    parts.push(
      bold !== undefined ? (
        <b key={match.index} className="font-ui font-semibold not-italic">
          {bold}
        </b>
      ) : (
        (match[3] ?? "")
      ),
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function ReplyText({ reply, className }: { reply: string; className?: string }) {
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      {parseReply(reply).map((block, i) => {
        if (block.kind === "paragraph") {
          return (
            <p key={i} className="m-0">
              {block.lines.map((line, j) => (
                <span key={j}>
                  {j > 0 && <br />}
                  {inline(line)}
                </span>
              ))}
            </p>
          );
        }
        const List = block.ordered ? "ol" : "ul";
        return (
          <List key={i} className={cx("m-0 pl-5", block.ordered ? "list-decimal" : "list-disc")}>
            {block.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
