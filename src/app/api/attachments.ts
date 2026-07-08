import { apiJson, apiFetch, apiVoid, API_BASE, getToken } from './client';

export type AttachmentDocType = 'invoice' | 'bill' | 'receipt' | 'encounter' | 'hospital_logo';

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

/** Download URL — the browser opens it directly so the bearer token
 *  needs to be on the request. We return a fetch promise that yields
 *  a blob URL; the caller is responsible for revoking it. */
export async function download(id: string, filename: string): Promise<void> {
  const tok = getToken();
  const res = await fetch(
    `${API_BASE.replace(/\/$/, '')}/api/v1/attachments/${id}/download`,
    {
      headers: tok ? { Authorization: `Bearer ${tok}` } : {},
    },
  );
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
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
