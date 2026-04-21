import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowDown,
  ArrowUp,
  Check,
  DollarSign,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { useI18n } from '../../i18n/I18nContext';
import { useAuth } from '../../context/AuthContext';
import {
  PayrollCategory,
  PayrollCategoryKind,
  PayrollCategoryValueType,
} from '../../types/settings';
import {
  createCategory,
  loadPayrollCategories,
  resetPayrollCategories,
  savePayrollCategories,
  validateCategory,
} from '../../utils/payrollCategories';

export function PayrollCategorySettings() {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';

  const [categories, setCategories] = useState<PayrollCategory[]>(() => loadPayrollCategories());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PayrollCategory | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PayrollCategory | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const earnings = useMemo(
    () => categories.filter((c) => c.kind === 'earning').sort((a, b) => a.order - b.order),
    [categories],
  );
  const deductions = useMemo(
    () => categories.filter((c) => c.kind === 'deduction').sort((a, b) => a.order - b.order),
    [categories],
  );

  // ---- mutations ---------------------------------------------------------
  const persist = (next: PayrollCategory[]) => {
    setCategories(next);
    savePayrollCategories(next);
  };

  const startAdd = (kind: PayrollCategoryKind) => {
    const blank = createCategory(kind, categories);
    setDraft(blank);
    setEditingId(blank.id);
  };

  const startEdit = (c: PayrollCategory) => {
    setDraft({ ...c });
    setEditingId(c.id);
  };

  const cancelEdit = () => {
    setDraft(null);
    setEditingId(null);
  };

  const saveDraft = () => {
    if (!draft) return;
    const err = validateCategory(draft, categories);
    if (err) {
      toast.error(err);
      return;
    }
    const exists = categories.some((c) => c.id === draft.id);
    const next = exists
      ? categories.map((c) => (c.id === draft.id ? draft : c))
      : [...categories, draft];
    persist(next);
    setDraft(null);
    setEditingId(null);
    toast.success(exists ? 'Category updated' : 'Category added');
  };

  const toggleEnabled = (c: PayrollCategory) => {
    persist(categories.map((x) => (x.id === c.id ? { ...x, enabled: !x.enabled } : x)));
  };

  const deleteCategory = (c: PayrollCategory) => {
    persist(categories.filter((x) => x.id !== c.id));
    toast.success(`Removed "${c.label}"`);
    setConfirmDelete(null);
  };

  const move = (c: PayrollCategory, dir: -1 | 1) => {
    const siblings = categories
      .filter((x) => x.kind === c.kind)
      .sort((a, b) => a.order - b.order);
    const idx = siblings.findIndex((x) => x.id === c.id);
    const swapWith = siblings[idx + dir];
    if (!swapWith) return;
    const next = categories.map((x) => {
      if (x.id === c.id) return { ...x, order: swapWith.order };
      if (x.id === swapWith.id) return { ...x, order: c.order };
      return x;
    });
    persist(next);
  };

  const doReset = () => {
    const seeded = resetPayrollCategories();
    setCategories(seeded);
    setConfirmReset(false);
    cancelEdit();
    toast.success('Restored default categories');
  };

  // ---- render ------------------------------------------------------------
  const renderSection = (kind: PayrollCategoryKind, rows: PayrollCategory[]) => {
    const isEarning = kind === 'earning';
    return (
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              {isEarning ? (
                <DollarSign className="h-5 w-5 text-emerald-600" />
              ) : (
                <Minus className="h-5 w-5 text-rose-600" />
              )}
              {isEarning ? t('payrollCat.earnings') : t('payrollCat.deductions')}
              <Badge variant="secondary">{rows.length}</Badge>
            </CardTitle>
            <CardDescription>
              {isEarning ? t('payrollCat.earnings.desc') : t('payrollCat.deductions.desc')}
            </CardDescription>
          </div>
          {isAdmin && (
            <Button size="sm" onClick={() => startAdd(kind)} disabled={!!editingId}>
              <Plus className="mr-1 h-4 w-4" />
              {t('payrollCat.add')}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">{t('payrollCat.col.order')}</TableHead>
                <TableHead>{t('payrollCat.col.label')}</TableHead>
                <TableHead>{t('payrollCat.col.code')}</TableHead>
                <TableHead className="w-[140px]">{t('payrollCat.col.type')}</TableHead>
                <TableHead className="w-[140px]">{t('payrollCat.col.default')}</TableHead>
                <TableHead className="w-[100px]">{t('payrollCat.col.enabled')}</TableHead>
                {isAdmin && <TableHead className="w-[180px] text-right">{t('payrollCat.col.actions')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && editingId === null && (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 7 : 6} className="text-center text-gray-500 py-8">
                    {t('payrollCat.empty')}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((c, idx) => {
                const isEditing = editingId === c.id;
                return (
                  <TableRow key={c.id} className={c.enabled ? '' : 'opacity-50'}>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          disabled={idx === 0 || !!editingId || !isAdmin}
                          onClick={() => move(c, -1)}
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          disabled={idx === rows.length - 1 || !!editingId || !isAdmin}
                          onClick={() => move(c, 1)}
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>

                    {isEditing && draft ? (
                      <>
                        <TableCell>
                          <Input
                            autoFocus
                            value={draft.label}
                            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                            placeholder="e.g. Transport Allowance"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={draft.code}
                            onChange={(e) => setDraft({ ...draft, code: e.target.value.toLowerCase() })}
                            placeholder="transport_allowance"
                            disabled={draft.system}
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={draft.valueType}
                            onValueChange={(v: PayrollCategoryValueType) =>
                              setDraft({ ...draft, valueType: v })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="flat">{t('payrollCat.type.flat')}</SelectItem>
                              <SelectItem value="percentage">{t('payrollCat.type.percentage')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={draft.defaultAmount}
                            onChange={(e) =>
                              setDraft({ ...draft, defaultAmount: parseFloat(e.target.value) || 0 })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={draft.enabled}
                            onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="icon" variant="ghost" onClick={saveDraft}>
                            <Check className="h-4 w-4 text-emerald-600" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={cancelEdit}>
                            <X className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell>
                          <span className="font-medium">{c.label}</span>
                          {c.system && (
                            <Badge variant="outline" className="ml-2 text-[10px]">
                              {t('payrollCat.builtin')}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{c.code}</code>
                        </TableCell>
                        <TableCell>
                          {c.valueType === 'flat' ? t('payrollCat.type.flat') : t('payrollCat.type.percentage')}
                        </TableCell>
                        <TableCell>
                          {c.valueType === 'percentage'
                            ? `${c.defaultAmount}%`
                            : c.defaultAmount.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={c.enabled}
                            onCheckedChange={() => toggleEnabled(c)}
                            disabled={!isAdmin || !!editingId}
                          />
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => startEdit(c)}
                              disabled={!!editingId}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setConfirmDelete(c)}
                              disabled={c.system || !!editingId}
                              title={c.system ? t('payrollCat.cannotDelete') : ''}
                            >
                              <Trash2 className="h-4 w-4 text-rose-600" />
                            </Button>
                          </TableCell>
                        )}
                      </>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t('payrollCat.title')}</h1>
          <p className="text-gray-500">{t('payrollCat.description')}</p>
        </div>
        {isAdmin && (
          <Button variant="outline" onClick={() => setConfirmReset(true)}>
            <RotateCcw className="mr-2 h-4 w-4" />
            {t('payrollCat.reset')}
          </Button>
        )}
      </div>

      {renderSection('earning', earnings)}
      {renderSection('deduction', deductions)}

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('payrollCat.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('payrollCat.delete.desc').replace('{name}', confirmDelete?.label ?? '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('action.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => confirmDelete && deleteCategory(confirmDelete)}
            >
              {t('action.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('payrollCat.reset.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('payrollCat.reset.desc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('action.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={doReset}>{t('action.confirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
