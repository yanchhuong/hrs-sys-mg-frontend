import { useRef, useState, type DragEvent } from 'react';
import { Upload, X as XIcon, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { readImageAsDataUrl } from '../../utils/imageUpload';

interface Props {
  /** Current base64 data URL (or any http(s) URL the browser can
   *  render). Empty / null shows the empty-state. */
  value: string | null | undefined;
  onChange: (next: string | null) => void;
  /** Hint text shown in the empty drop zone. */
  hint?: string;
  /** Box height — tweak when embedding inside compact forms. */
  height?: number;
  /** Max upload size in bytes (default 1 MB via the helper). */
  maxBytes?: number;
  disabled?: boolean;
}

/**
 * Reusable drag-and-drop / click-to-browse image picker. Renders the
 * existing image when set (with a Clear button) and an empty drop
 * zone otherwise. Reads the file as base64 via {@link readImageAsDataUrl}
 * so the result can be persisted directly into a TEXT column.
 *
 * <p>Used for the POS shop logo (V138) and the Items image (V132 →
 * drag-drop). One component keeps the UX consistent across both.</p>
 */
export function ImageDropZone({ value, onChange, hint, height = 140, maxBytes, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const hasImage = !!value && value.length > 0;

  const accept = async (file: File) => {
    try {
      const url = await readImageAsDataUrl(file, maxBytes ? { maxBytes } : undefined);
      onChange(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to read image');
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void accept(file);
  };

  if (hasImage) {
    return (
      <div className="relative inline-block">
        <img
          src={value!}
          alt=""
          className="rounded-md border bg-white object-contain"
          style={{ maxHeight: height, maxWidth: '100%' }}
        />
        {!disabled && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-white border shadow-sm text-gray-500 hover:text-red-600 flex items-center justify-center"
            title="Remove image"
            aria-label="Remove image"
          >
            <XIcon className="h-3 w-3" />
          </button>
        )}
        <div className="mt-1 text-[11px] text-gray-500">
          Click image to replace · drop a new file to swap
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="absolute inset-0 opacity-0 cursor-pointer"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) void accept(f);
            e.target.value = ''; // allow re-selecting the same file
          }}
          disabled={disabled}
        />
      </div>
    );
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDrop={onDrop}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={e => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) inputRef.current?.click(); }}
      style={{ minHeight: height }}
      className={`flex flex-col items-center justify-center rounded-md border-2 border-dashed p-3 text-center cursor-pointer transition ${
        disabled
          ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
          : dragOver
          ? 'border-emerald-500 bg-emerald-50'
          : 'border-gray-300 bg-gray-50 hover:border-gray-400'
      }`}
    >
      {dragOver
        ? <Upload    className="h-6 w-6 text-emerald-600" />
        : <ImageIcon className="h-6 w-6 text-gray-400" />}
      <div className="mt-1 text-xs text-gray-600 font-medium">
        {dragOver ? 'Drop to upload' : 'Drop an image or click to browse'}
      </div>
      {hint && <div className="text-[11px] text-gray-500 mt-0.5">{hint}</div>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) void accept(f);
          e.target.value = '';
        }}
        disabled={disabled}
      />
    </div>
  );
}
