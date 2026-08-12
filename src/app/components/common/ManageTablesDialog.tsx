import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import {
  Plus, Loader2, RefreshCw, Trash2, Printer, Copy, ExternalLink,
  Utensils, Users, Eye,
} from 'lucide-react';
import * as posTablesApi from '../../api/posTables';
import { useConfirm } from '../../context/ConfirmContext';

/**
 * V315 — Manage tables dialog. Sibling of ShareShopDialog: same
 * mental model (per-tenant public QR + code) but for physical
 * tables. Each row has its own 5-char code and public URL; scanning
 * lands the customer on {@code /shop/table/{code}} which resolves to
 * the same menu the tenant-wide code shows plus a "Table N" header.
 *
 * <p>Orders submitted via a table's URL get tagged with table_id on
 * pos_orders so kitchen tickets can read the label.</p>
 */

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ManageTablesDialog({ open, onOpenChange }: Props) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<posTablesApi.PosTable[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creatingLabel, setCreatingLabel] = useState('');
  const [creatingSeats, setCreatingSeats] = useState('');
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await posTablesApi.list());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load tables');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open) void load(); }, [open]);

  const add = async () => {
    const label = creatingLabel.trim();
    if (!label) { toast.error('Label is required'); return; }
    const seats = creatingSeats.trim() ? Number(creatingSeats) : null;
    if (seats != null && (!Number.isFinite(seats) || seats < 1 || seats > 999)) {
      toast.error('Seats must be a number between 1 and 999'); return;
    }
    setCreating(true);
    try {
      const created = await posTablesApi.create({ label, seats });
      setRows(prev => [...prev, created]);
      setCreatingLabel('');
      setCreatingSeats('');
      toast.success(`Added ${created.label}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create table');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Utensils className="h-4 w-4 text-blue-600" />
            Manage tables
          </DialogTitle>
          <div className="text-xs text-gray-500 mt-1">
            Each table has its own 5-char code and public URL. Scanning a
            table&apos;s QR lands customers on the same menu and tags
            their order with the table label.
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Add row */}
          <div className="rounded-md border p-3 flex flex-wrap items-end gap-2 bg-gray-50/60">
            <div className="flex-1 min-w-[180px]">
              <Label className="text-xs">Label</Label>
              <Input
                value={creatingLabel}
                onChange={e => setCreatingLabel(e.target.value)}
                placeholder="Table 1, VIP-1, Patio 2…"
                className="h-9 mt-1"
                maxLength={64}
                onKeyDown={e => { if (e.key === 'Enter') void add(); }}
              />
            </div>
            <div className="w-24">
              <Label className="text-xs">Seats</Label>
              <Input
                type="number"
                min={1}
                max={999}
                value={creatingSeats}
                onChange={e => setCreatingSeats(e.target.value)}
                placeholder="4"
                className="h-9 mt-1 tabular-nums"
                onKeyDown={e => { if (e.key === 'Enter') void add(); }}
              />
            </div>
            <Button onClick={add} disabled={creating} className="h-9">
              {creating
                ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                : <Plus className="h-4 w-4 mr-1.5" />}
              Add table
            </Button>
          </div>

          {/* List */}
          {loading ? (
            <div className="text-sm text-gray-500 flex items-center gap-2 py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-gray-500 text-center py-8">
              No tables yet. Add one above to get its own QR + code.
            </div>
          ) : (
            <div className="space-y-2">
              {rows.map(t => (
                <TableRow
                  key={t.id}
                  row={t}
                  busy={busyId === t.id}
                  setBusy={b => setBusyId(b ? t.id : null)}
                  onChanged={next => setRows(rs => rs.map(r => r.id === t.id ? next : r))}
                  onRemoved={() => setRows(rs => rs.filter(r => r.id !== t.id))}
                  confirm={confirm}
                />
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-3 border-t">
          <Button variant="outline" onClick={load} disabled={loading} size="sm">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Refresh
          </Button>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Single-row block — QR canvas on the left, label/seats/toggle
 *  fields + actions on the right. Kept in its own component so the
 *  parent list re-render doesn't re-paint every canvas on unrelated
 *  changes. */
function TableRow({
  row, busy, setBusy, onChanged, onRemoved, confirm,
}: {
  row: posTablesApi.PosTable;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onChanged: (next: posTablesApi.PosTable) => void;
  onRemoved: () => void;
  confirm: ReturnType<typeof useConfirm>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [label, setLabel] = useState(row.label);
  const [seats, setSeats] = useState(row.seats == null ? '' : String(row.seats));

  // Re-sync local edits when the parent replaces the row (rotate,
  // enable toggle) so a rename in progress isn't clobbered by an
  // unrelated field update.
  useEffect(() => { setLabel(row.label); }, [row.label]);
  useEffect(() => { setSeats(row.seats == null ? '' : String(row.seats)); }, [row.seats]);

  const url = useMemo(() => {
    if (!row.url) return '';
    return row.url.startsWith('http') ? row.url : `${window.location.origin}${row.url}`;
  }, [row.url]);

  useEffect(() => {
    if (!canvasRef.current || !url) return;
    void QRCode.toCanvas(canvasRef.current, url, {
      width: 128,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' },
    }).catch(() => { /* silent — code + url still visible */ });
  }, [url]);

  const saveLabel = async () => {
    const trimmed = label.trim();
    const seatsNum = seats.trim() ? Number(seats) : null;
    if (seatsNum != null && (!Number.isFinite(seatsNum) || seatsNum < 1 || seatsNum > 999)) {
      toast.error('Seats must be 1..999'); return;
    }
    if (!trimmed) { toast.error('Label cannot be empty'); return; }
    if (trimmed === row.label && (seatsNum ?? null) === (row.seats ?? null)) return;
    setBusy(true);
    try {
      const next = await posTablesApi.update(row.id, {
        label: trimmed,
        seats: seatsNum,
        clearSeats: seatsNum == null && row.seats != null,
      });
      onChanged(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const toggleEnabled = async (next: boolean) => {
    setBusy(true);
    try {
      const fresh = await posTablesApi.update(row.id, { enabled: next });
      onChanged(fresh);
      toast.success(next ? `Enabled ${row.label}` : `Disabled ${row.label}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const rotate = async () => {
    if (!(await confirm({
      title: `Rotate code for ${row.label}?`,
      message: 'The current QR / link will stop working. Printed posters need to be reissued.',
      variant: 'destructive',
      confirmLabel: 'Rotate',
    }))) return;
    setBusy(true);
    try {
      onChanged(await posTablesApi.rotate(row.id));
      toast.success('New code minted');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Rotate failed');
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    if (!(await confirm({
      title: `Delete ${row.label}?`,
      message: 'Its QR stops working. Historical orders keep their table label as "—".',
      variant: 'destructive',
      confirmLabel: 'Delete',
    }))) return;
    setBusy(true);
    try {
      await posTablesApi.remove(row.id);
      onRemoved();
      toast.success(`Removed ${row.label}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.error('Clipboard not available');
    }
  };

  const print = () => {
    const canvas = canvasRef.current;
    if (!canvas) { toast.error('QR not ready yet'); return; }
    const dataUrl = canvas.toDataURL('image/png');
    const w = window.open('', '_blank', 'width=420,height=520');
    if (!w) { toast.error('Popup blocked — allow popups to print'); return; }
    w.document.write(`<!doctype html><html><head>
      <meta charset="utf-8"><title>${row.label} — ${row.code}</title>
      <style>
        body { font-family: 'Inter', system-ui, sans-serif; text-align: center; padding: 32px 16px; margin: 0; }
        h1 { font-size: 22px; margin: 0 0 4px; }
        .seats { color: #6b7280; font-size: 12px; margin-bottom: 16px; }
        img { display: inline-block; margin: 8px 0; }
        .code { font: 700 22px/1.2 'JetBrains Mono', ui-monospace, monospace; letter-spacing: 4px; margin-top: 8px; }
        .url { color: #64748b; font-size: 11px; margin-top: 6px; word-break: break-all; }
        @media print { body { padding: 12mm; } }
      </style>
    </head><body>
      <h1>${escapeHtml(row.label)}</h1>
      ${row.seats ? `<div class="seats">${row.seats} seats</div>` : ''}
      <img src="${dataUrl}" alt="QR" width="260" height="260" />
      <div class="code">${escapeHtml(row.code)}</div>
      <div class="url">${escapeHtml(url)}</div>
    </body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 200);
  };

  return (
    <div className={`rounded-md border p-3 flex gap-4 ${
      row.enabled ? 'bg-white' : 'bg-gray-50/60 opacity-70'
    }`}>
      <div className="shrink-0 flex flex-col items-center">
        <canvas ref={canvasRef} className="rounded border" />
        <div className="text-[10px] font-mono tracking-widest text-gray-500 mt-1">{row.code}</div>
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={label}
            onChange={e => setLabel(e.target.value)}
            onBlur={saveLabel}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void saveLabel(); } }}
            className="h-8 max-w-[160px] font-medium"
            disabled={busy}
          />
          <div className="inline-flex items-center gap-1 text-xs text-gray-500">
            <Users className="h-3.5 w-3.5" />
            <Input
              type="number"
              min={1}
              max={999}
              value={seats}
              onChange={e => setSeats(e.target.value)}
              onBlur={saveLabel}
              className="h-8 w-16 tabular-nums text-center"
              placeholder="—"
              disabled={busy}
            />
            <span>seats</span>
          </div>
          <div className="inline-flex items-center gap-1 text-xs text-gray-500 ml-auto">
            <Eye className="h-3.5 w-3.5" />
            <span className="tabular-nums font-medium text-gray-700">
              {row.viewCount.toLocaleString()}
            </span>
            {(row.viewCount ?? 0) === 1 ? 'view' : 'views'}
          </div>
          <Badge className={row.enabled
            ? 'bg-emerald-100 text-emerald-800'
            : 'bg-gray-200 text-gray-700'
          }>{row.enabled ? 'Enabled' : 'Disabled'}</Badge>
          <Switch
            checked={row.enabled}
            disabled={busy}
            onCheckedChange={toggleEnabled}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Input value={url} readOnly className="h-8 text-xs" />
          <Button size="sm" variant="outline" onClick={copy} title="Copy link" className="h-8 px-2">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline"
            onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
            title="Open" className="h-8 px-2">
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline" onClick={print} title="Print QR" className="h-8 px-2">
            <Printer className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline"
            onClick={rotate} disabled={busy}
            title="Mint a fresh code — old QR stops working"
            className="h-8 px-2">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline"
            onClick={del} disabled={busy}
            title="Delete this table"
            className="h-8 px-2">
            <Trash2 className="h-3.5 w-3.5 text-red-600" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]!));
}
