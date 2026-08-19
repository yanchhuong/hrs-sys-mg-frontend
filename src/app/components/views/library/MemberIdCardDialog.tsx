/**
 * V-library-member-id-card — printable member card in the same
 * visual language as EmployeeIdCardDialog. Portrait card, wave
 * header + company banner, name + type, data rows, QR code (payload
 * "MEM:{memberNo}") and a footer strip.
 *
 * <p>Print uses the shared {@code printing-id-card} body class the
 * Employee card already introduced — same @media print CSS covers
 * both surfaces, so nothing new lands in index.css.</p>
 */

import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Printer, User as UserIcon, BadgeCheck } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { useDateFormat } from '../../../context/DateFormatContext';
import type { Member } from '../../../api/library';

interface Props {
  member: Member | null;
  companyName?: string;
  companyTagline?: string;
  companyLogo?: string | null;
  companyUrl?: string;
  onOpenChange: (open: boolean) => void;
}

export function MemberIdCardDialog({
  member, companyName, companyTagline, companyLogo, companyUrl, onOpenChange,
}: Props) {
  const { formatDate } = useDateFormat();
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const qrPayload = useMemo(() => {
    if (!member) return '';
    return `MEM:${member.memberNo || member.id}`;
  }, [member]);

  useEffect(() => {
    if (!qrPayload) { setQrDataUrl(''); return; }
    QRCode.toDataURL(qrPayload, { margin: 0, width: 128 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [qrPayload]);

  const doPrint = () => {
    document.body.classList.add('printing-id-card');
    const cleanup = () => {
      document.body.classList.remove('printing-id-card');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
  };

  const open = member != null;
  if (!member) {
    return <Dialog open={false} onOpenChange={onOpenChange}><DialogContent /></Dialog>;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 py-3 border-b print:hidden flex flex-row items-center justify-between space-y-0">
          <DialogTitle>Member ID Card</DialogTitle>
          <Button
            size="icon"
            variant="ghost"
            onClick={doPrint}
            className="h-8 w-8 mr-6"
            title="Print ID card"
            aria-label="Print ID card"
          >
            <Printer className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <div className="flex justify-center bg-gray-100 py-6 px-4 print:p-0 print:bg-white">
          {/* Class name MUST stay `emp-id-card` — the print stylesheet
              in index.css scopes visibility on that selector so this
              card prints exactly like the Employee card. */}
          <div
            className="emp-id-card relative bg-white shadow-lg rounded-xl overflow-hidden text-gray-900"
            style={{ width: '260px', minHeight: '410px' }}
          >
            {/* Wave header — indigo-blue tint so members and employees
                are visually distinct at a glance while sharing the
                same layout. */}
            <div className="relative h-28 bg-gradient-to-br from-indigo-600 to-indigo-700">
              <svg
                className="absolute bottom-0 left-0 w-full h-8"
                viewBox="0 0 260 32" preserveAspectRatio="none" aria-hidden
              >
                <path d="M0,20 C60,0 200,40 260,10 L260,32 L0,32 Z" fill="#ffffff" />
                <path d="M0,26 C60,6 200,46 260,16 L260,32 L0,32 Z" fill="#a5b4fc" opacity="0.6" />
              </svg>
              <div className="absolute top-3 left-4 right-4 flex items-center gap-2 text-white">
                {companyLogo ? (
                  <img src={companyLogo} alt="" className="h-6 w-6 rounded bg-white/10 object-contain p-0.5" />
                ) : (
                  <div className="h-6 w-6 rounded bg-white/20 flex items-center justify-center text-[10px] font-bold">
                    {(companyName ?? 'MB').slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="leading-tight">
                  <div className="text-xs font-bold uppercase tracking-wide">{companyName ?? 'MEMBERSHIP'}</div>
                  {companyTagline && (
                    <div className="text-[9px] opacity-90 uppercase tracking-wider">{companyTagline}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Avatar — uses the uploaded profile_image (V336) when
                present; falls back to a neutral silhouette so cards
                for members without a photo still print cleanly.
                Active members get a small verified check overlay in
                the bottom-right of the avatar (V-library-member-
                verified-badge) — same visual language social apps
                use, driven purely off member.status so it disappears
                automatically once the membership lapses. */}
            <div className="flex justify-center -mt-8 relative z-10">
              <div className="relative">
                {member.profileImage ? (
                  <img
                    src={member.profileImage}
                    alt=""
                    className="h-24 w-24 rounded-lg object-cover border-4 border-white shadow-md bg-gray-50"
                  />
                ) : (
                  <div className="h-24 w-24 rounded-lg bg-gray-50 border-4 border-white shadow-md flex items-center justify-center">
                    <UserIcon className="h-10 w-10 text-gray-400" />
                  </div>
                )}
                {member.status === 'active' && (
                  <BadgeCheck
                    className="absolute -bottom-1 -right-1 h-6 w-6 text-indigo-600 bg-white rounded-full"
                    strokeWidth={2.5}
                    aria-label="Verified active member"
                  />
                )}
              </div>
            </div>

            {/* Name + type */}
            <div className="text-center px-4 mt-2">
              <div className="font-bold text-base leading-tight">{member.name}</div>
              <div className="text-xs text-gray-600 leading-tight">
                {member.membershipType ?? 'Member'}
              </div>
            </div>

            {/* Data rows */}
            <div className="mx-4 mt-3 rounded-lg bg-gray-50 border border-gray-100 p-2.5 text-[11px] leading-tight space-y-1">
              <Row label="ID No"     value={member.memberNo || member.id} mono />
              <Row label="Type"      value={member.membershipType || '—'} />
              <Row label="Effective" value={member.effectiveDate ? formatDate(member.effectiveDate) : '—'} />
              <Row label="Expiry"    value={member.expiryDate    ? formatDate(member.expiryDate)    : '—'} />
              {member.phone && <Row label="Phone" value={member.phone} />}
              {member.email && <Row label="Email" value={member.email} truncate />}
            </div>

            {/* QR + signature */}
            <div className="flex items-center justify-between px-4 mt-3">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="" className="h-14 w-14 bg-white" />
              ) : (
                <div className="h-14 w-14 bg-gray-100 border border-gray-200" />
              )}
              <div className="text-right">
                <div className="text-[10px] text-gray-500 italic">Signature</div>
                <div className="h-6 border-b border-gray-300 w-24" />
              </div>
            </div>

            {/* Footer */}
            <div className="mt-3 py-2 bg-indigo-600 text-white text-center text-[11px] font-medium">
              {companyUrl ?? companyName ?? 'Membership'}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, mono, truncate }: { label: string; value: string; mono?: boolean; truncate?: boolean }) {
  return (
    // items-start so a long email that wraps to a second line
    // keeps its label anchored at the top of the row.
    <div className="flex gap-2 items-start">
      <span className="w-16 text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-500">:</span>
      <span
        className={`flex-1 ${mono ? 'font-mono' : ''} ${truncate ? 'break-all' : ''}`}
        title={truncate ? value : undefined}
      >
        {value}
      </span>
    </div>
  );
}
