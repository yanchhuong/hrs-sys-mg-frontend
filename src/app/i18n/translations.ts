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
  'nav.home':                 { en: 'Home',                 km: 'ទំព័រដើម',           zh: '首页' },
  'nav.employee':             { en: 'Employee',             km: 'បុគ្គលិក',           zh: '员工' },
  'nav.attendance':           { en: 'Attendance',           km: 'វត្តមាន',           zh: '考勤' },
  'nav.exception':            { en: 'Exception',            km: 'ករណីលើកលែង',    zh: '异常' },
  'nav.overtime':             { en: 'Overtime',             km: 'ការងារបន្ថែម',      zh: '加班' },
  'nav.deduction':            { en: 'Deduction',            km: 'ការកាត់ប្រាក់',      zh: '扣款' },
  'nav.increase':             { en: 'Increase',             km: 'ការដំឡើងប្រាក់',    zh: '加薪' },
  'nav.payroll':              { en: 'Payroll',              km: 'បើកប្រាក់ខែ',       zh: '薪资' },
  'nav.reports':              { en: 'Reports',              km: 'របាយការណ៍',        zh: '报表' },
  'nav.setting':              { en: 'Setting',              km: 'ការកំណត់',         zh: '设置' },
  'nav.setting.general':      { en: 'General Settings',     km: 'ការកំណត់ទូទៅ',      zh: '常规设置' },
  'nav.setting.attendance':   { en: 'Attendance Settings',  km: 'ការកំណត់វត្តមាន',   zh: '考勤设置' },
  'nav.setting.depsgroup':    { en: 'Deps/Group',           km: 'នាយកដ្ឋាន/ក្រុម',   zh: '部门/组' },
  'nav.setting.usermgmt':     { en: 'User Management',      km: 'គ្រប់គ្រងអ្នកប្រើ',    zh: '用户管理' },

  // --- Super Admin sidebar -------------------------------------------------
  'nav.platform.dashboard':   { en: 'Dashboard',            km: 'ផ្ទាំងបញ្ជា',         zh: '仪表板' },
  'nav.platform.companies':   { en: 'Companies',            km: 'ក្រុមហ៊ុន',          zh: '公司' },
  'nav.platform.users':       { en: 'Users',                km: 'អ្នកប្រើប្រាស់',     zh: '用户' },
  'nav.platform.sync':        { en: 'Connect & Sync',       km: 'ភ្ជាប់ និងធ្វើសមកាល', zh: '连接与同步' },
  'nav.platform.activity':    { en: 'Activity Log',         km: 'កំណត់ហេតុសកម្មភាព',  zh: '活动日志' },
  'nav.platform.backups':     { en: 'Backups',              km: 'ការបម្រុងទុក',      zh: '备份' },
  'nav.platform.policy':      { en: 'Policy',               km: 'គោលការណ៍',         zh: '策略' },
  'nav.platform.dashboard.desc': { en: 'Platform overview',          km: 'ទិដ្ឋភាពទូទៅ',           zh: '平台概览' },
  'nav.platform.companies.desc': { en: 'Tenants and plans',          km: 'អតិថិជន និងគម្រោង',      zh: '租户和套餐' },
  'nav.platform.users.desc':     { en: 'Cross-tenant directory',     km: 'បញ្ជីឈ្មោះអ្នកប្រើឆ្លងអតិថិជន', zh: '跨租户目录' },
  'nav.platform.sync.desc':      { en: 'API keys and local installs',km: 'សោ API និងការដំឡើងមូលដ្ឋាន', zh: 'API 密钥与本地安装' },
  'nav.platform.activity.desc':  { en: 'Audit trail & sync errors',  km: 'ការសវនកម្ម និងកំហុសសមកាល', zh: '审计与同步错误' },
  'nav.platform.backups.desc':   { en: 'Per-tenant snapshots & restore', km: 'រូបថត និងស្ដារតាមអតិថិជន', zh: '按租户的快照与恢复' },
  'nav.platform.policy.desc':    { en: 'Global security + features', km: 'សុវត្ថិភាព និងមុខងារសាកល', zh: '全局安全与功能' },

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
  'page.dashboard.title':        { en: 'Home Dashboard',              km: 'ផ្ទាំងបញ្ជាដើម',           zh: '主页仪表板' },
  'page.dashboard.welcome':      { en: 'Welcome back',                km: 'សូមស្វាគមន៍ត្រឡប់មកវិញ', zh: '欢迎回来' },
  'page.employees.title':        { en: 'Employee Management',         km: 'ការគ្រប់គ្រងបុគ្គលិក',    zh: '员工管理' },
  'page.employees.description':  { en: 'Manage all employee records', km: 'គ្រប់គ្រងកំណត់ត្រាបុគ្គលិកទាំងអស់', zh: '管理所有员工记录' },
  'page.attendance.title':       { en: 'Attendance Management',       km: 'ការគ្រប់គ្រងវត្តមាន',    zh: '考勤管理' },
  'page.attendance.description': { en: 'Track employee check-ins, check-outs, and overtime', km: 'តាមដានការចូល-ចេញ និងការងារបន្ថែមរបស់បុគ្គលិក', zh: '跟踪员工签到、签退和加班' },
  'page.exception.title':        { en: 'Attendance Exceptions',       km: 'ករណីលើកលែងវត្តមាន',    zh: '考勤异常' },
  'page.exception.description':  { en: 'Handle missed punches, late arrivals, and manual corrections', km: 'ដោះស្រាយការខកខានបុករោល ការមកយឺត និងការកែជាដៃ', zh: '处理漏打卡、迟到和手动修正' },
  'page.overtime.title':         { en: 'Overtime Management',         km: 'ការគ្រប់គ្រងការងារបន្ថែម', zh: '加班管理' },
  'page.overtime.description':   { en: 'Request and manage overtime hours', km: 'ស្នើសុំ និងគ្រប់គ្រងម៉ោងបន្ថែម', zh: '申请并管理加班时间' },
  'page.deduction.title':        { en: 'Salary Deductions',           km: 'ការកាត់ប្រាក់ខែ',       zh: '薪资扣款' },
  'page.deduction.description':  { en: 'Manage recurring and one-off salary deductions', km: 'គ្រប់គ្រងការកាត់ប្រាក់ដែលកើតឡើងដដែលៗ និងការកាត់តែម្ដង', zh: '管理常规和一次性扣款' },
  'page.increase.title':         { en: 'Salary Increases',            km: 'ការដំឡើងប្រាក់ខែ',      zh: '薪资调整' },
  'page.increase.description':   { en: 'Track raises, bonuses, and promotions', km: 'តាមដានការដំឡើងប្រាក់ ប្រាក់រង្វាន់ និងការតម្លើងឋានៈ', zh: '跟踪加薪、奖金和晋升' },
  'page.payroll.title':          { en: 'Payroll Management',          km: 'ការគ្រប់គ្រងបើកប្រាក់ខែ', zh: '薪资管理' },
  'page.payroll.description':    { en: 'Manage employee compensation and payslips', km: 'គ្រប់គ្រងសំណងបុគ្គលិក និងសន្លឹកបើកប្រាក់', zh: '管理员工薪酬与工资单' },
  'page.reports.title':          { en: 'Reports',                     km: 'របាយការណ៍',             zh: '报表' },
  'page.reports.description':    { en: 'Generate and export attendance and payroll reports', km: 'បង្កើត និងនាំចេញរបាយការណ៍វត្តមាន និងប្រាក់ខែ', zh: '生成并导出考勤和薪资报表' },
  'page.settings.title':         { en: 'System Settings',             km: 'ការកំណត់ប្រព័ន្ធ',      zh: '系统设置' },
  'page.settings.description':   { en: 'Configure HRMS system preferences', km: 'កំណត់រចនាសម្ព័ន្ធប្រព័ន្ធ HRMS', zh: '配置 HRMS 偏好设置' },
  'page.usermgmt.title':         { en: 'User Management',             km: 'ការគ្រប់គ្រងអ្នកប្រើ',   zh: '用户管理' },
  'page.usermgmt.description':   { en: 'Manage users, roles, and access permissions', km: 'គ្រប់គ្រងអ្នកប្រើ តួនាទី និងការអនុញ្ញាតចូលប្រើ', zh: '管理用户、角色和访问权限' },
  'page.depsgroup.title':        { en: 'Deps/Group',                  km: 'នាយកដ្ឋាន / ក្រុម',      zh: '部门 / 组' },
  'page.depsgroup.description':  { en: 'Manage departments and employee groups', km: 'គ្រប់គ្រងនាយកដ្ឋាន និងក្រុមបុគ្គលិក', zh: '管理部门和员工组' },
  'page.attendance_settings.title': { en: 'Attendance Settings',       km: 'ការកំណត់វត្តមាន',       zh: '考勤设置' },
  'page.contracts.title':        { en: 'Contract Management',         km: 'ការគ្រប់គ្រងកិច្ចសន្យា',  zh: '合同管理' },

  // --- Settings tabs + Company Information ---------------------------------
  'settings.tab.company':        { en: 'Company',                     km: 'ក្រុមហ៊ុន',              zh: '公司' },
  'settings.tab.security':       { en: 'Security',                    km: 'សុវត្ថិភាព',             zh: '安全' },
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
