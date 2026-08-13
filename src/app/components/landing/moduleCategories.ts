import {
  Users, Clock, DollarSign, TimerIcon, BarChart3, Cloud, Fingerprint,
  Receipt, Languages, Network, RefreshCw, FileSpreadsheet,
  ShieldCheck, FileText, Calculator, Scale, BookOpen,
  ShoppingCart, ShoppingBag, Package, Megaphone, Send,
  MonitorPlay, KeyRound, UserCheck, FileMinus, TrendingUp,
  QrCode, Wallet, Stethoscope, GraduationCap, CalendarDays,
  Bell, ClipboardList, Pill, TestTube, HeartPulse, School,
  Baby, BookMarked, Award, Bus, Layers, BadgeCheck,
  Printer, Barcode, ScanLine, Utensils, MapPin, CreditCard,
  CalendarClock, CalendarCheck, RotateCw, Globe,
} from 'lucide-react';
import type { ComponentType } from 'react';

/** Category-level tint. Drives the banner background, module-card
 *  icon chip, and category accent text across the grid. */
export type Tone =
  | 'blue' | 'emerald' | 'amber' | 'indigo' | 'rose'
  | 'violet' | 'cyan' | 'slate' | 'teal' | 'fuchsia';

export interface TriLang {
  en: string;
  km: string;
  zh: string;
}

export interface LandingModule {
  icon: ComponentType<{ className?: string }>;
  title: TriLang;
  desc: TriLang;
}

export interface LandingCategory {
  key: string;
  icon: ComponentType<{ className?: string }>;
  tone: Tone;
  title: TriLang;
  desc: TriLang;
  modules: LandingModule[];
  /** Optional footer note rendered under the category's module grid.
   *  Used e.g. on Accountant to cross-link to POS ("See also: POS").
   *  Keep to one short line — anything longer belongs in a real module. */
  crossLink?: {
    label: TriLang;
    /** Anchor id of the target category, prefixed with `#`. Example:
     *  `#cat-pos` scrolls to the POS category header. */
    href: string;
  };
}

/** Landing-page module catalog. Newest business categories first —
 *  Accountant, HR Administration, POS, School, Healthcare, Booking —
 *  followed by two horizontal capabilities (Reports & Analytics,
 *  Platform & Integrations) that span every vertical. Adding a new
 *  category = push a new entry into this array; no JSX to touch. */
