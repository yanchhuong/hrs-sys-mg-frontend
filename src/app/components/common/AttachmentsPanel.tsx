import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { Paperclip, Upload, Download, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import * as attachmentsApi from '../../api/attachments';
import { useConfirm } from '../../context/ConfirmContext';

interface Props {
  docType: attachmentsApi.AttachmentDocType;
  /** Doc id. When null the panel renders read-only "save the doc
   *  first" guidance — used on the create form before the row has
   *  an id to attach to. */
  docId: string | null;
  /** Hides the upload + delete buttons when the parent dialog is
   *  in a state that shouldn't allow mutations (e.g. voided doc,
   *  user without the update permission). */
  readOnly?: boolean;
}

/**
 * Generic Attachments list with upload / download / delete. Same
 * shape used by Receipt, Invoice, and Bill detail dialogs — the
 * {@code docType} prop tells the backend which module to gate
 * against, the {@code docId} identifies the row.
 */
export function AttachmentsPanel({ docType, docId, readOnly }: Props) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<attachmentsApi.Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    if (!docId) { setRows([]); return; }
    setLoading(true);
    try {
      setRows(await attachmentsApi.list(docType, docId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load attachments');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [docType, docId]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !docId) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        await attachmentsApi.upload(docType, docId, f);
      }
      toast.success(`${files.length} file${files.length === 1 ? '' : 's'} uploaded`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to upload');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDownload = async (a: attachmentsApi.Attachment) => {
    try { await attachmentsApi.download(a.id, a.filename); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Download failed'); }
  };

  const handleDelete = async (a: attachmentsApi.Attachment) => {
    if (!(await confirm({ title: `Delete "${a.filename}"?`, variant: 'destructive', confirmLabel: 'Delete' }))) return;
    try {
      await attachmentsApi.remove(a.id);
      toast.success('Attachment deleted');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Paperclip className="h-4 w-4 text-gray-500" /> Attachments
          {rows.length > 0 && (
            <span className="text-xs text-gray-500">({rows.length})</span>
          )}
        </div>
        {!readOnly && docId && (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={e => void handleUpload(e.target.files)}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Uploading…</>
                : <><Upload className="h-3.5 w-3.5 mr-1.5" /> Upload</>}
            </Button>
          </>
        )}
      </div>

      {!docId ? (
        <p className="text-xs text-gray-500 italic">
          Save the document first to attach files.
        </p>
      ) : loading ? (
        <p className="text-xs text-gray-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No attachments yet.</p>
      ) : (
        <ul className="space-y-1 border rounded-md divide-y">
          {rows.map(a => (
            <li key={a.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50">
              <Paperclip className="h-3.5 w-3.5 text-gray-400 shrink-0" />
              <button
                type="button"
                className="flex-1 text-left truncate hover:underline"
                onClick={() => void handleDownload(a)}
                title={a.filename}
              >
                {a.filename}
              </button>
              <span className="text-xs text-gray-400 shrink-0">{formatSize(a.sizeBytes)}</span>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                      onClick={() => void handleDownload(a)} title="Download">
                <Download className="h-3.5 w-3.5" />
              </Button>
              {!readOnly && (
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                        onClick={() => void handleDelete(a)} title="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "1234567" → "1.2 MB". Plain compact format — enough for the
 *  user to spot a too-big file at a glance. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
