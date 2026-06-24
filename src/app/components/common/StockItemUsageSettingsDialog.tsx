import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FileText, FileSignature, Receipt, ShoppingBag, ShoppingCart, Save, Info } from 'lucide-react';

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import * as itemsApi from '../../api/items';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional change hook so the parent (e.g. an embedding view) can
   *  refetch the gate immediately after save. */
  onSaved?: (next: itemsApi.UsageSettings) => void;
}

/**
 * Per-tenant settings for whether the StockItemPicker is allowed on
 * each sale/purchase document form (V120). Four toggles map 1:1 to
 * the backend columns:
 *   enabledForInvoice / Quotation / Voucher / Bill
 *
 * <p>Defaults are all-off — items module ships hidden behind explicit
 * opt-in per doc type. Saving rewrites the single per-tenant row.</p>
 */
export function StockItemUsageSettingsDialog({ open, onOpenChange, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<itemsApi.UsageSettings>({
    enabledForInvoice: false,
    enabledForQuotation: false,
    enabledForVoucher: false,
    enabledForBill: false,
    enabledForPos: false,
    updatedAt: null,
  });

  // Re-fetch on every open so flipping a toggle, closing, re-opening
  // shows the persisted state rather than the post-save in-memory
  // copy of the previous edit.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    itemsApi.getUsageSettings()
      .then(setForm)
      .catch(e => toast.error(e instanceof Error ? e.message : 'Failed to load settings'))
      .finally(() => setLoading(false));
  }, [open]);

  const save = async () => {
    setSaving(true);
    try {
      const next = await itemsApi.putUsageSettings(form);
      setForm(next);
      onSaved?.(next);
      toast.success('Settings saved');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const Row = ({
    icon, label, hint, value, onChange,
  }: {
    icon: React.ReactNode;
    label: string;
    hint: string;
    value: boolean;
    onChange: (next: boolean) => void;
  }) => (
    <div className="flex items-start justify-between gap-4 py-3 border-b last:border-b-0">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="mt-0.5 text-gray-500">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900">{label}</div>
          <div className="text-xs text-gray-500 leading-snug">{hint}</div>
        </div>
      </div>
      <Switch checked={value} onCheckedChange={onChange} disabled={loading || saving} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Item usage settings
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  {/* tabIndex={-1} keeps the Info icon out of the
                      Dialog's auto-focus path. Without it, Radix
                      Dialog focuses the first focusable child on
                      open, which lands here — and Radix Tooltip
                      opens on focus by default, so the hint shows
                      every time the dialog mounts. Hover still works. */}
                  <button
                    type="button"
                    tabIndex={-1}
                    className="text-gray-400 hover:text-gray-600"
                    aria-label="About item usage settings"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  Toggle whether the line forms on each document type
                  may pick from your Stock catalog. Off = free-text Item
                  column only; On = catalog picker appears with name /
                  price / unit autofilled and (on Invoice) on-hand
                  balance decremented at save.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Per-document toggles controlling whether stock items can be
            picked on the line forms.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-0">
          <Row
            icon={<FileText className="h-4 w-4" />}
            label="Invoice"
            hint="Show the catalog picker on Invoice line items."
            value={form.enabledForInvoice}
            onChange={v => setForm(f => ({ ...f, enabledForInvoice: v }))}
          />
          <Row
            icon={<FileSignature className="h-4 w-4" />}
            label="Quotation"
            hint="Show the catalog picker on Quotation line items."
            value={form.enabledForQuotation}
            onChange={v => setForm(f => ({ ...f, enabledForQuotation: v }))}
          />
          <Row
            icon={<Receipt className="h-4 w-4" />}
            label="Voucher"
            hint="Show the catalog picker on General Voucher line items."
            value={form.enabledForVoucher}
            onChange={v => setForm(f => ({ ...f, enabledForVoucher: v }))}
          />
          <Row
            icon={<ShoppingBag className="h-4 w-4" />}
            label="Bill"
            hint="Reserved — the catalog picker for purchase bills will respect this when it ships."
            value={form.enabledForBill}
            onChange={v => setForm(f => ({ ...f, enabledForBill: v }))}
          />
          <Row
            icon={<ShoppingCart className="h-4 w-4" />}
            label="POS"
            hint="Show this item in the POS page's items grid for counter checkout."
            value={form.enabledForPos}
            onChange={v => setForm(f => ({ ...f, enabledForPos: v }))}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={loading || saving}>
            <Save className="h-4 w-4 mr-1.5" />
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
