import type { TriLang } from './moduleCategories';

/**
 * Drawn "screenshots" for the landing-page module cards — what each
 * screen looks like, filled with made-up demo data. Drawn rather than
 * captured: a real screenshot carries real customer and employee names,
 * which must never reach the marketing page, and it goes stale every
 * time the screen changes.
 *
 * A spec says which kind of screen it is and what is on it;
 * ModulePreview.tsx draws it inside a browser frame. Labels (tabs,
 * columns, statuses, buttons) follow the page language; the demo data
 * itself — names, numbers, document numbers — stays as data would.
 */

export type PreviewTone = 'green' | 'amber' | 'red' | 'blue' | 'slate';

/** One table cell: plain text, a name with a second line, a status
 *  chip, a right-aligned number, or a progress bar. */
export type PreviewCell =
  | string
  | { main: string; sub?: string; avatar?: string }
  | { chip: TriLang; tone: PreviewTone }
  | { num: string }
  | { progress: number; label?: string };

export interface PreviewColumn {
  label: TriLang;
  /** Numbers right-aligned, text left (the app-wide rule). */
  align?: 'right';
  /** Tailwind width class, e.g. 'w-[42%]'. */
  width?: string;
  /** Dropped on a phone, where four columns do not fit. */
  hideOnSmall?: boolean;
}

export type ModulePreviewSpec =
  | {
      kind: 'table';
      /** Shown in the frame's address bar after hr-share.com/. */
      path: string;
      /** The first is drawn as the selected one. */
      tabs?: TriLang[];
      action?: TriLang;
      columns: PreviewColumn[];
      rows: PreviewCell[][];
    }
  | {
      kind: 'doc';
      path: string;
      heading: TriLang;
      docNo: string;
      meta: TriLang;
      party: string;
      badge?: { label: TriLang; tone: PreviewTone };
      lines: { name: string; qty: string; amount: string }[];
      totalLabel?: TriLang;
      total: string;
      footer?: TriLang;
    }
  | {
      kind: 'tiles';
      path: string;
      title: TriLang;
      action?: TriLang;
      chips?: TriLang[];
      /** color: Tailwind gradient stops for the picture, e.g.
       *  'from-amber-300 to-orange-400'. */
      tiles: { name: string; sku: string; qty: string; color: string; low?: boolean }[];
    }
  | {
      kind: 'payment';
      path: string;
      merchant: string;
      amount: string;
      scanLabel: TriLang;
      listTitle: TriLang;
      methods: { label: TriLang; tone: PreviewTone; ref: string; amount: string }[];
    };

/* ───────────────────────── shared words ───────────────────────── */

const L = (en: string, km: string, zh: string): TriLang => ({ en, km, zh });

const PAID        = L('Paid', 'បានបង់', '已付');
const PARTIAL     = L('Partial', 'បង់ខ្លះ', '部分付款');
const UNPAID      = L('Unpaid', 'មិនទាន់បង់', '未付');
const OVERDUE     = L('Overdue', 'ហួសកំណត់', '逾期');
const CREDIT_NOTE = L('Credit note', 'ប័ណ្ណឥណទាន', '贷项通知');
const DEBIT_NOTE  = L('Debit note', 'ប័ណ្ណឥណពន្ធ', '借项通知');
const BUSINESS    = L('Business', 'អាជីវកម្ម', '企业');
const INDIVIDUAL  = L('Individual', 'បុគ្គល', '个人');
const ALL         = L('All', 'ទាំងអស់', '全部');
const STATUS      = L('Status', 'ស្ថានភាព', '状态');
const AMOUNT      = L('Amount', 'ចំនួនទឹកប្រាក់', '金额');

/* ───────────────────────── Accountant ───────────────────────── */

export const PREVIEW_CUSTOMERS: ModulePreviewSpec = {
  kind: 'table',
  path: 'customers',
  tabs: [L('Customers', 'អតិថិជន', '客户'), L('Vendors', 'អ្នកលក់', '供应商')],
  action: L('New', 'បង្កើតថ្មី', '新建'),
  columns: [
    { label: L('Name', 'ឈ្មោះ', '名称'), width: 'w-[44%]' },
    { label: L('Type', 'ប្រភេទ', '类型') },
    { label: L('TIN', 'លេខ TIN', 'TIN'), hideOnSmall: true },
    { label: L('Balance', 'សមតុល្យ', '余额'), align: 'right' },
  ],
  rows: [
    [{ main: 'Mekong Trading Co., Ltd.', sub: 'ក្រុមហ៊ុន មេគង្គ ពាណិជ្ជកម្ម', avatar: 'MT' }, { chip: BUSINESS, tone: 'blue' }, 'K001-902145876', { num: '$4,280.00' }],
    [{ main: 'Sok Dara', sub: 'សុខ តារា', avatar: 'SD' }, { chip: INDIVIDUAL, tone: 'slate' }, '—', { num: '$320.00' }],
    [{ main: 'Sunrise Mart', sub: 'Phnom Penh · 3 sites', avatar: 'SM' }, { chip: BUSINESS, tone: 'blue' }, 'K003-100562341', { num: '$12,940.50' }],
    [{ main: 'Chan Sophea', sub: 'ចាន់ សុភា', avatar: 'CS' }, { chip: INDIVIDUAL, tone: 'slate' }, '—', { num: '$0.00' }],
    [{ main: 'Angkor Supplies', sub: 'Siem Reap', avatar: 'AS' }, { chip: BUSINESS, tone: 'blue' }, 'K002-205871430', { num: '$1,175.00' }],
  ],
};

