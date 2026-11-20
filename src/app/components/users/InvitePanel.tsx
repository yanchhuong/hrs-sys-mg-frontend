import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Link2, Loader2, Mail, QrCode, RefreshCw, Send, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { useConfirm } from '../../context/ConfirmContext';
import { useDateFormat } from '../../context/DateFormatContext';
import {
  createInvite, emailInvite, revokeInvite, telegramShareUrl, type InviteCreated,
} from '../../api/invites';

export interface InviteSubject {
  id: string;
  name: string;
  email?: string | null;
  /** The newest invite's state from the list (pending | accepted | expired | revoked). */
  inviteStatus?: string | null;
  inviteExpiresAt?: string | null;
}

/**
 * v-user-invites — Admin › Users invite panel (spec §12.8). Right after
 * create / resend it shows the link once: copy, share to a Telegram chat,
 * QR code, email. Afterwards the link cannot be shown again (only its hash
 * is kept) — "New link" makes another, and the old one stops working.
 */
export function InvitePanel({ open, onOpenChange, user, initial, companyName, onChanged }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: InviteSubject | null;
  /** A link created just now (Add User → Invite). */
  initial?: InviteCreated | null;
  companyName?: string | null;
  /** The list should reload (status changed). */
  onChanged?: () => void;
}) {
  const confirm = useConfirm();
  const { formatDateTime } = useDateFormat();
  const [link, setLink] = useState<InviteCreated | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [busy, setBusy] = useState<'new' | 'revoke' | 'email' | null>(null);
  const [revoked, setRevoked] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLink(initial ?? null);
    setShowQr(false);
    setQr(null);
    setRevoked(false);
  }, [open, initial, user?.id]);

  useEffect(() => {
    if (!link) return;
    let live = true;
    QRCode.toDataURL(link.inviteUrl, { margin: 1, width: 220 }).then(d => { if (live) setQr(d); }).catch(() => setQr(null));
    return () => { live = false; };
  }, [link]);

  if (!user) return null;

  const status = revoked ? 'revoked' : link ? 'pending' : (user.inviteStatus ?? null);
  const open_ = status === 'pending' || status === 'expired';

  const newLink = async () => {
    setBusy('new');
    try {
      const r = await createInvite(user.id);
      setLink(r);
      setRevoked(false);
      setShowQr(false);
      toast.success(r.resent ? 'New link created. The old one no longer works.' : 'Invite link created');
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create the link');
    } finally {
      setBusy(null);
    }
  };

  const revoke = async () => {
    const ok = await confirm({
      title: 'Revoke this invite?',
      message: `The link stops working. ${user.name} can't use it to set up their account.`,
      confirmLabel: 'Revoke',
      variant: 'destructive',
    });
    if (!ok) return;
    setBusy('revoke');
    try {
      await revokeInvite(user.id);
      setLink(null);
      setRevoked(true);
      toast.success('Invite revoked');
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not revoke the invite');
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.inviteUrl);
      toast.success('Link copied');
    } catch {
      toast.error('Copy failed — select the link and copy it');
    }
  };

  const email = async () => {
    if (!link) return;
    setBusy('email');
    try {
      await emailInvite(user.id, link.inviteUrl);
      toast.success(`Sent to ${user.email}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send the email');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Link2 className="h-4 w-4 text-blue-600" /> Invite {user.name}</DialogTitle>
          <DialogDescription>
            {link
              ? <>Works once, until {formatDateTime(link.expiresAt)}. Copy it now — it isn't shown again.</>
              : status === 'pending'
                ? <>An invite is out, until {user.inviteExpiresAt ? formatDateTime(user.inviteExpiresAt) : '—'}. Its link was shown only when it was made.</>
                : status === 'expired' ? 'The invite expired before it was used.'
                : status === 'revoked' ? 'The invite was revoked.'
                : status === 'accepted' ? 'The invite was accepted.'
                : 'They set up their own sign-in from the link: Telegram or a password.'}
          </DialogDescription>
        </DialogHeader>

        {link && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input readOnly value={link.inviteUrl} onFocus={e => e.currentTarget.select()} className="font-mono text-xs" />
              <Button type="button" variant="outline" size="icon" onClick={() => void copy()} title="Copy link" aria-label="Copy link">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" asChild>
                <a href={telegramShareUrl(link.inviteUrl, companyName)} target="_blank" rel="noopener noreferrer">
                  <Send className="mr-1.5 h-3.5 w-3.5 text-sky-600" /> Share
                </a>
              </Button>
              <Button type="button" variant={showQr ? 'secondary' : 'outline'} size="sm" onClick={() => setShowQr(v => !v)} disabled={!qr}>
                <QrCode className="mr-1.5 h-3.5 w-3.5" /> QR code
              </Button>
              {link.emailAvailable && (
                <Button type="button" variant="outline" size="sm" onClick={() => void email()} disabled={busy !== null}>
                  {busy === 'email' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Mail className="mr-1.5 h-3.5 w-3.5" />} Email
                </Button>
              )}
            </div>
            {showQr && qr && (
              <div className="flex justify-center">
                <img src={qr} alt="Invite QR code" className="h-[220px] w-[220px] rounded-lg border" />
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {open_ && (
              <Button type="button" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => void revoke()} disabled={busy !== null}>
                {busy === 'revoke' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <XCircle className="mr-1.5 h-4 w-4" />} Revoke
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {status !== 'accepted' && (
              <Button type="button" variant={link ? 'outline' : 'default'} onClick={() => void newLink()} disabled={busy !== null}>
                {busy === 'new' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                {link || status ? 'New link' : 'Create link'}
              </Button>
            )}
            <Button type="button" variant={link ? 'default' : 'outline'} onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
