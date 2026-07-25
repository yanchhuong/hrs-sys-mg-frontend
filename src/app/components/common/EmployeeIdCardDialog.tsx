import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Printer, User as UserIcon } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { useDateFormat } from '../../context/DateFormatContext';
import type { Employee } from '../../types/hrms';

interface Props {
  employee: Employee | null;
  companyName?: string;
  companyTagline?: string;
  companyLogo?: string | null;
  companyUrl?: string;
  /** Resolve an employee.department (UUID in live mode) to the human
   *  department name. Optional — falls through to the raw value when
   *  omitted, which is fine for mock mode where department already
   *  holds the name. */
  deptName?: (idOrName: string | undefined) => string;
  onOpenChange: (open: boolean) => void;
}

/**
 * Printable employee ID card. Portrait "credit-card-ish" layout with
 * a wave header (brand color), portrait photo, name + role, key
 * personal-data rows (ID, DOB, Email, Phone, Join Date) and a QR
 * code in the footer that resolves to the employee's ID string —
 * enough for a lanyard scan to look them up.
 *
 * Print: uses @media print via a temp class on <body> so only the
 * card renders on paper, sized to a standard ~54x86mm ID card.
 */
export function EmployeeIdCardDialog({
  employee, companyName, companyTagline, companyLogo, companyUrl, deptName, onOpenChange,
}: Props): JSX.Element {
  const { formatDate } = useDateFormat();
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const qrPayload = useMemo(() => {
    if (!employee) return '';
    return `EMP:${employee.empNo || employee.id}`;
  }, [employee]);

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

  const open = employee != null;
  if (!employee) {
    return <Dialog open={false} onOpenChange={onOpenChange}><DialogContent /></Dialog>;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 py-3 border-b print:hidden flex flex-row items-center justify-between space-y-0">
          <DialogTitle>Employee ID Card</DialogTitle>
          {/* Print icon-button sits next to the title so operators
              can trigger the print without hunting for a footer.
              The X close is added automatically by DialogContent
              on the far right. */}
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
          {/* The card itself. Everything inside .emp-id-card is what
              prints; siblings hide behind @media print rules
              scoped by body.printing-id-card. */}
          <div
            className="emp-id-card relative bg-white shadow-lg rounded-xl overflow-hidden text-gray-900"
            style={{ width: '260px', minHeight: '410px' }}
          >
            {/* Wave header */}
            <div className="relative h-28 bg-gradient-to-br from-blue-600 to-blue-700">
              <svg
                className="absolute bottom-0 left-0 w-full h-8"
                viewBox="0 0 260 32" preserveAspectRatio="none" aria-hidden
              >
                <path d="M0,20 C60,0 200,40 260,10 L260,32 L0,32 Z" fill="#ffffff" />
                <path d="M0,26 C60,6 200,46 260,16 L260,32 L0,32 Z" fill="#93c5fd" opacity="0.6" />
              </svg>
              <div className="absolute top-3 left-4 right-4 flex items-center gap-2 text-white">
                {companyLogo ? (
                  <img src={companyLogo} alt="" className="h-6 w-6 rounded bg-white/10 object-contain p-0.5" />
                ) : (
                  <div className="h-6 w-6 rounded bg-white/20 flex items-center justify-center text-[10px] font-bold">
                    {(companyName ?? 'HR').slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="leading-tight">
                  <div className="text-xs font-bold uppercase tracking-wide">{companyName ?? 'SMRT HRMS'}</div>
                  {companyTagline && (
                    <div className="text-[9px] opacity-90 uppercase tracking-wider">{companyTagline}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Photo */}
            <div className="flex justify-center -mt-8 relative z-10">
              {employee.profileImage ? (
                <img
                  src={employee.profileImage}
                  alt=""
                  className="h-24 w-24 rounded-lg object-cover border-4 border-white shadow-md bg-gray-50"
                  draggable={false}
                />
              ) : (
                <div className="h-24 w-24 rounded-lg border-4 border-white shadow-md bg-gray-100 flex items-center justify-center text-gray-400">
                  <UserIcon className="h-10 w-10" />
                </div>
              )}
            </div>

            {/* Name + role */}
            <div className="text-center px-4 mt-2">
              <div className="font-bold text-base leading-tight">{employee.name}</div>
              <div className="text-xs text-gray-600 leading-tight">{employee.position || '—'}</div>
            </div>

            {/* Data rows */}
            <div className="mx-4 mt-3 rounded-lg bg-gray-50 border border-gray-100 p-2.5 text-[11px] leading-tight space-y-1">
              <Row label="ID No"      value={employee.empNo || employee.id} mono />
              {employee.dateOfBirth && (
                <Row label="DOB"      value={formatDate(employee.dateOfBirth)} />
              )}
              <Row label="Dept"       value={deptName ? deptName(employee.department) : (employee.department || '—')} />
              <Row label="Join Date"  value={employee.joinDate ? formatDate(employee.joinDate) : '—'} />
              {employee.email && <Row label="Email" value={employee.email} truncate />}
              {employee.contactNumber && <Row label="Phone" value={employee.contactNumber} />}
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
            <div className="mt-3 py-2 bg-blue-600 text-white text-center text-[11px] font-medium">
              {companyUrl ?? companyName ?? 'SMRT HRMS'}
            </div>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, mono, truncate }: { label: string; value: string; mono?: boolean; truncate?: boolean }) {
  return (
    <div className="flex gap-2 items-baseline">
      <span className="w-16 text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-500">:</span>
      <span className={`flex-1 ${mono ? 'font-mono' : ''} ${truncate ? 'truncate' : ''}`} title={truncate ? value : undefined}>
        {value}
      </span>
    </div>
  );
}
