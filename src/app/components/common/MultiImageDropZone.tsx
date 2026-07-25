import { useRef, useState, type DragEvent } from 'react';
import { Upload, X as XIcon, Star, GripVertical, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { readImageAsDataUrl } from '../../utils/imageUpload';

interface Props {
  /** Ordered image list (data URLs or http URLs). First entry is the
   *  cover shown as the product-card image. Empty array = no images. */
  value: string[];
  onChange: (next: string[]) => void;
  /** Maximum allowed images. Defaults to 5 (V265). */
  max?: number;
  /** Thumbnail edge (square) in pixels. */
  size?: number;
  disabled?: boolean;
  hint?: string;
}

/**
 * Multi-image picker — up to `max` slots, each accepting a drag-dropped
 * or browsed file. Every upload runs through
 * {@link readImageAsDataUrl}, which now compresses + downscales
 * client-side (see imageCompress.ts) so a 6 MB phone photo lands as a
 * ~200 KB base64 blob.
 *
 * The first thumbnail is the "cover" and is what legacy readers (POS
 * card, shop card, receipt) will render. Reordering: drag a thumbnail
 * onto another slot to move it, or click the star icon to promote to
 * cover. Dropping OS files anywhere on the strip appends them.
 */
export function MultiImageDropZone({
  value, onChange, max = 5, size = 96, disabled, hint,
}: Props): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOverFile, setDragOverFile] = useState(false);
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const room = Math.max(0, max - value.length);

  const acceptFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (!arr.length) return;
    if (room === 0) {
      toast.error(`Up to ${max} images per item.`);
      return;
    }
    const take = arr.slice(0, room);
    if (arr.length > room) {
      toast.error(`Only added the first ${room} — max ${max} images per item.`);
    }
    const added: string[] = [];
    for (const f of take) {
      try {
        const url = await readImageAsDataUrl(f);
        added.push(url);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Failed to read ${f.name}`);
      }
    }
    if (added.length) onChange([...value, ...added]);
  };

  const removeAt = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  const makeCover = (idx: number) => {
    if (idx === 0) return;
    const next = value.slice();
    const [picked] = next.splice(idx, 1);
    next.unshift(picked);
    onChange(next);
  };

  const reorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= value.length || to >= value.length) return;
    const next = value.slice();
    const [picked] = next.splice(from, 1);
    next.splice(to, 0, picked);
    onChange(next);
  };

  const hasFiles = (e: DragEvent<HTMLDivElement>) =>
    Array.from(e.dataTransfer?.types ?? []).includes('Files');

  const onStripDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (!hasFiles(e)) return;
    e.preventDefault();
    setDragOverFile(true);
  };
  const onStripDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOverFile(false);
  };
  const onStripDrop = (e: DragEvent<HTMLDivElement>) => {
    setDragOverFile(false);
    if (disabled) return;
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer.files?.length) void acceptFiles(e.dataTransfer.files);
  };

  return (
    <div className="space-y-2">
      <div
        onDrop={onStripDrop}
        onDragOver={onStripDragOver}
        onDragLeave={onStripDragLeave}
        className={`flex flex-wrap gap-2 items-start rounded-md border-2 border-dashed transition p-2 ${
          disabled
            ? 'border-gray-200 bg-gray-50/40 opacity-70'
            : dragOverFile
            ? 'border-emerald-500 bg-emerald-50'
            : 'border-transparent'
        }`}
      >
        {value.map((url, idx) => {
          const isDragging = dragFromIdx === idx;
          const isDropTarget = dragOverIdx === idx && dragFromIdx !== null && dragFromIdx !== idx;
          return (
            <div
              key={`${idx}-${url.slice(0, 32)}`}
              draggable={!disabled}
              onDragStart={e => {
                if (disabled) return;
                setDragFromIdx(idx);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(idx));
              }}
              onDragEnd={() => { setDragFromIdx(null); setDragOverIdx(null); }}
              onDragOver={e => {
                if (disabled || dragFromIdx === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOverIdx !== idx) setDragOverIdx(idx);
              }}
              onDrop={e => {
                if (disabled || dragFromIdx === null) return;
                e.preventDefault();
                e.stopPropagation();
                reorder(dragFromIdx, idx);
                setDragFromIdx(null);
                setDragOverIdx(null);
              }}
              className={`relative rounded-md border bg-white transition ${
                isDragging ? 'opacity-40' : ''
              } ${isDropTarget ? 'ring-2 ring-emerald-500' : ''} ${
                !disabled ? 'cursor-grab active:cursor-grabbing' : ''
              }`}
              style={{ width: size, height: size }}
              title={!disabled ? 'Drag to reorder' : undefined}
            >
              <img
                src={url}
                alt=""
                className="w-full h-full object-cover rounded-md pointer-events-none"
                draggable={false}
              />
              {idx === 0 && (
                <span className="absolute top-1 left-1 inline-flex items-center gap-0.5 rounded bg-black/60 text-white text-[9px] font-medium px-1 py-0.5 pointer-events-none">
                  <Star className="h-2.5 w-2.5 fill-white" />
                  Cover
                </span>
              )}
              {!disabled && idx !== 0 && (
                <button
                  type="button"
                  onClick={() => makeCover(idx)}
                  onDragStart={e => e.preventDefault()}
                  className="absolute top-1 left-1 h-5 w-5 rounded bg-white/90 border shadow-sm text-gray-500 hover:text-amber-600 flex items-center justify-center"
                  title="Make cover"
                  aria-label="Make cover"
                >
                  <Star className="h-3 w-3" />
                </button>
              )}
              {!disabled && (
                <span
                  className="absolute bottom-1 right-1 inline-flex items-center justify-center rounded bg-black/50 text-white h-4 w-4 pointer-events-none"
                  aria-hidden
                >
                  <GripVertical className="h-3 w-3" />
                </span>
              )}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeAt(idx)}
                  onDragStart={e => e.preventDefault()}
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-white border shadow-sm text-gray-500 hover:text-red-600 flex items-center justify-center z-10"
                  title="Remove image"
                  aria-label="Remove image"
                >
                  <XIcon className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}

        {room > 0 && (
          <div
            onClick={() => !disabled && inputRef.current?.click()}
            role="button"
            tabIndex={disabled ? -1 : 0}
            onKeyDown={e => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) inputRef.current?.click(); }}
            style={{ width: size, height: size }}
            className={`flex flex-col items-center justify-center rounded-md border-2 border-dashed cursor-pointer transition text-center px-1 ${
              disabled
                ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
                : dragOverFile
                ? 'border-emerald-500 bg-emerald-50'
                : 'border-gray-300 bg-gray-50 hover:border-gray-400'
            }`}
          >
            {dragOverFile
              ? <Upload className="h-6 w-6 text-emerald-600" />
              : <UploadCloud className="h-6 w-6 text-gray-400" />}
            <div className="text-[10px] text-gray-600 font-medium mt-0.5 leading-tight">
              {dragOverFile ? 'Drop to add' : 'Drop or click'}
            </div>
          </div>
        )}
      </div>

      <div className="text-[11px] text-gray-500">
        {hint ?? `${value.length} / ${max} images${value.length ? ' · drag to reorder, first is the cover' : ''}. Big files are auto-compressed.`}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => {
          if (e.target.files) void acceptFiles(e.target.files);
          e.target.value = '';
        }}
        disabled={disabled}
      />
    </div>
  );
}
