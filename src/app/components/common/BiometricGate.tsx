import { useState } from 'react';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Fingerprint, ShieldAlert } from 'lucide-react';
import { authenticate, listEnrollments, isWebAuthnSupported } from '../../utils/webauthn';

interface BiometricGateProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  title?: string;
  description?: string;
  /** Called after successful biometric verification. */
  onVerified: () => void;
}

/**
 * Step-up biometric prompt. Triggers the platform authenticator via WebAuthn
 * and calls onVerified when the user passes. Treat this as a gate before any
 * sensitive action that requires a fresh presence check.
 */
export function BiometricGate({
  open,
  onOpenChange,
  userId,
  title = 'Verify your identity',
  description = 'This action requires biometric confirmation.',
  onVerified,
}: BiometricGateProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasEnrollment = listEnrollments(userId).length > 0;

  const handleVerify = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await authenticate(userId);
      if (result) {
        onOpenChange(false);
        onVerified();
      } else {
        setError('Verification cancelled');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Fingerprint className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {!isWebAuthnSupported() ? (
            <div className="flex items-start gap-3 p-3 rounded-md bg-red-50 border border-red-200">
              <ShieldAlert className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div className="text-sm text-red-800">
                This browser does not support WebAuthn. Upgrade your browser to use biometric verification.
              </div>
            </div>
          ) : !hasEnrollment ? (
            <div className="flex items-start gap-3 p-3 rounded-md bg-amber-50 border border-amber-200">
              <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                You haven't enrolled any authenticators yet. Go to <strong>Settings → Security</strong> to enroll this device first.
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center text-center gap-3 py-4">
              <div className="h-16 w-16 rounded-full bg-blue-50 flex items-center justify-center">
                <Fingerprint className="h-8 w-8 text-blue-600" />
              </div>
              <p className="text-sm text-gray-600 max-w-xs">
                Follow the prompt from your device — Touch ID, Face ID, Windows Hello, or a security key.
              </p>
            </div>
          )}

          {error && (
            <p className="mt-3 text-sm text-red-700 text-center">{error}</p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={handleVerify}
            disabled={busy || !isWebAuthnSupported() || !hasEnrollment}
          >
            <Fingerprint className="h-4 w-4 mr-2" />
            {busy ? 'Waiting for device…' : 'Verify'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
