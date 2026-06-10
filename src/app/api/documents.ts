import { API_BASE, apiFetch, apiJson, apiVoid, ApiError } from './client';

export type EmployeeDocumentType =
  | 'contract' | 'id_card' | 'passport' | 'certificate'
  | 'resume' | 'tax_form' | 'other';

export interface EmployeeDocument {
  id: string;
  employeeId: string;
  name: string;
  type: EmployeeDocumentType;
  mimeType: string;
  sizeBytes: number;
  notes?: string | null;
  uploadedById?: string | null;
  uploadedAt: string;
}

export async function listForEmployee(employeeId: string): Promise<EmployeeDocument[]> {
  return apiJson<EmployeeDocument[]>(`/api/v1/employees/${employeeId}/documents`);
}

/**
 * Tenant-wide document listing backing the "All Documents" tab on
 * the Employees page. Adds {@code empNo} + {@code employeeName} to
 * each row so the table can display whose document it is without a
 * second round-trip. Either field may be null if the employee was
 * deleted after the document was uploaded.
 */
export interface DocumentWithEmployee extends EmployeeDocument {
  empNo: string | null;
  employeeName: string | null;
}

export async function listAll(type?: EmployeeDocumentType): Promise<DocumentWithEmployee[]> {
  const q = type ? `?type=${encodeURIComponent(type)}` : '';
  return apiJson<DocumentWithEmployee[]>(`/api/v1/documents${q}`);
}

/**
 * Multipart upload. We don't go through {@link apiJson} because that sets a
 * JSON content-type — for multipart we must let the browser set the boundary
 * automatically by leaving Content-Type blank.
 */
export async function upload(
  employeeId: string,
  file: File,
  type: EmployeeDocumentType,
  notes?: string,
): Promise<EmployeeDocument> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('type', type);
  if (notes) fd.append('notes', notes);
  // type goes in the multipart body only — sending it as a query param too
  // makes Spring's @RequestParam concatenate both values ("certificate,certificate").
  const res = await apiFetch(`/api/v1/employees/${employeeId}/documents`, {
    method: 'POST',
    body: fd,
  });
  if (!res.ok) {
    const ct = res.headers.get('content-type') ?? '';
    const body = ct.includes('application/json') ? await res.json().catch(() => null) : null;
    throw new ApiError(body?.message ?? `Upload failed (${res.status})`,
      res.status, `/api/v1/employees/${employeeId}/documents`, body);
  }
  return res.json();
}

/**
 * Triggers a browser download. Backend streams the file with the right
 * Content-Disposition; the JWT bearer is added by {@link apiFetch}, so we
 * fetch into a blob and synthesize a temporary anchor click.
 */
export async function download(doc: EmployeeDocument): Promise<void> {
  const res = await apiFetch(`/api/v1/documents/${doc.id}/download`);
  if (!res.ok) {
    throw new ApiError(`Download failed (${res.status})`, res.status,
      `/api/v1/documents/${doc.id}/download`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = doc.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Defer revoke so Safari finishes the navigation before the blob URL dies.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function remove(documentId: string): Promise<void> {
  return apiVoid(`/api/v1/documents/${documentId}`, { method: 'DELETE' });
}

/**
 * Fetch the employee's profile image and return a blob URL suitable for
 * `<img src>`. Returns null on 404 (no image set). Caller is responsible for
 * `URL.revokeObjectURL(url)` when the image is unmounted.
 *
 * We can't put the bearer JWT in an `<img>` tag, so fetching to a blob and
 * synthesizing a URL is the auth-friendly pattern.
 */
export async function fetchProfileImageBlobUrl(employeeId: string): Promise<string | null> {
  const res = await apiFetch(`/api/v1/employees/${employeeId}/profile-image`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new ApiError(`Profile image fetch failed (${res.status})`, res.status,
      `/api/v1/employees/${employeeId}/profile-image`);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function uploadProfileImage(employeeId: string, file: File): Promise<void> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await apiFetch(`/api/v1/employees/${employeeId}/profile-image`, {
    method: 'POST',
    body: fd,
  });
  if (!res.ok) {
    const ct = res.headers.get('content-type') ?? '';
    const body = ct.includes('application/json') ? await res.json().catch(() => null) : null;
    throw new ApiError(body?.message ?? `Upload failed (${res.status})`,
      res.status, `/api/v1/employees/${employeeId}/profile-image`, body);
  }
}

/** Plain URL helper for the few places that legitimately want it (debugging). */
export function profileImageUrl(employeeId: string, cacheBust?: string | number): string {
  const base = `${API_BASE}/api/v1/employees/${employeeId}/profile-image`;
  return cacheBust !== undefined ? `${base}?v=${cacheBust}` : base;
}
