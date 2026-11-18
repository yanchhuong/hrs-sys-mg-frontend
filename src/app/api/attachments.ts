import { apiJson, apiFetch, apiVoid, apiOrigin, apiPath, getToken } from './client';

/** 'pos' — a POS order's files: the payment screenshot a shop-page customer
 *  attaches (v-shop-khqr-proof). Guarded by the pos module. */
export type AttachmentDocType = 'invoice' | 'bill' | 'receipt' | 'encounter' | 'hospital_logo' | 'employee_records' | 'pos';

export interface Attachment {
  id: string;
  docType: AttachmentDocType;
  docId: string;
  filename: string;
  contentType?: string | null;
  sizeBytes: number;
  uploadedAt: string;
}

export async function list(docType: AttachmentDocType, docId: string): Promise<Attachment[]> {
  return apiJson('/api/v1/attachments', { query: { docType, docId } });
}

/** docId → file count for the given documents. Documents with none are
 *  absent. `docIds` travels comma-joined; Spring binds it to the list. */
export async function counts(docType: AttachmentDocType, docIds: string[]): Promise<Record<string, number>> {
  if (docIds.length === 0) return {};
  return apiJson('/api/v1/attachments/counts', { query: { docType, docIds: docIds.join(',') } });
}

/** Multipart upload. Builds a FormData manually because the
 *  apiFetch helper only special-cases JSON; for multipart we let
 *  the browser set the boundary itself by NOT passing Content-Type. */
export async function upload(
  docType: AttachmentDocType,
  docId: string,
  file: File,
): Promise<Attachment> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await apiFetch(
    `/api/v1/attachments?docType=${encodeURIComponent(docType)}&docId=${encodeURIComponent(docId)}`,
    { method: 'POST', body: fd },
  );
  if (!res.ok) {
    let message = `Upload failed (${res.status})`;
    try {
      const body = await res.json();
      message = body?.message ?? message;
    } catch { /* no body */ }
    throw new Error(message);
  }
  return res.json();
}

/** The file's bytes. The bearer token has to ride the request, so this
 *  is a fetch, not a bare URL. Composed with apiOrigin() + apiPath()
 *  like every other call: production's base ends in /api-02, and a
 *  plain API_BASE + '/api/v1/…' became /api-02/api/v1/… and 404'd —
 *  every attachment download on the deployed web app failed. */
export async function fetchBlob(id: string): Promise<Blob> {
  const tok = getToken();
  const res = await fetch(
    `${apiOrigin()}${apiPath(`/api/v1/attachments/${id}/download`)}`,
    { headers: tok ? { Authorization: `Bearer ${tok}` } : {} },
  );
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  return res.blob();
}

/** Save the file: fetched with the token, handed to the browser as a
 *  download. */
export async function download(id: string, filename: string): Promise<void> {
  const blob = await fetchBlob(id);
  const url = URL.createObjectURL(blob);
  // Trigger an <a download> click — the simplest cross-browser
  // way to surface the bytes as a Save-As dialog.
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so the browser's download pipeline has time to
  // grab the bytes (Chromium-based browsers race otherwise).
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/attachments/${id}`, { method: 'DELETE' });
}
