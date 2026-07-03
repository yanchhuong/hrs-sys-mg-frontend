import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';

/**
 * Drop-in replacement for the browser's native {@code confirm()}
 * that renders through shadcn's AlertDialog so every confirmation in
 * the app shares the app's typography, dark-mode handling, and
 * button styling. Native confirm() blocks the JS thread and looks
 * out-of-place inside a modal (see the "hrs-sys-mg.vercel.app says…"
 * chrome from the browser).
 *
 * Usage:
 *   const confirm = useConfirm();
 *   ...
 *   if (!(await confirm({
 *     title: 'Delete this row?',
 *     message: 'This is permanent.',
 *     variant: 'destructive',
 *   }))) return;
 *
 * A plain-string overload is available for terse one-liners:
 *   if (!(await confirm('Reload the page?'))) return;
 */
export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'destructive' tints the confirm button red — use for delete /
   *  cancel / void / disburse actions that can't be trivially undone. */
  variant?: 'default' | 'destructive';
}

type ConfirmFn = (opts: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) throw new Error('useConfirm must be called inside <ConfirmProvider>');
  return fn;
}

interface PendingState {
  opts: ConfirmOptions;
  resolve: (v: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingState | null>(null);

  const confirm = useCallback<ConfirmFn>((raw) => {
    const opts: ConfirmOptions = typeof raw === 'string' ? { title: raw } : raw;
    return new Promise<boolean>((resolve) => {
      setPending({ opts, resolve });
    });
  }, []);

  const settle = (result: boolean) => {
    setPending(current => {
      current?.resolve(result);
      return null;
    });
  };

  const isDestructive = pending?.opts.variant === 'destructive';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog
        open={!!pending}
        onOpenChange={(open) => { if (!open) settle(false); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.opts.title}</AlertDialogTitle>
            {pending?.opts.message !== undefined && (
              <AlertDialogDescription asChild>
                <div className="text-sm text-muted-foreground">{pending.opts.message}</div>
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>
              {pending?.opts.cancelLabel ?? 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => settle(true)}
              className={isDestructive
                ? 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600'
                : undefined}
            >
              {pending?.opts.confirmLabel ?? 'OK'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}
