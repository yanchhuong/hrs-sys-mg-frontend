// Lightweight in-app i18n dictionary. English is the source of truth — all
// other locales must cover the same keys or the UI falls back to English.
//
// Add a new key here, use it via `t('key')` in a component, and both Khmer
// and Chinese translations are flagged missing at runtime (dev-only console).

export type Lang = 'en' | 'km' | 'zh';

export const LANG_LABELS: Record<Lang, { native: string; english: string; flag: string }> = {
  en: { native: 'English',  english: 'English', flag: '🇬🇧' },
  km: { native: 'ខ្មែរ',     english: 'Khmer',   flag: '🇰🇭' },
  zh: { native: '中文',      english: 'Chinese', flag: '🇨🇳' },
};

type Dict = Record<string, Record<Lang, string>>;

export const dict: Dict = {
  // --- Brand / header ------------------------------------------------------
  'brand.hrms':               { en: 'HRMS',                 km: 'HRMS',              zh: 'HRMS' },
  'brand.platform':           { en: 'HRMS Platform',        km: 'ប្រព័ន្ធគ្រប់គ្រង',   zh: 'HRMS 平台' },
  'header.super_admin':       { en: 'Super Admin',          km: 'អ្នកគ្រប់គ្រងកំពូល', zh: '超级管理员' },
  'header.platform':          { en: 'PLATFORM',             km: 'វេទិកា',            zh: '平台' },
  'header.profile':           { en: 'Your Profile',         km: 'ប្រវត្តិរូបរបស់អ្នក', zh: '个人资料' },
  'header.logout':            { en: 'Log out',              km: 'ចេញ',               zh: '登出' },
  'header.language':          { en: 'Language',             km: 'ភាសា',              zh: '语言' },

  // --- Roles ---------------------------------------------------------------
  'role.super_admin':         { en: 'Super Admin',          km: 'អ្នកគ្រប់គ្រងកំពូល', zh: '超级管理员' },
  'role.admin':               { en: 'Admin',                km: 'អ្នកគ្រប់គ្រង',       zh: '管理员' },
  'role.manager':             { en: 'Manager',              km: 'អ្នកគ្រប់គ្រងក្រុម',  zh: '经理' },
  'role.employee':            { en: 'Employee',             km: 'បុគ្គលិក',           zh: '员工' },

  // --- Tenant sidebar ------------------------------------------------------
  'nav.home':                 { en: 'Dashboard',            km: 'ផ្ទាំងបញ្ជា',          zh: '仪表板' },
  'nav.employee':             { en: 'Employee',             km: 'បុគ្គលិក',           zh: '员工' },
  'nav.attendance':           { en: 'Attendance',           km: 'វត្តមាន',           zh: '考勤' },
  'nav.allleave':             { en: 'All Leave',            km: 'ច្បាប់ឈប់សម្រាកទាំងអស់', zh: '全部请假' },
  'nav.exception':            { en: 'Exception',            km: 'ករណីលើកលែង',         zh: '例外' },
  'nav.overtime':             { en: 'Overtime',             km: 'ការងារបន្ថែម',      zh: '加班' },
  'nav.deduction':            { en: 'Deduction',            km: 'ការកាត់ប្រាក់',      zh: '扣款' },
  'nav.increase':             { en: 'Increase',             km: 'ការដំឡើងប្រាក់',    zh: '加薪' },
  'nav.payroll':              { en: 'Payroll',              km: 'បើកប្រាក់ខែ',       zh: '薪资' },
  'nav.benefit_calculator':   { en: 'Benefit Calculator',   km: 'ការគណនាអត្ថប្រយោជន៍', zh: '福利计算器' },
  'nav.payroll_mgmt':         { en: 'Payroll Management',   km: 'គ្រប់គ្រងប្រាក់ខែ',   zh: '薪资管理' },
  'nav.time_tracking':        { en: 'Time Tracking',        km: 'តាមដានពេលវេលា',   zh: '考勤管理' },
  'nav.reports':              { en: 'Reports',              km: 'របាយការណ៍',        zh: '报表' },
  'nav.reports.attendance':   { en: 'Attendance Report',    km: 'របាយការណ៍វត្តមាន',  zh: '考勤报表' },
  'nav.reports.payroll':      { en: 'Payroll Report',       km: 'របាយការណ៍ប្រាក់ខែ', zh: '薪资报表' },
  'nav.reports.compliance':   { en: 'Compliance',           km: 'អនុលោមភាព',        zh: '合规报表' },
  'nav.accounting':           { en: 'Accountant',           km: 'គណនេយ្យ',           zh: '会计' },
  'nav.customers':            { en: 'Customers',            km: 'អតិថិជន',            zh: '客户' },
  'nav.sales':                { en: 'Sale',                 km: 'ការលក់',             zh: '销售' },
  'nav.invoices':             { en: 'Invoice',              km: 'វិក្កយបត្រ',           zh: '发票' },
  'nav.purchases':            { en: 'Purchases',            km: 'ការទិញ',             zh: '采购' },
  'nav.bills':                { en: 'Bill',                 km: 'វិក្កយបត្រទិញ',      zh: '账单' },
  'nav.contract':             { en: 'Contracts',            km: 'កិច្ចសន្យា',           zh: '合同' },
  'nav.setting':              { en: 'Setting',              km: 'ការកំណត់',         zh: '设置' },
  'nav.setting.general':      { en: 'General Settings',     km: 'ការកំណត់ទូទៅ',      zh: '常规设置' },
  'nav.setting.attendance':   { en: 'Attendance Settings',  km: 'ការកំណត់វត្តមាន',   zh: '考勤设置' },
  'nav.setting.depsgroup':    { en: 'Deps/Group',           km: 'នាយកដ្ឋាន/ក្រុម',   zh: '部门/组' },
  'nav.setting.usermgmt':     { en: 'User Management',      km: 'គ្រប់គ្រងអ្នកប្រើ',    zh: '用户管理' },
  'nav.setting.empset':       { en: 'Employee Settings',    km: 'ការកំណត់បុគ្គលិក',  zh: '员工设置' },
  'nav.setting.payrollcat':   { en: 'Payroll Categories',   km: 'ប្រភេទប្រាក់ខែ',      zh: '薪资类别' },

  // --- Employee Settings page --------------------------------------------
  'page.employeeSettings.title':           { en: 'Employee Settings',    km: 'ការកំណត់បុគ្គលិក',           zh: '员工设置' },
  'page.employeeSettings.description':     { en: 'Manage positions, departments and groups used across HR records.', km: 'គ្រប់គ្រងតួនាទី នាយកដ្ឋាន និងក្រុមដែលប្រើក្នុងកំណត់ត្រាបុគ្គលិក។', zh: '管理在人事记录中使用的职位、部门和小组。' },
  'page.employeeSettings.tab.positions':   { en: 'Positions',            km: 'តួនាទី',                    zh: '职位' },
  'page.employeeSettings.tab.departments': { en: 'Departments / Groups', km: 'នាយកដ្ឋាន / ក្រុម',         zh: '部门 / 小组' },
  'page.employeeSettings.tab.salaryRules': { en: 'Salary Rules',         km: 'ច្បាប់ប្រាក់ខែ',              zh: '薪酬规则' },
  'page.employeeSettings.tab.deviceUsers': { en: 'Device Users',         km: 'អ្នកប្រើឧបករណ៍',             zh: '设备用户' },

  // --- Payroll Categories settings page ----------------------------------
  'payrollCat.title':         { en: 'Payroll Categories',                                 km: 'ប្រភេទប្រាក់ខែ',                       zh: '薪资类别' },
  'payrollCat.description':   { en: 'Customize earnings and deductions shown on payslips.', km: 'កំណត់ផ្ទាល់ខ្លួននូវប្រាក់ចំណូល និងការកាត់ប្រាក់ក្នុងប័ណ្ណប្រាក់ខែ។', zh: '自定义工资单上的收入和扣款项目。' },
  'payrollCat.earnings':      { en: 'Earnings',                                           km: 'ប្រាក់ចំណូល',                          zh: '收入' },
  'payrollCat.earnings.desc': { en: 'Items that add to gross pay (Basic, OT, allowances, bonuses…).', km: 'ធាតុដែលបូកបន្ថែមលើប្រាក់ខែសរុប។', zh: '加入应发工资的项目（底薪、加班、津贴、奖金等）。' },
  'payrollCat.deductions':    { en: 'Deductions',                                         km: 'ការកាត់ប្រាក់',                        zh: '扣款' },
  'payrollCat.deductions.desc':{ en: 'Items subtracted from gross pay (Tax, Loan, NSSF…).', km: 'ធាតុដែលកាត់ចេញពីប្រាក់ខែសរុប។', zh: '从应发工资中扣除的项目（税、贷款、NSSF 等）。' },
  'payrollCat.add':           { en: 'Add Category',         km: 'បន្ថែមប្រភេទ',        zh: '添加类别' },
  'payrollCat.reset':         { en: 'Restore Defaults',     km: 'ស្ដារលំនាំដើម',       zh: '恢复默认' },
  'payrollCat.empty':         { en: 'No categories yet. Click "Add Category" to create one.', km: 'មិនទាន់មានប្រភេទទេ។ ចុច "បន្ថែមប្រភេទ" ដើម្បីបង្កើត។', zh: '暂无类别。点击"添加类别"以创建。' },
  'payrollCat.builtin':       { en: 'Built-in',             km: 'មានស្រាប់',          zh: '内置' },
  'payrollCat.cannotDelete':  { en: 'Built-in categories cannot be deleted — disable instead.', km: 'ប្រភេទមានស្រាប់មិនអាចលុបបានទេ — សូមបិទជំនួសវិញ។', zh: '内置类别无法删除，请改为禁用。' },
  'payrollCat.col.order':     { en: 'Order',                km: 'លំដាប់',            zh: '顺序' },
  'payrollCat.col.label':     { en: 'Label',                km: 'ឈ្មោះ',              zh: '名称' },
  'payrollCat.col.code':      { en: 'Code',                 km: 'កូដ',                zh: '代码' },
  'payrollCat.col.type':      { en: 'Value Type',           km: 'ប្រភេទតម្លៃ',         zh: '数值类型' },
  'payrollCat.col.default':   { en: 'Default',              km: 'លំនាំដើម',           zh: '默认值' },
  'payrollCat.col.enabled':   { en: 'Enabled',              km: 'បើក',                zh: '启用' },
  'payrollCat.col.actions':   { en: 'Actions',              km: 'សកម្មភាព',           zh: '操作' },
  'payrollCat.type.flat':     { en: 'Flat amount',          km: 'ចំនួនថេរ',           zh: '固定金额' },
  'payrollCat.type.percentage':{ en: 'Percentage',          km: 'ភាគរយ',             zh: '百分比' },
  'payrollCat.delete.title':  { en: 'Delete category?',     km: 'លុបប្រភេទនេះ?',      zh: '删除类别？' },
  'payrollCat.delete.desc':   { en: 'Category "{name}" will be removed. Historical payslips are not affected.', km: 'ប្រភេទ "{name}" នឹងត្រូវលុប។ ប័ណ្ណប្រាក់ខែពីមុនមិនរងឥទ្ធិពលទេ។', zh: '类别"{name}"将被删除，不影响历史工资单。' },
  'payrollCat.reset.title':   { en: 'Restore default categories?', km: 'ស្ដារប្រភេទលំនាំដើម?', zh: '恢复默认类别？' },
  'payrollCat.reset.desc':    { en: 'All custom categories will be removed and the original Earnings (Basic, Position, OT, Allowances, Bonus) and Deductions (Tax, Advance, Loan, NSSF, Others) restored.', km: 'ប្រភេទដែលបានកែប្រែទាំងអស់នឹងត្រូវលុប ហើយប្រភេទលំនាំដើមនឹងត្រូវស្ដារឡើងវិញ។', zh: '所有自定义类别将被删除，并恢复原始收入和扣款项目。' },

  // --- Super Admin sidebar -------------------------------------------------
  'nav.platform.dashboard':   { en: 'Dashboard',            km: 'ផ្ទាំងបញ្ជា',         zh: '仪表板' },
  'nav.platform.companies':   { en: 'Companies',            km: 'ក្រុមហ៊ុន',          zh: '公司' },
  'nav.platform.users':       { en: 'Users',                km: 'អ្នកប្រើប្រាស់',     zh: '用户' },
  'nav.platform.sync':        { en: 'Connect & Sync',       km: 'ភ្ជាប់ និងធ្វើសមកាល', zh: '连接与同步' },
  'nav.platform.activity':    { en: 'Activity Log',         km: 'កំណត់ហេតុសកម្មភាព',  zh: '活动日志' },
  'nav.platform.backups':     { en: 'Backups',              km: 'ការបម្រុងទុក',      zh: '备份' },
  'nav.platform.plans':       { en: 'Plans',                km: 'គម្រោងតម្លៃ',         zh: '套餐' },
  'nav.platform.tenantmodules': { en: 'Tenant Modules',     km: 'ម៉ូឌុលអតិថិជន',       zh: '租户模块' },
  'nav.platform.policy':      { en: 'Policy',               km: 'គោលការណ៍',         zh: '策略' },
  'nav.platform.dashboard.desc': { en: 'Platform overview',          km: 'ទិដ្ឋភាពទូទៅ',           zh: '平台概览' },
  'nav.platform.companies.desc': { en: 'Tenants and plans',          km: 'អតិថិជន និងគម្រោង',      zh: '租户和套餐' },
  'nav.platform.users.desc':     { en: 'Cross-tenant directory',     km: 'បញ្ជីឈ្មោះអ្នកប្រើឆ្លងអតិថិជន', zh: '跨租户目录' },
  'nav.platform.sync.desc':      { en: 'API keys and local installs',km: 'សោ API និងការដំឡើងមូលដ្ឋាន', zh: 'API 密钥与本地安装' },
  'nav.platform.activity.desc':  { en: 'Audit trail & sync errors',  km: 'ការសវនកម្ម និងកំហុសសមកាល', zh: '审计与同步错误' },
  'nav.platform.backups.desc':   { en: 'Per-tenant snapshots & restore', km: 'រូបថត និងស្ដារតាមអតិថិជន', zh: '按租户的快照与恢复' },
  'nav.platform.plans.desc':     { en: 'Pricing tiers and limits',   km: 'កម្រិតតម្លៃ និងដែនកំណត់', zh: '定价层级与限额' },
  'nav.platform.tenantmodules.desc': { en: 'Per-tenant menu access', km: 'សិទ្ធិម៉ឺនុយតាមអតិថិជន', zh: '按租户的菜单访问' },
  'nav.platform.policy.desc':    { en: 'Global security + features', km: 'សុវត្ថិភាព និងមុខងារសាកល', zh: '全局安全与功能' },
  'nav.platform.settings':       { en: 'Settings',                   km: 'ការកំណត់',            zh: '设置' },
  'nav.platform.settings.desc':  { en: 'Activity, backups, policy, payroll & holidays', km: 'សកម្មភាព, ស្ដារ, គោលការណ៍, ប្រាក់ខែ', zh: '活动、备份、策略、薪资与节假日' },
  'nav.platform.payrollcat':     { en: 'Payroll Categories',         km: 'ប្រភេទប្រាក់ខែ',     zh: '薪资类别' },
  'nav.platform.payrollcat.desc':{ en: 'Per-tenant earning & deduction lines', km: 'ប្រាក់ចំណូល និងប្រាក់កាត់តាមអតិថិជន', zh: '按租户的收入与扣减项' },
  'nav.platform.modulecat':      { en: 'Module Categories',          km: 'ប្រភេទម៉ូឌុល',       zh: '模块类别' },
  'nav.platform.modulecat.desc': { en: 'Group menu modules into apps', km: 'ដាក់ម៉ូឌុលក្នុងក្រុមជាកម្មវិធី', zh: '将菜单模块分组为应用' },
  'nav.platform.holidays':       { en: 'Holidays',                   km: 'ថ្ងៃឈប់សម្រាក',    zh: '节假日' },
  'nav.platform.holidays.desc':  { en: 'Per-tenant public holidays', km: 'ថ្ងៃឈប់សម្រាកជាតិ', zh: '按租户的公共假日' },

  // --- Common actions ------------------------------------------------------
  'action.save':              { en: 'Save',                 km: 'រក្សាទុក',          zh: '保存' },
  'action.cancel':            { en: 'Cancel',               km: 'បោះបង់',           zh: '取消' },
  'action.edit':              { en: 'Edit',                 km: 'កែប្រែ',            zh: '编辑' },
  'action.delete':            { en: 'Delete',               km: 'លុប',               zh: '删除' },
  'action.add':               { en: 'Add',                  km: 'បន្ថែម',            zh: '添加' },
  'action.search':            { en: 'Search',               km: 'ស្វែងរក',           zh: '搜索' },
  'action.export':            { en: 'Export',               km: 'នាំចេញ',            zh: '导出' },
  'action.upload':            { en: 'Upload',               km: 'ផ្ទុកឡើង',          zh: '上传' },
  'action.download':          { en: 'Download',             km: 'ទាញយក',            zh: '下载' },
  'action.close':             { en: 'Close',                km: 'បិទ',               zh: '关闭' },
  'action.confirm':           { en: 'Confirm',              km: 'បញ្ជាក់',           zh: '确认' },
  'action.approve':           { en: 'Approve',              km: 'អនុម័ត',            zh: '批准' },
  'action.reject':            { en: 'Reject',               km: 'បដិសេធ',           zh: '拒绝' },
  'action.view':              { en: 'View',                 km: 'មើល',              zh: '查看' },
  'action.view_details':      { en: 'View Details',         km: 'មើលលម្អិត',         zh: '查看详情' },
  'action.next':              { en: 'Next',                 km: 'បន្ទាប់',           zh: '下一步' },
  'action.previous':          { en: 'Previous',             km: 'មុន',               zh: '上一步' },
  'action.back':              { en: 'Back',                 km: 'ត្រឡប់',            zh: '返回' },
  'action.submit':            { en: 'Submit',               km: 'ដាក់ស្នើ',           zh: '提交' },
  'action.retry':             { en: 'Retry',                km: 'ព្យាយាមម្ដងទៀត',    zh: '重试' },
  'action.refresh':           { en: 'Refresh',              km: 'ធ្វើឱ្យស្រស់',       zh: '刷新' },

  // --- Status --------------------------------------------------------------
  'status.active':            { en: 'Active',               km: 'សកម្ម',             zh: '活跃' },
  'status.inactive':          { en: 'Inactive',             km: 'អសកម្ម',           zh: '未激活' },
  'status.pending':           { en: 'Pending',              km: 'កំពុងរង់ចាំ',        zh: '待处理' },
  'status.approved':          { en: 'Approved',             km: 'បានអនុម័ត',        zh: '已批准' },
  'status.rejected':          { en: 'Rejected',             km: 'បានបដិសេធ',       zh: '已拒绝' },
  'status.done':              { en: 'Done',                 km: 'រួចរាល់',           zh: '完成' },
  'status.in_progress':       { en: 'In Progress',          km: 'កំពុងដំណើរការ',    zh: '进行中' },
  'status.completed':         { en: 'Completed',            km: 'បានបញ្ចប់',        zh: '已完成' },
  'status.failed':            { en: 'Failed',               km: 'បរាជ័យ',            zh: '失败' },
  'status.suspended':         { en: 'Suspended',            km: 'បានផ្អាក',          zh: '已暂停' },
  'status.trial':             { en: 'Trial',                km: 'សាកល្បង',          zh: '试用' },
  'status.cancelled':         { en: 'Cancelled',            km: 'បានបោះបង់',        zh: '已取消' },
  'status.locked':            { en: 'Locked',               km: 'បានចាក់សោ',       zh: '已锁定' },

  // --- Page titles + descriptions (tenant) ---------------------------------
  'page.dashboard.title':        { en: 'Dashboard',                   km: 'ផ្ទាំងបញ្ជា',              zh: '仪表板' },
  'page.dashboard.welcome':      { en: 'Welcome back',                km: 'សូមស្វាគមន៍ត្រឡប់មកវិញ', zh: '欢迎回来' },
  // Page titles mirror the left-sidebar menu labels (nav.* keys) so the
  // page heading and the menu item read identically — no "Management"
  // suffixes or alternate phrasings. Description strings unchanged.
  'page.employees.title':        { en: 'Employee',                    km: 'បុគ្គលិក',               zh: '员工' },
  'page.employees.description':  { en: 'Manage all employee records', km: 'គ្រប់គ្រងកំណត់ត្រាបុគ្គលិកទាំងអស់', zh: '管理所有员工记录' },
  'page.attendance.title':       { en: 'Attendance',                  km: 'វត្តមាន',               zh: '考勤' },
  'page.attendance.description': { en: 'Track employee check-ins, check-outs, and overtime', km: 'តាមដានការចូល-ចេញ និងការងារបន្ថែមរបស់បុគ្គលិក', zh: '跟踪员工签到、签退和加班' },
  'page.allleave.title':         { en: 'All Leave',                   km: 'ច្បាប់ឈប់សម្រាកទាំងអស់', zh: '全部请假' },
  'page.allleave.description':   { en: 'Leave requests routed to each employee\'s direct leader for approval', km: 'សំណើច្បាប់ត្រូវបានបញ្ជូនទៅមេដឹកនាំផ្ទាល់នៃបុគ្គលិកដើម្បីអនុម័ត', zh: '请假申请由员工的直属领导审批' },
  'page.exception.title':        { en: 'Exception',                   km: 'ករណីលើកលែង',         zh: '例外' },
  'page.exception.description':  { en: 'Employees opted out of attendance counting and per-day exception entries', km: 'បុគ្គលិកដែលមិនរាប់បញ្ចូលក្នុងវត្តមាន និងករណីលើកលែងប្រចាំថ្ងៃ', zh: '已退出考勤计算的员工与单日例外记录' },
  'page.overtime.title':         { en: 'Overtime',                    km: 'ការងារបន្ថែម',          zh: '加班' },
  'page.overtime.description':   { en: 'Request and manage overtime hours', km: 'ស្នើសុំ និងគ្រប់គ្រងម៉ោងបន្ថែម', zh: '申请并管理加班时间' },
  'page.deduction.title':        { en: 'Deduction',                   km: 'ការកាត់ប្រាក់',          zh: '扣款' },
  'page.deduction.description':  { en: 'Manage recurring and one-off salary deductions', km: 'គ្រប់គ្រងការកាត់ប្រាក់ដែលកើតឡើងដដែលៗ និងការកាត់តែម្ដង', zh: '管理常规和一次性扣款' },
  'page.increase.title':         { en: 'Increase',                    km: 'ការដំឡើងប្រាក់',        zh: '加薪' },
  'page.increase.description':   { en: 'Track raises, bonuses, and promotions', km: 'តាមដានការដំឡើងប្រាក់ ប្រាក់រង្វាន់ និងការតម្លើងឋានៈ', zh: '跟踪加薪、奖金和晋升' },
  'page.payroll.title':          { en: 'Payroll',                     km: 'បើកប្រាក់ខែ',           zh: '薪资' },
  'page.payroll.description':    { en: 'Manage employee compensation and payslips', km: 'គ្រប់គ្រងសំណងបុគ្គលិក និងសន្លឹកបើកប្រាក់', zh: '管理员工薪酬与工资单' },
  'page.reports.title':          { en: 'Reports',                     km: 'របាយការណ៍',             zh: '报表' },
  'page.reports.description':    { en: 'Generate and export attendance and payroll reports', km: 'បង្កើត និងនាំចេញរបាយការណ៍វត្តមាន និងប្រាក់ខែ', zh: '生成并导出考勤和薪资报表' },
  'page.settings.title':         { en: 'General Settings',            km: 'ការកំណត់ទូទៅ',          zh: '常规设置' },
  'page.settings.description':   { en: 'Configure HRMS system preferences', km: 'កំណត់រចនាសម្ព័ន្ធប្រព័ន្ធ HRMS', zh: '配置 HRMS 偏好设置' },
  'page.usermgmt.title':         { en: 'User Management',             km: 'ការគ្រប់គ្រងអ្នកប្រើ',   zh: '用户管理' },
  'page.usermgmt.description':   { en: 'Manage users, roles, and access permissions', km: 'គ្រប់គ្រងអ្នកប្រើ តួនាទី និងការអនុញ្ញាតចូលប្រើ', zh: '管理用户、角色和访问权限' },
  'page.depsgroup.title':        { en: 'Deps/Group',                  km: 'នាយកដ្ឋាន / ក្រុម',      zh: '部门 / 组' },
  'page.depsgroup.description':  { en: 'Manage departments and employee groups', km: 'គ្រប់គ្រងនាយកដ្ឋាន និងក្រុមបុគ្គលិក', zh: '管理部门和员工组' },
  'page.attendance_settings.title': { en: 'Attendance Settings',       km: 'ការកំណត់វត្តមាន',       zh: '考勤设置' },
  'page.contracts.title':        { en: 'Contract Management',         km: 'ការគ្រប់គ្រងកិច្ចសន្យា',  zh: '合同管理' },

  // --- Settings tabs + Company Information ---------------------------------
  'settings.tab.company':        { en: 'Company',                     km: 'ក្រុមហ៊ុន',              zh: '公司' },
  'settings.tab.security':       { en: 'Device Management',           km: 'ការគ្រប់គ្រងឧបករណ៍',   zh: '设备管理' },
  'settings.tab.policy':         { en: 'Policy',                      km: 'គោលការណ៍',             zh: '策略' },
  'settings.company.title':      { en: 'Company Information',         km: 'ព័ត៌មានក្រុមហ៊ុន',       zh: '公司信息' },
  'settings.company.description':{ en: 'Public business details shown on payslips, tax reports, and invoices.', km: 'ព័ត៌មានអាជីវកម្មសាធារណៈលើសន្លឹកបើកប្រាក់ របាយការណ៍ពន្ធ និងវិក្កយបត្រ។', zh: '显示在工资单、税务报表和发票上的公开公司信息。' },
  'settings.company.name':       { en: 'Company Name',                km: 'ឈ្មោះក្រុមហ៊ុន',         zh: '公司名称' },
  'settings.company.contact':    { en: 'Contact',                     km: 'ទំនាក់ទំនង',             zh: '联系电话' },
  'settings.company.email':      { en: 'Email',                       km: 'អ៊ីមែល',                zh: '邮箱' },
  'settings.company.tin':        { en: 'TIN',                         km: 'លេខអត្តសញ្ញាណពន្ធ',   zh: '税号' },
  'settings.company.plan':       { en: 'Plan',                        km: 'គម្រោង',               zh: '套餐' },
  'settings.company.address':    { en: 'Address',                     km: 'អាសយដ្ឋាន',            zh: '地址' },

  // --- Login ---------------------------------------------------------------
  'login.title':                 { en: 'HRMS Portal',                 km: 'ច្រកចូល HRMS',         zh: 'HRMS 登录门户' },
  'login.description':           { en: 'Human Resource Management System', km: 'ប្រព័ន្ធគ្រប់គ្រងធនធានមនុស្ស', zh: '人力资源管理系统' },
  'login.email':                 { en: 'Email',                       km: 'អ៊ីមែល',                zh: '邮箱' },
  'login.password':              { en: 'Password',                    km: 'ពាក្យសម្ងាត់',           zh: '密码' },
  'login.signin':                { en: 'Sign In',                     km: 'ចូលប្រើ',               zh: '登录' },
  'login.invalid':               { en: 'Invalid credentials',         km: 'ឈ្មោះ ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ', zh: '凭据无效' },
  'login.quick':                 { en: 'Demo Quick Login',            km: 'ចូលរហ័ស',              zh: '快捷登录' },
  'login.autofill':              { en: 'Or auto-fill credentials',    km: 'ឬបំពេញឈ្មោះស្វ័យប្រវត្តិ', zh: '或自动填充凭据' },

  // --- Profile dialog ------------------------------------------------------
  'profile.title':               { en: 'Your Profile',                km: 'ប្រវត្តិរូបរបស់អ្នក',      zh: '个人资料' },
  'profile.description':         { en: 'Update personal information, login email, or password.', km: 'ធ្វើបច្ចុប្បន្នភាពព័ត៌មានផ្ទាល់ខ្លួន អ៊ីមែលចូល ឬពាក្យសម្ងាត់។', zh: '更新个人信息、登录邮箱或密码。' },
  'profile.tab.profile':         { en: 'Profile',                     km: 'ប្រវត្តិរូប',             zh: '资料' },
  'profile.tab.account':         { en: 'Account',                     km: 'គណនី',                 zh: '账户' },
  'profile.tab.password':        { en: 'Password',                    km: 'ពាក្យសម្ងាត់',           zh: '密码' },

  // --- Dashboard cards (selected) ------------------------------------------
  'dashboard.total_employees':   { en: 'Total Employees',             km: 'ចំនួនបុគ្គលិកសរុប',     zh: '员工总数' },
  'dashboard.today_attendance':  { en: "Today's Attendance",          km: 'វត្តមានថ្ងៃនេះ',         zh: '今日考勤' },
  'dashboard.pending_ot':        { en: 'Pending OT Requests',         km: 'សំណើការងារបន្ថែមកំពុងរង់ចាំ', zh: '待处理加班申请' },
  'dashboard.expiring_contracts':{ en: 'Expiring Contracts',          km: 'កិច្ចសន្យាជិតផុត',       zh: '即将到期合同' },
  'dashboard.recent_alerts':     { en: 'Recent Alerts',               km: 'ការជូនដំណឹងថ្មីៗ',      zh: '最近提醒' },
  'dashboard.department_overview':{ en: 'Department Overview',        km: 'ទិដ្ឋភាពនាយកដ្ឋាន',     zh: '部门概览' },

  // --- Contracts (Employee detail · Contracts tab + Add/Edit/Renew dialog) ---
  'contract.add':                { en: 'Add Contract',                km: 'បន្ថែមកិច្ចសន្យា',       zh: '添加合同' },
  'contract.edit':                { en: 'Edit Contract',               km: 'កែប្រែកិច្ចសន្យា',       zh: '编辑合同' },
  'contract.renew':               { en: 'Renew Contract',              km: 'ផ្តល់កិច្ចសន្យាបន្ត',    zh: '续签合同' },
  'contract.add.desc':            { en: 'Create a new contract for',   km: 'បង្កើតកិច្ចសន្យាថ្មីសម្រាប់', zh: '为以下员工创建新合同' },
  'contract.edit.desc':           { en: 'Update the contract details for', km: 'ធ្វើបច្ចុប្បន្នភាពកិច្ចសន្យាសម្រាប់', zh: '更新合同详细信息：' },
  'contract.renew.desc':          { en: 'Renewing creates a new active contract and marks the current one expired.', km: 'ការផ្តល់បន្តបង្កើតកិច្ចសន្យាសកម្មថ្មី និងសម្គាល់កិច្ចសន្យាបច្ចុប្បន្នថាផុតកំណត់។', zh: '续签将创建一个新的有效合同，并将当前合同标记为已到期。' },
  'contract.current':             { en: 'Current Contract',            km: 'កិច្ចសន្យាបច្ចុប្បន្ន',   zh: '当前合同' },
  'contract.type':                { en: 'Type',                        km: 'ប្រភេទ',                zh: '类型' },
  'contract.salary.current':      { en: 'Current Salary',              km: 'ប្រាក់ខែបច្ចុប្បន្ន',     zh: '当前薪资' },
  'contract.duration':            { en: 'Duration',                    km: 'រយៈពេល',               zh: '期限' },
  'contract.duration.3mo':        { en: '3 Months',                    km: '៣ ខែ',                  zh: '3 个月' },
  'contract.duration.6mo':        { en: '6 Months',                    km: '៦ ខែ',                  zh: '6 个月' },
  'contract.duration.1yr':        { en: '1 Year',                      km: '១ ឆ្នាំ',                zh: '1 年' },
  'contract.duration.2yr':        { en: '2 Years',                     km: '២ ឆ្នាំ',                zh: '2 年' },
  'contract.duration.custom':     { en: 'Custom',                      km: 'ផ្ទាល់ខ្លួន',           zh: '自定义' },
  'contract.start_date':          { en: 'Start Date',                  km: 'ថ្ងៃចាប់ផ្តើម',         zh: '开始日期' },
  'contract.end_date':            { en: 'End Date',                    km: 'ថ្ងៃបញ្ចប់',            zh: '结束日期' },
  'contract.start_date.new':      { en: 'New Start Date',              km: 'ថ្ងៃចាប់ផ្តើមថ្មី',     zh: '新开始日期' },
  'contract.end_date.new':        { en: 'New End Date',                km: 'ថ្ងៃបញ្ចប់ថ្មី',        zh: '新结束日期' },
  'contract.contract_type':       { en: 'Contract Type',               km: 'ប្រភេទកិច្ចសន្យា',       zh: '合同类型' },
  'contract.type.udc':            { en: 'UDC — Undetermined Duration', km: 'UDC — រយៈពេលមិនកំណត់',  zh: 'UDC — 无固定期限' },
  'contract.type.fdc':            { en: 'FDC — Fixed Duration',        km: 'FDC — រយៈពេលកំណត់',     zh: 'FDC — 固定期限' },
  'contract.type.probation':      { en: 'Probation',                   km: 'រយៈពេលសាកល្បង',         zh: '试用期' },
  'contract.type.internship':     { en: 'Internship',                  km: 'កម្មសិក្សា',           zh: '实习' },
  'contract.type.helper':         { en: 'UDC: open-ended; qualifies for seniority indemnity (7.5d × 2/year). FDC: fixed term; entitled to 5% of total wages severance on expiry.', km: 'UDC: មិនកំណត់ ; មានសិទ្ធិទទួលប្រាក់ចូលនិវត្តន៍ (៧.៥ ថ្ងៃ × ២/ឆ្នាំ)។ FDC: រយៈពេលកំណត់ ; មានសិទ្ធិទទួលសំណង ៥% ពេលផុតកំណត់។', zh: 'UDC：无固定期，符合工龄抚恤金资格（每年 2 × 7.5 天）。FDC：定期，到期可获得总工资 5% 的解雇赔偿。' },
  'contract.probation.cap_prefix':{ en: 'Probation cap for',            km: 'ដែនកំណត់រយៈពេលសាកល្បងសម្រាប់', zh: '试用期上限：' },
  'contract.probation.cap_suffix':{ en: 'month(s) (Cambodian Labour Law).', km: 'ខែ (ច្បាប់ការងារកម្ពុជា)។', zh: '月（柬埔寨劳动法）' },
  'contract.salary':              { en: 'Salary ($)',                  km: 'ប្រាក់ខែ ($)',            zh: '薪资 ($)' },
  'contract.termination_reason':  { en: 'Termination Reason',          km: 'មូលហេតុបញ្ចប់',          zh: '终止原因' },
  'contract.term.still_active':   { en: '— Still active / natural expiry —', km: '— នៅសកម្ម / ផុតកំណត់ធម្មតា —', zh: '— 仍有效 / 自然到期 —' },
  'contract.term.natural':        { en: 'Natural — contract ran to its end date', km: 'ធម្មតា — កិច្ចសន្យាដំណើរការដល់ថ្ងៃបញ្ចប់', zh: '自然到期 — 合同已运行至结束日期' },
  'contract.term.misconduct':     { en: 'Serious misconduct (forfeits FDC severance)', km: 'ការប្រព្រឹត្តខុសធ្ងន់ធ្ងរ (បាត់បង់សំណង FDC)', zh: '严重失职（丧失 FDC 解雇赔偿）' },
  'contract.term.mutual':         { en: 'Mutual agreement',            km: 'កិច្ចព្រមព្រៀងទាំងសងខាង', zh: '双方协议' },
  'contract.term.resignation':    { en: 'Resignation',                 km: 'លាលែង',                 zh: '辞职' },
  'contract.term.other':          { en: 'Other',                       km: 'ផ្សេងៗ',                zh: '其他' },
  'contract.term.misconduct.warn':{ en: '⚠ This contract will be excluded from the FDC severance calculator.', km: '⚠ កិច្ចសន្យានេះនឹងត្រូវដកចេញពីការគណនាសំណង FDC។', zh: '⚠ 此合同将从 FDC 解雇赔偿计算器中排除。' },
  'contract.notes':               { en: 'Notes',                       km: 'កំណត់ចំណាំ',           zh: '备注' },
  'contract.notes.placeholder':   { en: 'Optional notes about this contract…', km: 'កំណត់ចំណាំស្រេចចិត្តអំពីកិច្ចសន្យានេះ…', zh: '关于此合同的可选备注…' },
  'contract.notes.placeholder.renew':{ en: 'Reason for renewal, salary change rationale…', km: 'មូលហេតុនៃការបន្ត ការផ្លាស់ប្តូរប្រាក់ខែ…', zh: '续签理由、薪资变更说明…' },
  'contract.btn.create':          { en: 'Create Contract',             km: 'បង្កើតកិច្ចសន្យា',       zh: '创建合同' },
  'contract.btn.save':            { en: 'Save Changes',                km: 'រក្សាទុកការផ្លាស់ប្តូរ',  zh: '保存更改' },
  'contract.btn.saving':          { en: 'Saving…',                     km: 'កំពុងរក្សាទុក…',         zh: '保存中…' },
  'contract.validate.start_required':{ en: 'Pick a start date first',  km: 'ជ្រើសរើសថ្ងៃចាប់ផ្តើមជាមុនសិន', zh: '请先选择开始日期' },
  'contract.empty':               { en: 'No contracts yet.',           km: 'មិនទាន់មានកិច្ចសន្យានៅឡើយ', zh: '尚无合同' },
  'contract.empty.hint':          { en: 'Click "Add Contract" to create one.', km: 'ចុច "បន្ថែមកិច្ចសន្យា" ដើម្បីបង្កើតថ្មី', zh: '点击"添加合同"以创建' },
};

export type TKey = keyof typeof dict;

const missingLogged = new Set<string>();

export function translate(key: string, lang: Lang, fallback?: string): string {
  const entry = dict[key];
  if (!entry) {
    if (import.meta.env?.DEV && !missingLogged.has(key)) {
      missingLogged.add(key);
      console.warn(`[i18n] missing key: ${key}`);
    }
    return fallback ?? key;
  }
  const value = entry[lang];
  if (!value) return entry.en ?? fallback ?? key;
  return value;
}