export const LANDING_CATEGORIES: LandingCategory[] = [
  /* ────────────────────────────────────────────────────────────────
   * 1. Accountant — sales, purchases, stock, ledger.
   *    POS is intentionally NOT a module here (it's its own
   *    top-level category); cross-linked at the bottom.
   * ──────────────────────────────────────────────────────────────── */
  {
    key: 'accountant',
    icon: BookOpen,
    tone: 'emerald',
    title: { en: 'Accountant', km: 'គណនេយ្យករ', zh: '会计' },
    desc: {
      en: 'Sales, purchases, stock, and the ledger behind them — one continuous Profit & Loss, no period close required.',
      km: 'លក់ ទិញ ស្តុក និងបញ្ជីនៅពីក្រោយ — ប្រាក់ចំណេញ-ខាតបន្តជានិច្ច។',
      zh: '销售、采购、库存与背后的台账 — 持续损益，无需关账。',
    },
    modules: [
      {
        icon: UserCheck,
        title: { en: 'Customers & Vendors', km: 'អតិថិជន និងអ្នកលក់', zh: '客户与供应商' },
        desc: {
          en: 'Individual + business parties with TIN, representative, multi-site address, and bilingual names for the printed invoice.',
          km: 'បុគ្គល + អាជីវកម្ម ជាមួយ TIN អ្នកតំណាង អាសយដ្ឋានច្រើនទីតាំង និងឈ្មោះខ្មែរ-អង់គ្លេស។',
          zh: '个人 + 企业双类型；含 TIN、代表人、多地址与发票打印用的双语名称。',
        },
      },
      {
        icon: FileText,
        title: { en: 'Quotation', km: 'សម្រង់តម្លៃ', zh: '报价单' },
        desc: {
          en: 'Pre-sale quotes with expiry, line items, and one-click convert-to-Invoice. Optional Telegram delivery to the customer.',
          km: 'សម្រង់តម្លៃជាមួយកាលបរិច្ឆេទផុតកំណត់ បន្ទាត់ទំនិញ និងការប្តូរទៅវិក្កយបត្រដោយចុចតែម្តង។',
          zh: '预销售报价单 — 含有效期、明细行和一键转开发票，可选向客户推送 Telegram。',
        },
      },
      {
        icon: Receipt,
        title: { en: 'Invoices (Commercial · Tax · CN/DN)', km: 'វិក្កយបត្រ (ពាណិជ្ជ · អាករ · CN/DN)', zh: '发票（商业·税务·CN/DN）' },
        desc: {
          en: 'Issue, void, and adjust invoices with Credit/Debit Notes. Auto-numbering, AR tracking, partial/paid/overdue states.',
          km: 'បោះផ្សាយ បោះបង់ និងកែតម្រូវវិក្កយបត្រដោយ Credit/Debit Note។ លេខស្វ័យប្រវត្តិ ការតាមដាន AR។',
          zh: '开具、作废并通过信用/借记凭证调整发票。自动编号、应收跟踪、部分付款/已付/逾期状态。',
        },
      },
      {
        icon: ShoppingBag,
        title: { en: 'Bills & Receipts (Purchase)', km: 'វិក្កយបត្រទិញ និងបង្កាន់ដៃ', zh: '账单与收据（采购）' },
        desc: {
          en: 'Vendor bills with CN/DN, single-amount WHT receipts, and AP tracking — the symmetric purchase-side of the sale ledger.',
          km: 'វិក្កយបត្រអ្នកលក់ជាមួយ CN/DN បង្កាន់ដៃពន្ធ WHT ទម្រង់តែមួយ និងការតាមដាន AP។',
          zh: '含 CN/DN 的供应商账单、单笔预扣税收据，以及与销售台账对称的应付跟踪。',
        },
      },
      {
        icon: Package,
        title: { en: 'Items & Stock', km: 'ទំនិញ និងស្តុក', zh: '商品与库存' },
        desc: {
          en: 'Per-item picture, SKU, category, modifier groups, on-hand qty, cost basis, and per-doc deduction toggle so back-orders never slip through.',
          km: 'រូបភាពទំនិញ SKU ប្រភេទ ក្រុមកែប្រែ បរិមាណក្នុងស្តុក និងការកាត់ស្តុកតាមឯកសារ។',
          zh: '商品图片、SKU、分类、修饰项组、库存数量、成本及按单据扣减开关，杜绝缺货漏单。',
        },
      },
      {
        icon: Wallet,
        title: { en: 'Payments (KHQR + Bank + Cash)', km: 'ការទូទាត់ (KHQR + ធនាគារ + សាច់ប្រាក់)', zh: '收付款（KHQR + 银行 + 现金）' },
        desc: {
          en: 'Record cash, bank, and card payments; show KHQR on the customer screen for scan-to-pay; PayWay (ABA) real-time gateway.',
          km: 'កត់ត្រាសាច់ប្រាក់ + ធនាគារ + កាត; បង្ហាញ KHQR លើអេក្រង់អតិថិជន; ភ្ជាប់ PayWay (ABA) ពេលវេលាជាក់ស្តែង។',
          zh: '记录现金/银行/卡支付；客显展示 KHQR 扫码；与 PayWay（ABA）实时网关对接。',
        },
      },
      {
        icon: FileMinus,
        title: { en: 'Vouchers', km: 'ប័ណ្ណផ្តល់', zh: '凭单' },
        desc: {
          en: 'Free-of-charge giveaways: charity, donation, sponsorship, promo — printed with the right per-purpose title and customer block.',
          km: 'ប័ណ្ណផ្តល់ឥតគិតថ្លៃ៖ សប្បុរសធម៌ អំណោយ ឧបត្ថម្ភ ប្រូម៉ូសិន។ បោះពុម្ពតាមចំណងជើងសម្រាប់គោលបំណង។',
          zh: '免费赠送：慈善、捐赠、赞助、推广等，按用途自动套用对应抬头与客户区块。',
        },
      },
      {
        icon: FileSpreadsheet,
        title: { en: 'Consignment & Settlement', km: 'ការផ្ញើ និងការទូទាត់', zh: '寄售与结算' },
        desc: {
          en: 'Consign stock to a partner outlet, track sell-through, and settle at period end — one document per settlement, print-ready.',
          km: 'ផ្ញើស្តុកទៅដៃគូលក់ តាមដានការលក់ និងទូទាត់ចុងរយៈពេល — ឯកសារតែមួយក្នុងការទូទាត់នីមួយៗ។',
          zh: '将库存寄售至合作门店，跟踪售出情况，并按期结算 — 每笔结算一份可打印文档。',
        },
      },
    ],
    crossLink: {
      label: {
        en: 'See also: POS — the counter-side checkout experience →',
        km: 'មើលបន្ថែម៖ POS — បទពិសោធការទូទាត់នៅបញ្ជរ →',
        zh: '另见：POS — 门店收银端体验 →',
      },
      href: '#cat-pos',
    },
  },

  /* ────────────────────────────────────────────────────────────────
   * 2. HR Administration — HR Management + Payroll merged.
   * ──────────────────────────────────────────────────────────────── */
  {
    key: 'hr-administration',
    icon: Users,
    tone: 'blue',
    title: { en: 'HR Administration', km: 'រដ្ឋបាលធនធានមនុស្ស', zh: '人力资源管理' },
    desc: {
      en: 'People, time, policy, and payroll — one source of truth from onboarding to payday, Cambodia-compliant out of the box.',
      km: 'បុគ្គលិក ពេលវេលា គោលនយោបាយ និងប្រាក់ខែ — ប្រភពទិន្នន័យតែមួយ អនុលោមតាមច្បាប់កម្ពុជា។',
      zh: '员工、考勤、政策与薪资 — 从入职到发薪的唯一数据来源，开箱即合规。',
    },
    modules: [
      {
        icon: Users,
        title: { en: 'Employee Management', km: 'គ្រប់គ្រងបុគ្គលិក', zh: '员工管理' },
        desc: {
          en: 'Profiles, documents, dependents, residency, NSSF number, bank account, bilingual Khmer + English names.',
          km: 'ប្រវត្តិរូប ឯកសារ អ្នកនៅក្នុងបន្ទុក ស្ថានភាពអ្នករស់នៅ លេខ ប.ស.ស គណនីធនាគារ និងឈ្មោះខ្មែរ-អង់គ្លេស។',
          zh: '个人档案、文件、被扶养人、居民身份、ប.ស.ស 号、银行账户与柬英双语姓名。',
        },
      },
      {
        icon: Network,
        title: { en: 'Department & Group', km: 'នាយកដ្ឋាន និងក្រុម', zh: '部门与分组' },
        desc: {
          en: 'Organise by department, location, or custom groups. Roll up headcount + attendance + payroll per unit.',
          km: 'រៀបចំតាមនាយកដ្ឋាន ទីតាំង ឬក្រុមផ្ទាល់ខ្លួន។ សរុបចំនួនបុគ្គលិក វត្តមាន និងប្រាក់ខែតាមឯកតា។',
          zh: '按部门、地点或自定义分组组织。可按单元汇总人数、考勤与薪资。',
        },
      },
      {
        icon: Clock,
        title: { en: 'Attendance Tracking', km: 'តាមដានវត្តមាន', zh: '考勤追踪' },
        desc: {
          en: 'Daily punches, weekend & holiday rules, late thresholds, lunch deductions, flexible schedules — one source of truth for every clock-in.',
          km: 'ម៉ោងចូលចេញ ច្បាប់ចុងសប្តាហ៍ និងថ្ងៃបុណ្យ កំណត់យឺត ការដកម៉ោងសម្រាប់អាហារ និងកាលវិភាគទន់ភ្លន់។',
          zh: '每日打卡、周末/节假日规则、迟到阈值、午休扣减及弹性班次。',
        },
      },
      {
        icon: Fingerprint,
        title: { en: 'Multi-Device & QR Check-In', km: 'ឧបករណ៍ច្រើន និង QR Check-In', zh: '多设备与扫码打卡' },
        desc: {
          en: 'ZKTeco fingerprint, dynamic daily QR (encrypted), and Telegram self-check-in — all feeding one attendance table.',
          km: 'ស្នាមម្រាមដៃ ZKTeco, QR ប្រចាំថ្ងៃ (បានកូដនីយកម្ម), និងការ Check-In តាម Telegram — បញ្ចូលក្នុងតារាងវត្តមានតែមួយ។',
          zh: 'ZKTeco 指纹、加密的动态每日 QR 码以及 Telegram 自助打卡 — 全部写入同一张考勤表。',
        },
      },
      {
        icon: TimerIcon,
        title: { en: 'Overtime & Leave', km: 'ម៉ោងបន្ថែម និងការឈប់សម្រាក', zh: '加班与请假' },
        desc: {
          en: 'Request → approve → pay overtime at 2× / 3× for weekends & holidays. Leave balances roll automatically; half-day leave supported.',
          km: 'ស្នើ → អនុម័ត → បើកម៉ោងបន្ថែម 2× / 3× សម្រាប់ចុងសប្តាហ៍ និងថ្ងៃបុណ្យ។ សមតុល្យឈប់សម្រាករំកិលស្វ័យប្រវត្តិ។',
          zh: '申请 → 审批 → 按周末 2×、节假日 3× 倍率发放加班费；请假余额自动滚转，支持半日请假。',
        },
      },
      {
        icon: RefreshCw,
        title: { en: 'Contract Renewal', km: 'ការបន្តកិច្ចសន្យា', zh: '合同续签' },
        desc: {
          en: 'Expiry tracking + advance reminders + one-click renewal with a full audit trail. Never miss a probation conversion again.',
          km: 'តាមដានកាលផុតកំណត់ + រំលឹកមុនពេលផុត + ការបន្តដោយចុចតែម្តង។ មិនខកខានការប្តូរសភាពបញ្ចប់សាកល្បងទៀតទេ។',
          zh: '到期跟踪 + 提前提醒 + 一键续签并保留完整审计记录。再也不会错过试用转正。',
        },
      },
      {
        icon: Megaphone,
        title: { en: 'Announcements', km: 'សេចក្តីប្រកាស', zh: '公告' },
        desc: {
          en: 'Broadcast to all employees, specific teams, or customers, with optional Telegram push and "Seen by" tracking.',
          km: 'ប្រកាសដល់បុគ្គលិកទាំងអស់ ក្រុមជាក់លាក់ ឬអតិថិជន ជាមួយការផ្ញើ Telegram និងតាមដាន "មើលដោយ"។',
          zh: '面向全员、特定团队或客户广播，可选 Telegram 推送，并跟踪"已读"。',
        },
      },
      {
        icon: CalendarDays,
        title: { en: 'Holidays Catalog', km: 'បញ្ជីថ្ងៃបុណ្យ', zh: '节假日目录' },
        desc: {
          en: 'Shared Cambodia public-holiday catalog maintained by the platform; tenants clone the year with one click — dates auto-shift.',
          km: 'បញ្ជីថ្ងៃបុណ្យជាតិកម្ពុជារួម ដែលរក្សាដោយវេទិកា; អតិថិជនចម្លងឆ្នាំដោយចុចតែម្តង — កាលបរិច្ឆេទរំកិលដោយស្វ័យប្រវត្តិ។',
          zh: '由平台维护的柬埔寨公共假日共享目录；租户一键克隆当年 — 日期自动滚转。',
        },
      },
      {
        icon: ShieldCheck,
        title: { en: 'NSSF-Compliant Tax-on-Salary', km: 'ពន្ធលើប្រាក់ខែ អនុលោម ប.ស.ស', zh: '符合 ប.ស.ស 的薪资税' },
        desc: {
          en: 'Cambodia ToS engine, ប.ស.ស tiers, fringe benefits at 20%, dependents, and foreign tax credit — statutory-correct out of the box.',
          km: 'ម៉ាស៊ីនពន្ធលើប្រាក់ខែកម្ពុជា ថ្នាក់ ប.ស.ស អត្ថប្រយោជន៍ 20% អ្នកនៅក្នុងបន្ទុក និងការដកពន្ធបរទេស។',
          zh: '柬埔寨薪资税引擎、ប.ស.ស 等级、20% 附加福利、被扶养人和外国税抵免 — 开箱即合规。',
        },
      },
      {
        icon: DollarSign,
        title: { en: 'Payroll & Payslip', km: 'ប្រាក់ខែ និងបង្កាន់ដៃ', zh: '薪资与工资单' },
        desc: {
          en: 'Batch preview before posting, multi-currency totals (KHR + USD), and PDF payslips ready for the employee inbox in Khmer or English.',
          km: 'មើលជាមុនមុនពេលបង្ហោះ សរុបពហុរូបិយប័ណ្ណ (រៀល + ដុល្លារ) និងបង្កាន់ដៃ PDF ភាសាខ្មែរ ឬអង់គ្លេស។',
          zh: '发布前批量预览、多币种合计（KHR + USD），柬文或英文 PDF 工资单。',
        },
      },
      {
        icon: TrendingUp,
        title: { en: 'Earnings, Increases & Deductions', km: 'ប្រាក់ចំណូល ការដំឡើង និងការកាត់', zh: '收入、加薪与扣款' },
        desc: {
          en: 'Bonuses, allowances, salary increases, advances, and recurring deductions — all roll forward into the next cycle without re-keying.',
          km: 'ប្រាក់រង្វាន់ ប្រាក់បន្ថែម ការដំឡើងប្រាក់ខែ ប្រាក់បង់មុន និងការកាត់រាល់ខែ — បន្តដោយមិនវាយឡើងវិញ។',
          zh: '奖金、津贴、加薪、预支与定期扣款 — 均可结转至下一周期,无需重新录入。',
        },
      },
      {
        icon: Calculator,
        title: { en: 'Benefit Calculator', km: 'ម៉ាស៊ីនគណនាអត្ថប្រយោជន៍', zh: '福利计算器' },
        desc: {
          en: 'Severance / Indemnity, ប.ស.ស contributions, FdC simulators — answer "how much will it cost?" before the conversation, not after.',
          km: 'ប្រាក់សំណង/ឧបត្ថម្ភ វិភាគទាន ប.ស.ស និងម៉ាស៊ីនគណនា FdC — ឆ្លើយ "ថ្លៃប៉ុន្មាន?" មុនការសម្រេច។',
          zh: '遣散/补偿、ប.ស.ស 缴费、FdC 模拟器 — 在对话开始前就回答"会花多少钱"。',
        },
      },
    ],
  },

  /* ────────────────────────────────────────────────────────────────
   * 3. POS — the counter-side checkout experience.
   *    Promoted from a sub-module of Accounting to its own category.
   * ──────────────────────────────────────────────────────────────── */
  {
    key: 'pos',
    icon: ShoppingCart,
    tone: 'amber',
    title: { en: 'POS (Point of Sale)', km: 'POS (ការទូទាត់នៅបញ្ជរ)', zh: 'POS（门店收银）' },
    desc: {
      en: 'Front-of-house checkout, tuned for Cambodian shops and cafés — modifiers, KHQR scan-to-pay, thermal receipts, and a customer-facing screen.',
      km: 'ការទូទាត់ខាងមុខហាង តម្រូវសម្រាប់ហាងនិងកាហ្វេនៅកម្ពុជា — កែប្រែ KHQR ស្កេនបង់ បង្កាន់ដៃ Thermal។',
      zh: '为柬埔寨商店与咖啡店定制的前台收银 — 修饰项、KHQR 扫码支付、热敏小票及客显屏。',
    },
    modules: [
      {
        icon: ShoppingCart,
        title: { en: 'POS Terminal', km: 'POS Terminal', zh: 'POS 终端' },
        desc: {
          en: 'Counter cart with queue number, draft/hold, split checkout, and a fast keypad. Works on desktop and tablet.',
          km: 'រទេះទំនិញនៅបញ្ជរ ជាមួយលេខវង់ ការសន្សំ ការបំបែកទូទាត់ និង Keypad លឿន។',
          zh: '门店购物车 + 排号、暂存/挂单、拆单收银及快捷键盘，桌面与平板均可用。',
        },
      },
      {
        icon: Layers,
        title: { en: 'Modifiers & Options', km: 'កែប្រែ និងជម្រើស', zh: '修饰项与选项' },
        desc: {
          en: 'Size, sugar level, ice level, add-ons — configure once per item, apply on every sale. Price deltas roll into the total automatically.',
          km: 'ទំហំ កម្រិតស្ករ កម្រិតទឹកកក ការបន្ថែម — កំណត់មួយដងក្នុងទំនិញ ប្រើលើគ្រប់ការលក់។',
          zh: '尺寸、糖度、冰量、加料 — 每个商品配置一次，每笔销售自动套用，价差直接汇总。',
        },
      },
      {
        icon: MonitorPlay,
        title: { en: 'Customer Display', km: 'អេក្រង់សម្រាប់អតិថិជន', zh: '客显屏' },
        desc: {
          en: 'Second-screen mirror of the cart, live total, KHR equivalent, KHQR scan overlay, and an ads carousel between sales.',
          km: 'អេក្រង់ទីពីរបង្ហាញរទេះ ការសរុបផ្ទាល់ KHR ស្កេនបង់ KHQR និងការបង្ហាញពាណិជ្ជកម្មពេលគ្មានការលក់។',
          zh: '第二屏镜像购物车、实时总额、KHR 换算、KHQR 扫码支付覆盖层与空闲时的广告轮播。',
        },
      },
      {
        icon: QrCode,
        title: { en: 'KHQR Scan-to-Pay', km: 'KHQR ស្កេន-បង់', zh: 'KHQR 扫码支付' },
        desc: {
          en: 'Generate a Bakong-compliant QR per transaction; poll for settlement; auto-mark the sale paid when the bank confirms.',
          km: 'បង្កើត QR អនុលោមតាម Bakong ក្នុងការទូទាត់នីមួយៗ; តាមដានការទូទាត់; សម្គាល់ថាបានបង់ដោយស្វ័យប្រវត្តិ។',
          zh: '按笔生成符合 Bakong 规范的 QR，轮询结算，银行确认后自动标记已付。',
        },
      },
      {
        icon: Printer,
        title: { en: 'Thermal Receipt Printing', km: 'ការបោះពុម្ពបង្កាន់ដៃ Thermal', zh: '热敏小票打印' },
        desc: {
          en: '58 mm / 80 mm ESC/POS receipts with tenant logo, bilingual line items, and a KHQR footer for after-the-fact tipping.',
          km: 'បង្កាន់ដៃ 58 mm / 80 mm ESC/POS ជាមួយ Logo ខ្មែរ-អង់គ្លេស និង KHQR នៅជើងបង្កាន់ដៃ។',
          zh: '58 mm / 80 mm ESC/POS 小票，含租户 Logo、双语明细及底部 KHQR 便于事后打赏。',
        },
      },
      {
        icon: Barcode,
        title: { en: 'Barcode Scanner Support', km: 'គាំទ្រ Barcode Scanner', zh: '条码扫描器支持' },
        desc: {
          en: 'USB HID scanners work out of the box; camera-based decoding via @zxing WebAssembly for tablets without a physical scanner.',
          km: 'Scanner USB HID ដំណើរការភ្លាមៗ; ការឌិកូដតាមកាមេរ៉ាតាម @zxing WebAssembly សម្រាប់ Tablet។',
          zh: 'USB HID 扫描器开箱即用；无物理扫描器的平板可用 @zxing WebAssembly 摄像头解码。',
        },
      },
      {
        icon: ScanLine,
        title: { en: 'Queue & Order Number', km: 'លេខវង់ និងលេខការបញ្ជាទិញ', zh: '排号与订单号' },
        desc: {
          en: 'Auto-issue a queue number per sale; display on the customer screen; reset daily so the number stays short.',
          km: 'ចេញលេខវង់ស្វ័យប្រវត្តិក្នុងការលក់នីមួយៗ; បង្ហាញលើអេក្រង់អតិថិជន; កំណត់ឡើងវិញរាល់ថ្ងៃ។',
          zh: '每笔自动派发排号，客显同步显示，每日重置以保持号码简短。',
        },
      },
      {
        icon: Utensils,
        title: { en: 'Kitchen Display (KDS)', km: 'ការបង្ហាញផ្ទះបាយ (KDS)', zh: '厨房显示（KDS）' },
        desc: {
          en: 'Send drink/food orders to a kitchen tablet; mark "in progress" and "ready" from the KDS; barista sees only their queue.',
          km: 'ផ្ញើការបញ្ជាទិញភេសជ្ជៈ/អាហារទៅ Tablet ផ្ទះបាយ; សម្គាល់ "កំពុងធ្វើ" និង "រួចរាល់"។',
          zh: '将饮品/餐点订单发送至厨房平板；在 KDS 标记"进行中"与"完成"；调酒师只看自己队列。',
        },
      },
    ],
  },

  /* ────────────────────────────────────────────────────────────────
   * 4. School — student management, class + grade, fees.
   * ──────────────────────────────────────────────────────────────── */
  {
    key: 'school',
    icon: GraduationCap,
    tone: 'indigo',
    title: { en: 'School', km: 'សាលារៀន', zh: '学校' },
    desc: {
      en: 'Student roster, class scheduling, grade book, and fee collection — for primary schools, language centres, and vocational programmes.',
      km: 'បញ្ជីសិស្ស កាលវិភាគថ្នាក់ សៀវភៅពិន្ទុ និងការប្រមូលថ្លៃសិក្សា — សម្រាប់សាលាបឋមសិក្សា មជ្ឈមណ្ឌលភាសា និងវិជ្ជាជីវៈ។',
      zh: '学生名册、班级排课、成绩簿与学费收缴 — 面向小学、语言中心与职业培训。',
    },
    modules: [
      {
        icon: Baby,
        title: { en: 'Student Enrollment', km: 'ការចុះឈ្មោះសិស្ស', zh: '学生入学' },
        desc: {
          en: 'Application → interview → admission → student number. Parent contact, medical notes, and photo capture on the intake form.',
          km: 'ការដាក់ពាក្យ → សម្ភាសន៍ → ការចូលរៀន → លេខសិស្ស។ ព័ត៌មានទំនាក់ទំនងឪពុកម្តាយ កំណត់ត្រាវេជ្ជសាស្ត្រ។',
          zh: '申请 → 面试 → 录取 → 学号；表单含家长联系人、健康备注与照片采集。',
        },
      },
      {
        icon: School,
        title: { en: 'Class & Section', km: 'ថ្នាក់ និងក្រុម', zh: '班级与分组' },
        desc: {
          en: 'Multi-year, multi-level structure — Grade / Section / Homeroom teacher. Move students between sections mid-term without losing history.',
          km: 'ច្រើនឆ្នាំ ច្រើនកម្រិត — ថ្នាក់ / ក្រុម / គ្រូបង្ហាត់។ ផ្លាស់ប្តូរសិស្សរវាងក្រុមកណ្តាលឆមាស។',
          zh: '多学年多年级结构 — 年级/班级/班主任；期中可跨班调换而不丢失历史记录。',
        },
      },
      {
        icon: CalendarClock,
        title: { en: 'Timetable & Scheduling', km: 'តារាងម៉ោង', zh: '课表与排课' },
        desc: {
          en: 'Weekly timetable per class with room + teacher assignments. Conflict detection stops double-booking a teacher or a lab.',
          km: 'តារាងម៉ោងប្រចាំសប្តាហ៍តាមថ្នាក់ ជាមួយបន្ទប់ + គ្រូ។ រកឃើញការជាន់ស្មារតី។',
          zh: '按班级的周课表 — 教室 + 教师分配，冲突检测防止老师或实验室双重预约。',
        },
      },
      {
        icon: Clock,
        title: { en: 'Student Attendance', km: 'វត្តមានសិស្ស', zh: '学生考勤' },
        desc: {
          en: 'Homeroom marks per period; late/absent/excused states; parent Telegram push when a student misses first period.',
          km: 'គ្រូបង្ហាត់សម្គាល់តាមម៉ោង; យឺត/អវត្តមាន/សុំច្បាប់; ផ្ញើ Telegram ដល់ឪពុកម្តាយ។',
          zh: '按节次由班主任标记 — 迟到/缺席/请假状态；错过第一节自动 Telegram 通知家长。',
        },
      },
      {
        icon: BookMarked,
        title: { en: 'Grade Book & Report Card', km: 'សៀវភៅពិន្ទុ និងរបាយការណ៍', zh: '成绩簿与成绩单' },
        desc: {
          en: 'Per-subject scores across the term; weighted averages; printable Khmer + English report card with school logo and homeroom signature line.',
          km: 'ពិន្ទុប្រចាំមុខវិជ្ជាពេញឆមាស មធ្យមភាគ របាយការណ៍បោះពុម្ពបានខ្មែរ-អង់គ្លេស។',
          zh: '按学期的科目成绩、加权平均；柬英双语可打印成绩单，含校徽与班主任签名栏。',
        },
      },
      {
        icon: DollarSign,
        title: { en: 'Fee Management', km: 'ការគ្រប់គ្រងថ្លៃសិក្សា', zh: '学费管理' },
        desc: {
          en: 'Tuition, book fees, uniform, bus, and exam fees. Sibling discounts, scholarships, and instalment plans supported.',
          km: 'ថ្លៃសិក្សា សៀវភៅ ឯកសណ្ឋាន រថយន្តក្រុង ការប្រឡង។ ការបញ្ចុះតម្លៃបងប្អូន អាហារូបករណ៍។',
          zh: '学费、书本费、校服、班车与考试费；兄弟姐妹折扣、奖学金与分期支持。',
        },
      },
      {
        icon: Bus,
        title: { en: 'Transport Roster', km: 'បញ្ជីរថយន្តក្រុង', zh: '校车名册' },
        desc: {
          en: 'Route → pickup point → student list. Driver + assistant assignment; monthly transport-fee auto-billed with tuition.',
          km: 'ផ្លូវ → ចំណុចហៅ → បញ្ជីសិស្ស។ ការចាត់តាំង Driver + ជំនួយ; ថ្លៃរាល់ខែ។',
          zh: '路线 → 上车点 → 学生名单；司机 + 助理分配；月度交通费与学费一并出账。',
        },
      },
      {
        icon: Award,
        title: { en: 'Certificates & Graduation', km: 'វិញ្ញាបនបត្រ និងបញ្ចប់ការសិក្សា', zh: '证书与毕业' },
        desc: {
          en: 'Issue completion, honour, and graduation certificates with QR verification and a serial number log.',
          km: 'ចេញវិញ្ញាបនបត្របញ្ចប់ការសិក្សា ជាមួយ QR បញ្ជាក់ និងកំណត់ត្រាលេខស៊េរី។',
          zh: '颁发结业、荣誉与毕业证书 — 含二维码验证与序列号日志。',
        },
      },
    ],
  },

  /* ────────────────────────────────────────────────────────────────
   * 5. Healthcare — clinic/hospital patient + appointment + billing.
   * ──────────────────────────────────────────────────────────────── */
  {
    key: 'healthcare',
    icon: Stethoscope,
    tone: 'rose',
    title: { en: 'Healthcare', km: 'សុខាភិបាល', zh: '医疗' },
    desc: {
      en: 'Patient records, appointments, consultation notes, prescriptions, pharmacy dispensing, and billing — one file per patient across visits.',
      km: 'កំណត់ត្រាអ្នកជំងឺ ការណាត់ជួប កំណត់ត្រាពិគ្រោះ វេជ្ជបញ្ជា ការចែកឱសថ និងវិក្កយបត្រ — ឯកសារតែមួយក្នុងអ្នកជំងឺ។',
      zh: '病历、预约、诊疗记录、处方、药房发药与结账 — 每位患者跨就诊统一档案。',
    },
    modules: [
      {
        icon: UserCheck,
        title: { en: 'Patient Registration', km: 'ការចុះឈ្មោះអ្នកជំងឺ', zh: '患者登记' },
        desc: {
          en: 'Patient ID card, khmer + english name, blood group, allergies, chronic conditions, and next-of-kin — a proper medical intake, not just a name row.',
          km: 'អត្តសញ្ញាណប័ណ្ណអ្នកជំងឺ ឈ្មោះ ក្រុមឈាម ការអាឡែស៊ី ជំងឺរ៉ាំរ៉ៃ សាច់ញាតិ។',
          zh: '患者证件、柬英双名、血型、过敏史、慢性病与近亲联系人 — 正规接诊登记。',
        },
      },
      {
        icon: CalendarCheck,
        title: { en: 'Appointment Scheduling', km: 'ការណាត់ជួប', zh: '预约排班' },
        desc: {
          en: 'Book by doctor + time slot, avoid double-booking, and send auto Telegram reminders 24h and 1h before the visit.',
          km: 'កក់តាមគ្រូពេទ្យ + ម៉ោង, ជៀសវាងការជាន់, និងផ្ញើការរំលឹក Telegram 24 ម៉ោង និង 1 ម៉ោង។',
          zh: '按医生 + 时段预约，避免冲突；就诊前 24 小时与 1 小时自动 Telegram 提醒。',
        },
      },
      {
        icon: ClipboardList,
        title: { en: 'Consultation Notes (SOAP)', km: 'កំណត់ត្រាពិគ្រោះ (SOAP)', zh: '诊疗记录（SOAP）' },
        desc: {
          en: 'SOAP-style notes (Subjective / Objective / Assessment / Plan) linked to the visit. Timeline view across all past visits.',
          km: 'កំណត់ត្រា SOAP ភ្ជាប់ទៅការមកលេង។ ការមើលតាមកាលបរិច្ឆេទនៃការមកលេងកន្លងមក។',
          zh: 'SOAP（主观/客观/评估/计划）诊疗记录挂靠就诊；跨历次就诊的时间线视图。',
        },
      },
      {
        icon: Pill,
        title: { en: 'Prescription', km: 'វេជ្ជបញ្ជា', zh: '处方' },
        desc: {
          en: 'Drug catalog with doses; prescribe, print, and send to pharmacy in one flow. Interaction warnings on double-prescribed drugs.',
          km: 'បញ្ជីឱសថ ជាមួយកម្រិត; ចេញវេជ្ជបញ្ជា បោះពុម្ព និងផ្ញើទៅឱសថស្ថាន។ ការព្រមានអន្តរកម្ម។',
          zh: '药品目录含剂量；开方、打印、送药房一步完成；重复用药自动交互警告。',
        },
      },
      {
        icon: TestTube,
        title: { en: 'Lab Orders & Results', km: 'ការបញ្ជាទិញការធ្វើតេស្ត និងលទ្ធផល', zh: '化验单与结果' },
        desc: {
          en: 'Order lab tests from the visit, attach printed or scanned results, and flag out-of-range values in red on the patient timeline.',
          km: 'បញ្ជាទិញការធ្វើតេស្តពីការមកលេង, ភ្ជាប់លទ្ធផលបោះពុម្ព ឬស្កេន និងសម្គាល់តម្លៃខាងក្រៅ។',
          zh: '在就诊页开检验、附上打印或扫描结果，超范围值在患者时间线上以红色标示。',
        },
      },
      {
        icon: Package,
        title: { en: 'Pharmacy & Dispensing', km: 'ឱសថស្ថាន និងការចែកឱសថ', zh: '药房与发药' },
        desc: {
          en: 'Prescription lands as a pick-list; dispense against on-hand stock; auto-decrement inventory and post the charge to the visit bill.',
          km: 'វេជ្ជបញ្ជាចូលមកជាបញ្ជីរើស; ចែកតាមស្តុកមាន; កាត់ស្តុកនិងបង្កើតការគិតថ្លៃ។',
          zh: '处方作为拣药清单；按现库存发药；自动减库存并将费用挂入就诊账单。',
        },
      },
      {
        icon: HeartPulse,
        title: { en: 'Vitals & Vaccination', km: 'ជាតិសញ្ញា និងវ៉ាក់សាំង', zh: '生命体征与疫苗' },
        desc: {
          en: 'BP, temp, weight, height per visit — auto-chart trend. Vaccination schedule per patient with due-date reminders.',
          km: 'សម្ពាធឈាម សីតុណ្ហភាព ទំងន់ កម្ពស់ក្នុងការមកលេងនីមួយៗ។ កាលវិភាគវ៉ាក់សាំង ជាមួយការរំលឹក។',
          zh: '每次就诊记录血压/体温/体重/身高并自动绘制趋势；按患者的疫苗计划与到期提醒。',
        },
      },
      {
        icon: Receipt,
        title: { en: 'Billing & Insurance', km: 'វិក្កយបត្រ និងធានារ៉ាប់រង', zh: '结账与保险' },
        desc: {
          en: 'Visit charges + medicines + labs on one bill; part-pay by insurance, part by patient. NSSF and private insurer templates included.',
          km: 'ការគិតថ្លៃការមកលេង + ឱសថ + តេស្ត លើវិក្កយបត្រតែមួយ; បង់ដោយធានារ៉ាប់រង និងអ្នកជំងឺ។',
          zh: '就诊费 + 药品 + 化验合并出账；保险与自付分摊；含 NSSF 与商保模板。',
        },
      },
    ],
  },

  /* ────────────────────────────────────────────────────────────────
   * 6. Booking — appointment + reservation for service businesses.
   * ──────────────────────────────────────────────────────────────── */
  {
    key: 'booking',
    icon: CalendarDays,
    tone: 'cyan',
    title: { en: 'Booking', km: 'ការកក់', zh: '预约' },
    desc: {
      en: 'Appointments, room reservations, and resource scheduling — for salons, clinics, coworking, courts, and any service that runs on a calendar.',
      km: 'ការណាត់ជួប ការកក់បន្ទប់ និងកាលវិភាគធនធាន — សម្រាប់ Salon គ្លីនិក Coworking និងសេវាកម្មតាមប្រតិទិន។',
      zh: '预约、房间/资源排期 — 面向沙龙、诊所、共享办公、球场等按日历运营的服务。',
    },
    modules: [
      {
        icon: CalendarDays,
        title: { en: 'Appointment Calendar', km: 'ប្រតិទិនណាត់ជួប', zh: '预约日历' },
        desc: {
          en: 'Day / week / month grid per staff or resource. Drag to reschedule; overlap and off-hours highlighted so mistakes stand out.',
          km: 'តាម ថ្ងៃ / សប្តាហ៍ / ខែ តាមបុគ្គលិក ឬធនធាន។ អូសដើម្បីកំណត់ឡើងវិញ; ការជាន់នឹងម៉ោងគ្រប់សរឧបាយ។',
          zh: '按员工/资源的日/周/月网格；拖拽改期；重叠与非工作时段高亮以突显错误。',
        },
      },
      {
        icon: UserCheck,
        title: { en: 'Customer Directory', km: 'បញ្ជីអតិថិជន', zh: '客户名册' },
        desc: {
          en: 'Repeat customer history, preferred stylist / doctor / room, and note field for allergies or preferences carried across every visit.',
          km: 'ប្រវត្តិការមកលេង, បុគ្គលិកចូលចិត្ត និងចំណាំសម្រាប់ការអាឡែស៊ី ឬចំណង់ចំណូលចិត្ត។',
          zh: '回头客历史、首选造型师/医生/房间，以及跨每次到访保留的备注（过敏/偏好）。',
        },
      },
      {
        icon: Bell,
        title: { en: 'Auto Reminders (Telegram + SMS)', km: 'ការរំលឹកស្វ័យប្រវត្តិ (Telegram + SMS)', zh: '自动提醒（Telegram + SMS）' },
        desc: {
          en: 'Configurable T-24h and T-1h reminders on every booking. Customer can confirm or cancel by tapping a link — no phone call needed.',
          km: 'រំលឹក T-24 ម៉ោង និង T-1 ម៉ោង គ្រប់ការកក់។ អតិថិជនអាចបញ្ជាក់ ឬបោះបង់តាម Link។',
          zh: '每笔预约可配置 T-24h 与 T-1h 提醒；客户点击链接即可确认或取消，无需来电。',
        },
      },
      {
        icon: MapPin,
        title: { en: 'Multi-Resource Scheduling', km: 'កាលវិភាគធនធានច្រើន', zh: '多资源排期' },
        desc: {
          en: 'Book a stylist AND a chair, or a doctor AND an exam room, in one call — the system holds both slots atomically or refuses if either conflicts.',
          km: 'កក់ Stylist និងកៅអី ឬគ្រូពេទ្យ និងបន្ទប់ ក្នុងការហៅតែមួយ។',
          zh: '一次同时预约"造型师+椅子"或"医生+诊室"，双时段原子锁定，任一冲突即拒绝。',
        },
      },
      {
        icon: RotateCw,
        title: { en: 'Recurring Bookings', km: 'ការកក់ដដែលៗ', zh: '重复预约' },
        desc: {
          en: 'Weekly yoga, monthly check-up, quarterly service — set a recurrence, generate every future instance, and edit individual dates without breaking the series.',
          km: 'យោគៈប្រចាំសប្តាហ៍, ការត្រួតពិនិត្យប្រចាំខែ, សេវាកម្មប្រចាំត្រីមាស — កំណត់ការដដែលៗ។',
          zh: '每周瑜伽/每月体检/每季维护 — 设置周期，一次生成所有未来实例，可单独改期而不破坏序列。',
        },
      },
      {
        icon: CreditCard,
        title: { en: 'Deposits & Payments', km: 'ប្រាក់កក់ និងការទូទាត់', zh: '订金与支付' },
        desc: {
          en: 'Take a KHQR or PayWay deposit at booking time; forfeit-on-no-show policy configurable per service. Final payment on completion.',
          km: 'ទទួលប្រាក់កក់តាម KHQR ឬ PayWay ពេលកក់; គោលការណ៍បាត់បង់ពេលមិនមក។',
          zh: '预约时收取 KHQR / PayWay 订金；按服务配置爽约扣款；完成后收尾款。',
        },
      },
      {
        icon: BadgeCheck,
        title: { en: 'No-Show & Cancellation Tracking', km: 'តាមដានការមិនមក និងបោះបង់', zh: '爽约与取消跟踪' },
        desc: {
          en: 'Per-customer no-show count with an automatic "requires deposit" flag once a threshold is crossed. Cancellations logged with reason.',
          km: 'ចំនួនការមិនមក ជាមួយសញ្ញា "តម្រូវឱ្យបង់មុន" ពេលឆ្លងកាត់កម្រិត។',
          zh: '按客户统计爽约次数；越过阈值自动标记"需订金"；取消附原因日志。',
        },
      },
      {
        icon: Globe,
        title: { en: 'Public Booking Page', km: 'ទំព័រកក់សាធារណៈ', zh: '公开预约页' },
        desc: {
          en: 'Share a booking link on social media; customers pick a service + slot without signing in. Cloudflare Turnstile keeps bots out.',
          km: 'ចែក Link លើប្រព័ន្ធផ្សព្វផ្សាយសង្គម; អតិថិជនជ្រើសរើសសេវាកម្ម + ម៉ោង។',
          zh: '在社媒分享预约链接；客户无需登录即可选服务与时段；Cloudflare Turnstile 拦截机器人。',
        },
      },
    ],
  },

  /* ────────────────────────────────────────────────────────────────
   * 7. Reports & Analytics — horizontal capability, spans verticals.
   * ──────────────────────────────────────────────────────────────── */
  {
    key: 'reports',
    icon: BarChart3,
    tone: 'violet',
    title: { en: 'Reports & Analytics', km: 'របាយការណ៍ និងវិភាគ', zh: '报表与分析' },
    desc: {
      en: 'The same data finance and senior management need — already filtered, exported to Excel, and Cambodia-formatted.',
      km: 'ទិន្នន័យដែលហិរញ្ញវត្ថុ និងការគ្រប់គ្រងជាន់ខ្ពស់ត្រូវការ — បានច្រោះ បាននាំចេញ Excel និងតម្រូវតាមកម្ពុជា។',
      zh: '财务与高层所需的数据 — 已筛选、可导出 Excel，并按柬埔寨格式呈现。',
    },
    modules: [
      {
        icon: Clock,
        title: { en: 'Attendance Report', km: 'របាយការណ៍វត្តមាន', zh: '考勤报表' },
        desc: {
          en: 'Per-employee hours, late minutes, leave used, OT recommended, and exception days — exportable per department + period.',
          km: 'ម៉ោងធ្វើការ ម៉ោងយឺត ការឈប់សម្រាក OT និងលើកលែង — នាំចេញតាមនាយកដ្ឋាន និងរយៈពេល។',
          zh: '按员工的工时、迟到分钟、请假、推荐加班与异常日 — 可按部门和期间导出。',
        },
      },
      {
        icon: DollarSign,
        title: { en: 'Payroll Report', km: 'របាយការណ៍ប្រាក់ខែ', zh: '薪资报表' },
        desc: {
          en: 'Monthly batches with full earnings + deductions breakdown, sign-off trail, and bank-transfer file export.',
          km: 'រាល់ខែ ជាមួយការបែងចែកប្រាក់ចំណូល និងការកាត់ ប្រវត្តិការអនុម័ត និងឯកសារផ្ទេរធនាគារ។',
          zh: '每月批次：完整收入/扣款明细、审批轨迹与银行转账文件导出。',
        },
      },
      {
        icon: Scale,
        title: { en: 'Compliance Report', km: 'របាយការណ៍អនុលោម', zh: '合规报表' },
        desc: {
          en: 'NSSF, tax, labour-law summary in the exact rows the inspector asks for. No spreadsheet gymnastics on audit day.',
          km: 'ប.ស.ស ពន្ធ និងច្បាប់ការងារ ក្នុងជួរត្រឹមត្រូវដែលអ្នកត្រួតពិនិត្យសួរ។',
          zh: 'ប.ស.ស、税务、劳动法摘要 — 检查员要求的字段一行不漏，审计日无需 Excel 苦活。',
        },
      },
      {
        icon: BookOpen,
        title: { en: 'Sale & Purchase Ledger', km: 'បញ្ជីលក់ និងទិញ', zh: '销售与采购台账' },
        desc: {
          en: 'Per-period ledger of every invoice, bill, CN, DN, and payment — opening balance + movements + closing balance per customer / vendor.',
          km: 'បញ្ជីប្រចាំរយៈពេលនៃវិក្កយបត្រ ប័ណ្ណបង់ CN DN និងការទូទាត់ — សមតុល្យដើម+ការផ្លាស់ប្តូរ+សមតុល្យចុង។',
          zh: '按期间汇总发票/账单/CN/DN/收付款 — 每个客户/供应商的期初+变动+期末余额。',
        },
      },
      {
        icon: TrendingUp,
        title: { en: 'Profit & Loss', km: 'ប្រាក់ចំណេញ-ខាត', zh: '损益表' },
        desc: {
          en: 'Live tenant-wide income minus expenses with currency-aware totals — pulled straight from the ledger, no period close needed.',
          km: 'ប្រាក់ចំណូល ដក ការចំណាយ ផ្ទាល់ ដោយចាប់ផ្តើមពីបញ្ជី — មិនចាំបាច់បិទរយៈពេល។',
          zh: '租户范围实时损益（销售收入 − 采购费用）— 按币种合计，直接取自台账，无需期末关账。',
        },
      },
    ],
  },

  /* ────────────────────────────────────────────────────────────────
   * 8. Platform & Integrations — cross-cutting glue.
   * ──────────────────────────────────────────────────────────────── */
  {
    key: 'platform',
    icon: Cloud,
    tone: 'slate',
    title: { en: 'Platform & Integrations', km: 'វេទិកា និងការតភ្ជាប់', zh: '平台与集成' },
    desc: {
      en: 'The plumbing that makes one Smart-HRMS serve many branches, many tenants, and the customers who shop with them.',
      km: 'ហេដ្ឋារចនាសម្ព័ន្ធដែលធ្វើឱ្យ Smart-HRMS មួយបម្រើដល់សាខាច្រើន អតិថិជនច្រើន។',
      zh: '让一个 Smart-HRMS 服务多分支、多租户及其客户的底层基础设施。',
    },
    modules: [
      {
        icon: Cloud,
        title: { en: 'Stand-alone + Online Sync', km: 'Stand-alone + Online តភ្ជាប់', zh: 'Stand-alone + Online 同步' },
        desc: {
          en: 'Run each branch Stand-alone on-prem and an Online cloud instance side-by-side. Connect & Sync survives network outages without losing a single punch.',
          km: 'ដំណើរការសាខានីមួយៗបែប Stand-alone និងបែប Online លើពពកទន្ទឹមគ្នា — មិនបាត់ទិន្នន័យពេលអ៊ីនធឺណែតដាច់។',
          zh: '各分支以 Stand-alone 本地运行，同时与 Online 云端并行；网络中断也不会丢失打卡。',
        },
      },
      {
        icon: Send,
        title: { en: 'Telegram Bots (Customer + HR)', km: 'Telegram Bots (អតិថិជន + HR)', zh: 'Telegram 机器人（客户 + HR）' },
        desc: {
          en: 'One bot per tenant per side: customers receive invoices + receipts, employees self-check-in + get announcements + payslip pings.',
          km: 'Bot មួយក្នុងម្នាក់ៗតាមផ្នែក៖ អតិថិជនទទួលវិក្កយបត្រ+បង្កាន់ដៃ បុគ្គលិក Check-In+ទទួលប្រកាស+សារប្រាក់ខែ។',
          zh: '每个租户、每个用途各一个 Bot：客户收发票/收据，员工自助打卡、接收公告与薪资提醒。',
        },
      },
      {
        icon: KeyRound,
        title: { en: 'Permission Matrix', km: 'ម៉ាទ្រីសសិទ្ធិ', zh: '权限矩阵' },
        desc: {
          en: 'Role × module × action grid — admin, manager, employee, custom roles. Same matrix gates the menu, the API, and the reports.',
          km: 'ម៉ាទ្រីស តួនាទី × ម៉ូឌុល × សកម្មភាព — Admin, Manager, Employee, តួនាទីផ្ទាល់ខ្លួន។',
          zh: '角色 × 模块 × 动作矩阵 — Admin、Manager、Employee 及自定义角色，统一控制菜单、API 与报表。',
        },
      },
      {
        icon: Languages,
        title: { en: 'Multi-Currency · Trilingual UI', km: 'ច្រើនរូបិយប័ណ្ណ · ត្រីភាសា', zh: '多币种 · 三语界面' },
        desc: {
          en: 'USD + KHR side-by-side with operator-set exchange rate snapshots. UI in Khmer + English + Chinese; receipts honour the tenant choice.',
          km: 'USD + KHR ស្របគ្នា ជាមួយអត្រាប្តូរសាច់ប្រាក់ដែលប្តូរបានដោយប្រតិបត្តិករ។ UI ខ្មែរ + អង់គ្លេស + ចិន។',
          zh: 'USD 与 KHR 并列，操作员可设置汇率快照。界面支持柬/英/中三语；小票按租户选择呈现。',
        },
      },
      {
        icon: QrCode,
        title: { en: 'PayWay (ABA) Real-Time Gateway', km: 'PayWay (ABA) ការទូទាត់ពេលវេលាជាក់ស្តែង', zh: 'PayWay（ABA）实时支付网关' },
        desc: {
          en: 'Per-tenant credentials (encrypted at rest), sandbox / live switch, webhook-token routing — apply to POS and Invoice alike.',
          km: 'ព័ត៌មានសម្ងាត់ក្នុងតែម្នាក់ៗ (កូដនីយកម្ម) sandbox / live ភ្ជាប់ webhook — ប្រើបានទាំង POS និងវិក្កយបត្រ។',
          zh: '每租户加密存储的凭据、Sandbox/Live 切换、Webhook 令牌路由 — POS 与发票同步可用。',
        },
      },
    ],
  },
];