export const PREVIEW_QUOTATION: ModulePreviewSpec = {
  kind: 'doc',
  path: 'quotations/QT-2026-0142',
  heading: L('QUOTATION', 'សម្រង់តម្លៃ', '报价单'),
  docNo: 'QT-2026-0142',
  meta: L('Valid until 30 Nov 2026', 'មានសុពលភាពដល់ 30 វិច្ឆិកា 2026', '有效期至 2026-11-30'),
  party: 'Mekong Trading Co., Ltd.',
  badge: { label: L('Sent', 'បានផ្ញើ', '已发送'), tone: 'blue' },
  lines: [
    { name: 'Office chair · Ergo Pro', qty: '12', amount: '$1,440.00' },
    { name: 'Standing desk 140 cm', qty: '4', amount: '$880.00' },
    { name: 'Delivery & install', qty: '1', amount: '$130.00' },
  ],
  total: '$2,450.00',
  footer: L('Convert to invoice →', 'ប្តូរទៅវិក្កយបត្រ →', '转为发票 →'),
};

export const PREVIEW_INVOICES: ModulePreviewSpec = {
  kind: 'table',
  path: 'invoices',
  tabs: [ALL, UNPAID, OVERDUE],
  action: L('New invoice', 'វិក្កយបត្រថ្មី', '新建发票'),
  columns: [
    { label: L('Invoice', 'វិក្កយបត្រ', '发票'), width: 'w-[50%]' },
    { label: STATUS },
    { label: AMOUNT, align: 'right' },
  ],
  rows: [
    [{ main: 'INV-2026-0318', sub: 'Sunrise Mart · 05 Nov' }, { chip: PAID, tone: 'green' }, { num: '$3,120.00' }],
    [{ main: 'INV-2026-0317', sub: 'Mekong Trading · 04 Nov' }, { chip: PARTIAL, tone: 'amber' }, { num: '$1,860.00' }],
    [{ main: 'CN-2026-0012', sub: 'Sok Dara · 03 Nov' }, { chip: CREDIT_NOTE, tone: 'blue' }, { num: '−$120.00' }],
    [{ main: 'INV-2026-0309', sub: 'Angkor Supplies · 21 Oct' }, { chip: OVERDUE, tone: 'red' }, { num: '$940.00' }],
    [{ main: 'INV-2026-0305', sub: 'Golden Rice Co. · 18 Oct' }, { chip: PAID, tone: 'green' }, { num: '$5,400.00' }],
  ],
};

export const PREVIEW_BILLS: ModulePreviewSpec = {
  kind: 'table',
  path: 'bills',
  tabs: [L('Bills', 'វិក្កយបត្រទិញ', '账单'), L('Receipts', 'បង្កាន់ដៃ', '收据')],
  action: L('New bill', 'វិក្កយបត្រទិញថ្មី', '新建账单'),
  columns: [
    { label: L('Bill', 'វិក្កយបត្រ', '账单'), width: 'w-[42%]' },
    { label: L('Due', 'ផុតកំណត់', '到期'), hideOnSmall: true },
    { label: STATUS },
    { label: AMOUNT, align: 'right' },
  ],
  rows: [
    [{ main: 'BILL-0921', sub: 'Angkor Steel' }, '12 Nov', { chip: UNPAID, tone: 'amber' }, { num: '$7,800.00' }],
    [{ main: 'BILL-0920', sub: 'Phnom Penh Water' }, '08 Nov', { chip: PAID, tone: 'green' }, { num: '$186.40' }],
    [{ main: 'RCP-0412', sub: 'WHT 15% · Office rent' }, '01 Nov', { chip: PAID, tone: 'green' }, { num: '$1,500.00' }],
    [{ main: 'BILL-0915', sub: 'City Logistics' }, '28 Oct', { chip: OVERDUE, tone: 'red' }, { num: '$640.00' }],
    [{ main: 'DN-0007', sub: 'Angkor Steel' }, '27 Oct', { chip: DEBIT_NOTE, tone: 'slate' }, { num: '$75.00' }],
  ],
};

