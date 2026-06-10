/**
 * Extension chip family shared by the All-Documents tab and the
 * per-employee Documents tab. HR readers spot 'PDF' / 'XLSX' / 'JPG'
 * faster than a generic file glyph, so each row gets a colored 2–4
 * letter pill. Colors mirror typical office-suite conventions
 * (Drive / OneDrive).
 */
export type ExtFamily = 'pdf' | 'word' | 'excel' | 'ppt' | 'image' | 'archive' | 'text' | 'other';

export function extOf(filename: string): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(filename);
  return m ? m[1].toLowerCase() : '';
}

export function familyOf(ext: string, mime: string): ExtFamily {
  if (['pdf'].includes(ext) || mime.includes('pdf')) return 'pdf';
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'word';
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return 'excel';
  if (['ppt', 'pptx', 'odp', 'key'].includes(ext)) return 'ppt';
  if (mime.startsWith('image/') || ['jpg','jpeg','png','gif','webp','heic','bmp','svg'].includes(ext)) return 'image';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
  if (['txt', 'md', 'log'].includes(ext)) return 'text';
  return 'other';
}

export const EXT_CHIP_CLASS: Record<ExtFamily, string> = {
  pdf:     'bg-red-100 text-red-700 border-red-200',
  word:    'bg-blue-100 text-blue-700 border-blue-200',
  excel:   'bg-emerald-100 text-emerald-700 border-emerald-200',
  ppt:     'bg-orange-100 text-orange-700 border-orange-200',
  image:   'bg-purple-100 text-purple-700 border-purple-200',
  archive: 'bg-amber-100 text-amber-700 border-amber-200',
  text:    'bg-slate-100 text-slate-700 border-slate-200',
  other:   'bg-slate-100 text-slate-600 border-slate-200',
};

/** "PDF", "XLSX", or "FILE" if no extension. */
export function chipLabelOf(filename: string): string {
  const ext = extOf(filename);
  return ext ? ext.toUpperCase() : 'FILE';
}
