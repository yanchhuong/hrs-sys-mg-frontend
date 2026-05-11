import * as XLSX from 'xlsx';

interface Employee {
  id: string;
  empNo?: string;
  name: string;
}

/**
 * Build an Excel template for the Attendance Records bulk-upload flow.
 *
 * Layout:
 *   Row 1 — Title (merged across all columns)
 *   Row 2 — Column headers
 *   Row 3 — Three pre-filled sample rows demonstrating common shapes:
 *           full 4-scan day, single-scan day, leave day.
 *   Row 6+ — One row per active employee, dated for the picked day, with
 *           the four punch columns left blank for HR to fill in.
 *
 * Columns:
 *   A  Employee No   – matched to {@code employees.empNo}; required
 *   B  Employee Name – display-only, helps the human filling in the file
 *   C  Date          – YYYY-MM-DD; required
 *   D  Morning In    – HH:mm; blank = no scan
 *   E  Morning Out   – HH:mm
 *   F  Noon In       – HH:mm
 *   G  Noon Out      – HH:mm
 *   H  Status        – optional override (present/late/absent/leave/...)
 *                      Backend derives status from punches when blank.
 *   I  Notes         – optional free-text remark
 */
export function downloadAttendanceTemplate(
  employees: Employee[],
  dateIso: string = new Date().toISOString().slice(0, 10),
) {
  const wb = XLSX.utils.book_new();
  const headers = [
    'Employee No',
    'Employee Name',
    'Date',
    'Morning In',
    'Morning Out',
    'Noon In',
    'Noon Out',
    'Status',
    'Notes',
  ];
  const rows: any[][] = [];

  // Title banner — explicit instructions so non-technical staff can fill
  // the file without referencing this code.
  rows.push(['Attendance Records — Upload Template']);
  rows.push(headers);

  // Sample rows demonstrating typical shapes. Status column is left
  // blank for the first two so the backend infers from punches; the
  // leave-day row sets it explicitly because there are no punches.
  rows.push(['EMP001', 'Sample — Full Day',   dateIso, '08:00', '12:00', '13:00', '17:00', '',      '']);
  rows.push(['EMP002', 'Sample — Single Scan', dateIso, '14:16', '',      '',      '',      '',      'Came in afternoon only']);
  rows.push(['EMP003', 'Sample — Leave',       dateIso, '',      '',      '',      '',      'leave', 'Annual leave — pre-approved']);

  // Pre-fill one blank row per active employee so HR doesn't retype
  // empNo/name 100 times. Date is set to the chosen day; punch columns
  // left blank for them to fill in.
  for (const emp of employees) {
    rows.push([emp.empNo ?? emp.id, emp.name, dateIso, '', '', '', '', '', '']);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Column widths sized to the header label so the file opens readable.
  ws['!cols'] = [
    { wch: 14 }, // Employee No
    { wch: 26 }, // Employee Name
    { wch: 12 }, // Date
    { wch: 10 }, // Morning In
    { wch: 10 }, // Morning Out
    { wch: 10 }, // Noon In
    { wch: 10 }, // Noon Out
    { wch: 12 }, // Status
    { wch: 30 }, // Notes
  ];

  // Title row spans every column.
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }];

  XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
  XLSX.writeFile(wb, `Attendance-Template-${dateIso}.xlsx`);
}