export const PREVIEW_ITEMS: ModulePreviewSpec = {
  kind: 'tiles',
  path: 'items',
  title: L('Items', 'ទំនិញ', '商品'),
  action: L('New item', 'ទំនិញថ្មី', '新建商品'),
  chips: [ALL, L('Drinks', 'ភេសជ្ជៈ', '饮品'), L('Food', 'អាហារ', '食品'), L('Office', 'ការិយាល័យ', '办公')],
  tiles: [
    { name: 'Iced latte', sku: 'DRK-014', qty: '48', color: 'from-amber-300 to-orange-500' },
    { name: 'Jasmine rice 25kg', sku: 'FOD-002', qty: '120', color: 'from-lime-200 to-emerald-400' },
    { name: 'Office chair', sku: 'OFC-031', qty: '3', color: 'from-sky-300 to-blue-500', low: true },
    { name: 'Notebook A5', sku: 'OFC-118', qty: '340', color: 'from-violet-300 to-indigo-500' },
    { name: 'Coconut water', sku: 'DRK-022', qty: '72', color: 'from-teal-200 to-cyan-500' },
    { name: 'Num pang', sku: 'FOD-019', qty: '0', color: 'from-rose-300 to-red-500', low: true },
  ],
};

export const PREVIEW_PAYMENTS: ModulePreviewSpec = {
  kind: 'payment',
  path: 'payments',
  merchant: 'Sunrise Mart',
  amount: '$86.50',
  scanLabel: L('Scan with any bank app', 'ស្កេនដោយកម្មវិធីធនាគារណាមួយ', '任意银行 App 扫码'),
  listTitle: L("Today's payments", 'ការទូទាត់ថ្ងៃនេះ', '今日收款'),
  methods: [
    { label: L('KHQR', 'KHQR', 'KHQR'), tone: 'red', ref: 'INV-2026-0321', amount: '$86.50' },
    { label: L('Cash', 'សាច់ប្រាក់', '现金'), tone: 'green', ref: 'INV-2026-0320', amount: '$42.00' },
    { label: L('Bank', 'ធនាគារ', '银行'), tone: 'blue', ref: 'INV-2026-0317', amount: '$1,200.00' },
    { label: L('Card', 'កាត', '刷卡'), tone: 'slate', ref: 'INV-2026-0316', amount: '$65.00' },
    { label: L('KHQR', 'KHQR', 'KHQR'), tone: 'red', ref: 'INV-2026-0315', amount: '$318.75' },
  ],
};

export const PREVIEW_VOUCHERS: ModulePreviewSpec = {
  kind: 'doc',
  path: 'vouchers/VC-2026-0031',
  heading: L('DONATION VOUCHER', 'ប័ណ្ណអំណោយ', '捐赠凭单'),
  docNo: 'VC-2026-0031',
  meta: L('Purpose: Donation', 'គោលបំណង៖ អំណោយ', '用途：捐赠'),
  party: 'Kampong Cham Primary School',
  badge: { label: L('Approved', 'បានអនុម័ត', '已批准'), tone: 'green' },
  lines: [
    { name: 'School bag', qty: '50', amount: '$750.00' },
    { name: 'Notebook A5 (pack of 10)', qty: '40', amount: '$400.00' },
    { name: 'Water filter', qty: '2', amount: '$100.00' },
  ],
  totalLabel: L('Value · free of charge', 'តម្លៃ · ឥតគិតថ្លៃ', '价值 · 免费'),
  total: '$1,250.00',
  footer: L('Print voucher', 'បោះពុម្ពប័ណ្ណ', '打印凭单'),
};

export const PREVIEW_CONSIGNMENT: ModulePreviewSpec = {
  kind: 'table',
  path: 'consignment',
  tabs: [L('Open', 'កំពុងដំណើរការ', '进行中'), L('Settled', 'បានទូទាត់', '已结算')],
  action: L('Settle', 'ទូទាត់', '结算'),
  columns: [
    { label: L('Outlet', 'ហាង', '门店'), width: 'w-[42%]' },
    { label: L('Sell-through', 'បានលក់', '售出') },
    { label: L('To settle', 'ត្រូវទូទាត់', '待结算'), align: 'right' },
  ],
  rows: [
    [{ main: 'Sunrise Mart · BKK', sub: 'Consigned 200 pcs' }, { progress: 78, label: '156 sold' }, { num: '$1,872.00' }],
    [{ main: 'Riverside Kiosk', sub: 'Consigned 80 pcs' }, { progress: 45, label: '36 sold' }, { num: '$432.00' }],
    [{ main: 'Angkor Gift Shop', sub: 'Consigned 120 pcs' }, { progress: 92, label: '110 sold' }, { num: '$1,320.00' }],
    [{ main: 'Airport Outlet', sub: 'Consigned 60 pcs' }, { progress: 20, label: '12 sold' }, { num: '$144.00' }],
  ],
};
