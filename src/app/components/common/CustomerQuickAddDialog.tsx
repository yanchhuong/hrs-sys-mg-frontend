import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Loader2 } from 'lucide-react';
import * as customersApi from '../../api/customers';

/**
 * v-customer-quickadd — inline "Add customer" flow packaged as a
 * hook so document forms (Invoice / Quotation / Voucher / Bill /
 * POS) can wire the same UX behind their SearchablePicker without
 * duplicating the promise-plumbing + Dialog markup.
 *
 * <p>Usage — mount the dialog once inside the form, then feed
 * {@link Return.onCreate} to the picker's `onCreate` prop:</p>
 *
 * <pre>
 *   const quickAdd = useCustomerQuickAdd({
 *     customers, setCustomers, onSelect: id => setCustomerId(id),
 *   });
 *   ...
 *   <SearchablePicker
 *     onCreate={quickAdd.onCreate}
 *     createLabel={q => `Add "${q}" as a new customer`}
 *     ...
 *   />
 *   {quickAdd.dialog}
 * </pre>
 *
 * <p>Server call defaults to `type='individual', kind='customer'` —
 * same as POS. Callers that need business-type customers should
 * still route through the full Customers page.</p>
 */
export interface UseCustomerQuickAddOptions {
  /** Current in-memory customer list — mirrored so the picker sees
   *  the newly-created row on the next open without a refetch. */
  customers: customersApi.Customer[];
  /** Setter for the customer list. Called after a successful create. */
  setCustomers: React.Dispatch<React.SetStateAction<customersApi.Customer[]>>;
  /** Fires with the new customer's id after create — parents typically
   *  push it into their own `setCustomerId` so the picker resolves
   *  to the fresh row. */
  onSelect: (id: string) => void;
}

export interface UseCustomerQuickAddResult {
  /** Wire this to {@link SearchablePickerProps.onCreate}. Opens the
   *  dialog with `name` pre-filled from the picker's search input,
   *  returns a promise that resolves to the picker option when the
   *  operator saves (or rejects on Cancel so the picker stays open). */
  onCreate: (name: string) => Promise<{ value: string; label: string; secondary?: string }>;
  /** Mount this JSX once at the form root so the dialog can appear
   *  anywhere inside. */
  dialog: React.ReactNode;
}

export function useCustomerQuickAdd(opts: UseCustomerQuickAddOptions): UseCustomerQuickAddResult {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  // Ref-held promise callbacks so onCreate's caller receives the
  // resolved option after the dialog's save button runs — a single
  // pending slot is enough because the dialog is modal.
  const pendingRef = useRef<{
    resolve: (v: { value: string; label: string; secondary?: string }) => void;
    reject: (e: Error) => void;
  } | null>(null);

  const onCreate = (seed: string) => {
    return new Promise<{ value: string; label: string; secondary?: string }>((resolve, reject) => {
      pendingRef.current = { resolve, reject };
      setName(seed);
      setPhone('');
      setOpen(true);
    });
  };

  const cancel = () => {
    if (pendingRef.current) {
      pendingRef.current.reject(new Error('cancelled'));
      pendingRef.current = null;
    }
    setOpen(false);
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const created = await customersApi.create({
        type: 'individual',
        kind: 'customer',
        name: trimmed,
        phone: phone.trim() || undefined,
      });
      opts.setCustomers(prev => [...prev, created]);
      opts.onSelect(created.id);
      toast.success(`Added ${created.name}`);
      pendingRef.current?.resolve({
        value: created.id,
        label: created.name,
        secondary: created.phone ?? undefined,
      });
      pendingRef.current = null;
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add customer');
    } finally {
      setSaving(false);
    }
  };

  const dialog = (
    <Dialog open={open} onOpenChange={o => { if (!o) cancel(); else setOpen(o); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add customer</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <Label className="text-xs">Name</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              className="h-9 mt-1"
              placeholder="Full name"
              maxLength={255}
              autoFocus
            />
          </div>
          <div>
            <Label className="text-xs">Phone (optional)</Label>
            <Input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="h-9 mt-1"
              placeholder="012 345 678"
              inputMode="tel"
              maxLength={64}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={cancel} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Add customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { onCreate, dialog };
}
