// CSV exports (D-24). They need the Authorization header, so a plain <a href> cannot work: the
// file is fetched as a blob through the API client (same auth and error handling) and saved.
import { api, unwrap } from "./client";

/** Filename from Content-Disposition, preferring the UTF-8 form (filename*=UTF-8''…). */
export function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""));
    } catch {
      // malformed percent-encoding: try the plain form
    }
  }
  const plain = /filename\s*=\s*"([^"]*)"|filename\s*=\s*([^;]+)/i.exec(header);
  const name = (plain?.[1] ?? plain?.[2])?.trim();
  return name ? name : null;
}

/** Saves a blob through a temporary <a download>. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  // Revoke later: some browsers start reading the blob only after the click handler returns.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** CSV of one student's ledger (`;` separator, decimal comma, BOM for Excel). */
export async function downloadStudentLedgerCsv(studentId: string): Promise<void> {
  const result = await api.GET("/students/{student_id}/ledger.csv", {
    params: { path: { student_id: studentId } },
    parseAs: "blob",
  });
  const blob = unwrap(result);
  saveBlob(
    blob,
    filenameFromDisposition(result.response.headers.get("Content-Disposition")) ??
      "libro-mastro.csv",
  );
}

/** CSV of every student's ledger. */
export async function downloadFullLedgerCsv(): Promise<void> {
  const result = await api.GET("/export/ledger.csv", { parseAs: "blob" });
  const blob = unwrap(result);
  saveBlob(
    blob,
    filenameFromDisposition(result.response.headers.get("Content-Disposition")) ??
      "ripetiflow-libro-mastro.csv",
  );
}
