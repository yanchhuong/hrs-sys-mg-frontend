import { useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { useI18n } from '../i18n/I18nContext';
import { trackLandingView } from '../api/platformMetrics';
import {
  Building2, Users, Clock, DollarSign, TimerIcon, BarChart3,
  Cloud, Fingerprint, Receipt, Check, Languages,
  ArrowRight, Quote, Sparkles, Target, Globe, LineChart,
  Lock, FileSpreadsheet, ShieldCheck, Network, RefreshCw,
  HelpCircle, Mail, Phone, MapPin, Factory, Briefcase, Store,
  CalendarDays, FileText, Baby, Calculator, Scale,
} from 'lucide-react';
// Real product screenshot — uses only the demo-named Payroll Management view.
// The other two screenshots in src/imports contain real employee names and
// must not be surfaced on the marketing page.
import imgPayroll from '../../imports/image-3.png';

type Lang = 'en' | 'km' | 'zh';

interface LandingPageProps {
  onSignInClick: () => void;
  /** Optional — when provided, renders a "Try Demo" button that opens
   *  the login page with admin@demo.com / admin123 pre-filled. */
  onDemoClick?: () => void;
}

/** Bilingual copy. Keep keys terse, values short — long marketing copy lives inline below. */
const T = {
  nav: {
    features:   { en: 'Features',     km: 'លក្ខណៈពិសេស',   zh: '功能' },
    modules:    { en: 'Modules',      km: 'មុខងារ',         zh: '模块' },
    howItWorks: { en: 'How it works', km: 'របៀបដំណើរការ',   zh: '使用流程' },
    rules:      { en: 'Labour law',   km: 'ច្បាប់ការងារ',   zh: '劳动法' },
    faq:        { en: 'FAQ',          km: 'សំណួរញឹកញាប់',   zh: '常见问题' },
    signIn:     { en: 'Sign in',      km: 'ចូលប្រើប្រាស់',  zh: '登录' },
    getStarted: { en: 'Get started',  km: 'ចាប់ផ្តើម',      zh: '立即开始' },
    tryDemo:    { en: 'Try Demo',     km: 'ចូលប្រើសាកល្បង',  zh: '试用 Demo' },
  },
  hero: {
    eyebrow:  { en: 'For factories, companies, and teams of every size',
                km: 'សម្រាប់រោងចក្រ ក្រុមហ៊ុន និងក្រុមការងារគ្រប់ទំហំ',
                zh: '适用于各种规模的工厂、企业和团队' },
    title1:   { en: 'From the factory floor',
                km: 'សំរាប់រោងចក្រ ហសគ្រាស គ្រប់ខ្នាតអាប្រើបាស់បានយ៉ាង ប្រសើរ',
                zh: '从工厂车间到企业办公室' },
    title2:   { en: 'to the corner office — one HR platform.',
                km: 'One For All HRS Platform',
                zh: 'One For All HRS Platform' },
    subtitle: { en: 'Built in Cambodia for manufacturing plants, multi-site enterprises, and offices alike. Track attendance with fingerprint devices, run Tax on Salary and NSSF, and close payroll in minutes — whether you have 10 employees or 2,000.',
                km: 'រចនាឡើងនៅកម្ពុជាសម្រាប់រោងចក្រផលិតកម្ម សហគ្រាសច្រើនទីតាំង និងការិយាល័យ។ តាមដានវត្តមានជាមួយឧបករណ៍ស្នាមម្រាមដៃ ដំណើរការពន្ធលើប្រាក់ខែ និង ប.ស.ស និងបិទប្រាក់ខែក្នុងពេលប៉ុន្មាននាទី — មិនថាអ្នកមាន ១០ ឬ ២,០០០ បុគ្គលិក។',
                zh: '在柬埔寨打造，适用于制造工厂、多站点企业和办公室。通过指纹设备追踪考勤，运行薪资税与 ប.ស.ស，几分钟内完成发薪 — 无论您有 10 名员工还是 2,000 名。' },
    ctaPrimary:   { en: 'Get started',       km: 'ចាប់ផ្តើម',           zh: '立即开始' },
    ctaSecondary: { en: 'See how it works',  km: 'មើលរបៀបដំណើរការ',     zh: '了解使用方式' },
    trustNote:    { en: 'Available Stand-alone (on-premise) and Online (cloud) — pick one, or run both with Connect & Sync.',
                    km: 'មាន Stand-alone (ក្នុងស្រុក) និង Online (ពពក) — ជ្រើសរើសមួយ ឬដំណើរការទាំងពីរជាមួយ Connect & Sync។',
                    zh: '提供 Stand-alone（本地）和 Online（云端）两种部署 — 任选其一，或通过 Connect & Sync 同时运行两者。' },
    chipsLabel:   { en: 'Trusted by',        km: 'ត្រូវបានទុកចិត្តដោយ', zh: '受信赖于' },
  },
  industries: {
    eyebrow: { en: 'Built for the workforce you actually have',
               km: 'រចនាឡើងសម្រាប់ពលករដែលអ្នកមានជាក់ស្តែង',
               zh: '为您实际拥有的员工而打造' },
    title:   { en: 'Whether you run a factory or an office, this fits.',
               km: 'មិនថាអ្នកដំណើរការរោងចក្រ ឬការិយាល័យ វាសមនឹងអ្នកទាំងអស់។',
               zh: '无论您经营工厂还是办公室，HRMS Portal 都适用。' },
    desc:    { en: 'Most HR products are designed for tidy, salaried office work. Real businesses in Cambodia have shift workers on factory floors, mixed-language teams, and dozens of fingerprint terminals — HRMS Portal is built for that reality.',
               km: 'ផលិតផលធនធានមនុស្សភាគច្រើនរចនាសម្រាប់ការងារការិយាល័យដែលមានរបៀបរៀបរយ។ អាជីវកម្មពិតប្រាកដនៅកម្ពុជាមានកម្មកររបបវេន លាយក្នុងក្រុមការងារភាសាច្រើន និងឧបករណ៍ស្នាមម្រាមដៃច្រើនរយ — HRMS Portal សាងសង់ឡើងសម្រាប់ការពិតនោះ។',
               zh: '大多数 HR 产品都是为整洁、领薪的办公室工作而设计的。柬埔寨的真实企业拥有工厂车间的轮班工人、多语言团队和数十台指纹考勤机 — HRMS Portal 正是为这种现实而打造。' },
    factoryBadge:  { en: 'Most-deployed',           km: 'ដាក់ឱ្យដំណើរការច្រើនជាងគេ',  zh: '部署最多' },
    factoryTitle:  { en: 'Factory & Manufacturing', km: 'រោងចក្រ និងផលិតកម្ម',         zh: '工厂与制造业' },
    factoryDesc:   { en: 'Multi-shift, multi-device, multi-language workforces — handled.',
                     km: 'ពលករច្រើនវេន ច្រើនឧបករណ៍ ច្រើនភាសា — គ្រប់គ្រងបាន។',
                     zh: '多轮班、多设备、多语言员工 — 全部搞定。' },
    factoryB1:     { en: 'Shift handovers with cross-midnight calculation',
                     km: 'ការប្រគល់វេនជាមួយការគណនាឆ្លងពាក់កណ្តាលអាធ្រាត្រ',
                     zh: '跨午夜计算的轮班交接' },
    factoryB2:     { en: 'Weekend 2× and holiday 3× OT applied at the punch',
                     km: 'ម៉ោងបន្ថែម 2× ចុងសប្តាហ៍ និង 3× ថ្ងៃបុណ្យអនុវត្តពេលចូលធ្វើការ',
                     zh: '打卡即应用周末 2× 与节假日 3× 加班费率' },
    factoryB3:     { en: 'Many fingerprint terminals per floor, real-time roll call',
                     km: 'ឧបករណ៍ស្នាមម្រាមដៃច្រើនក្នុងជាន់ ត្រួតពិនិត្យវត្តមានជាក់ស្តែង',
                     zh: '每层楼部署多台指纹终端，实时点名' },
    factoryB4:     { en: 'Hi-vis dashboard for floor supervisors, not just HR',
                     km: 'Dashboard ច្បាស់សម្រាប់អ្នកគ្រប់គ្រងកម្រាល មិនមែនតែសម្រាប់ HR',
                     zh: '为车间主管而非仅为 HR 设计的醒目仪表盘' },
    officeTitle:   { en: 'Corporate Office',     km: 'ការិយាល័យសាជីវកម្ម',  zh: '企业办公室' },
    officeDesc:    { en: 'Salaried teams with structured roles and approvals.',
                     km: 'ក្រុមការងារទទួលប្រាក់ខែ ជាមួយតួនាទី និងការអនុម័តរៀបចំ។',
                     zh: '具备角色结构与审批流程的领薪团队。' },
    officeB1:      { en: 'Role-based permissions matrix',  km: 'ម៉ាទ្រីសសិទ្ធិតាមតួនាទី',
                     zh: '基于角色的权限矩阵' },
    officeB2:      { en: 'Manager-then-HR approval chains', km: 'ខ្សែសង្វាក់អនុម័ត Manager → HR',
                     zh: '主管再到 HR 的审批链' },
    multiTitle:    { en: 'Multi-Site Enterprise', km: 'សហគ្រាសច្រើនទីតាំង', zh: '多站点企业' },
    multiDesc:     { en: 'Each branch local, all of them in one view.',
                     km: 'សាខានីមួយៗក្នុងស្រុក រួមមើលក្នុងទិដ្ឋភាពតែមួយ។',
                     zh: '每个分支机构本地化运行，所有分支集中查看。' },
    multiB1:       { en: 'Survive internet outages, sync when back',
                     km: 'ដំណើរការទាំងពេលអ៊ីនធឺណែតដាច់ ភ្ជាប់នៅពេលមកវិញ',
                     zh: '断网仍可运行，恢复后自动同步' },
    multiB2:       { en: 'Per-site overrides, central rollups',
                     km: 'ការកំណត់តាមសាខា និងសរុបនៅកណ្តាល',
                     zh: '按站点覆盖配置，中心汇总' },
    smbTitle:      { en: 'Small Business',       km: 'អាជីវកម្មតូច',  zh: '中小企业' },
    smbDesc:       { en: 'Just enough HR, none of the bloat.',
                     km: 'មុខងារធនធានមនុស្សគ្រប់គ្រាន់ ដោយគ្មានភាពលំបាក។',
                     zh: '够用的 HR 功能，绝无臃肿。' },
    smbB1:         { en: 'Up and running in an afternoon', km: 'ដំណើរការក្នុងរសៀលតែមួយ',
                     zh: '一个下午即可上线' },
    smbB2:         { en: 'Grows with you, no replatform',  km: 'រីកចម្រើនជាមួយអ្នក គ្មានប្តូរប្រព័ន្ធ',
                     zh: '与您一同成长，无需更换平台' },
  },
  product: {
    eyebrow: { en: 'See the actual product',  km: 'មើលផលិតផលជាក់ស្តែង', zh: '查看真实产品' },
    title:   { en: 'Real screens, real Cambodian payroll',
               km: 'អេក្រង់ពិត ប្រាក់ខែកម្ពុជាពិត',
               zh: '真实界面，真实的柬埔寨薪资' },
    desc:    { en: 'Not a mockup — these are the screens your HR team will use on day one. Cambodia Tax on Salary, NSSF, multi-currency totals, and payslips ready for the employee inbox.',
               km: 'មិនមែនជាគំរូទេ — ទាំងនេះជាអេក្រង់ដែលក្រុម HR របស់អ្នកនឹងប្រើនៅថ្ងៃដំបូង។ ពន្ធលើប្រាក់ខែកម្ពុជា ប.ស.ស សរុបពហុរូបិយប័ណ្ណ និងបង្កាន់ដៃត្រៀមរួចសម្រាប់សារអ៊ីមែលបុគ្គលិក។',
               zh: '不是模型 — 这些是您的 HR 团队第一天就会使用的界面。柬埔寨薪资税、ប.ស.ស、多币种合计，以及可直接送达员工邮箱的工资单。' },
    payrollCap:  { en: 'Payroll Management — batch preview before posting',
                   km: 'គ្រប់គ្រងប្រាក់ខែ — មើលជាមុនមុនពេលបង្ហោះ',
                   zh: '薪资管理 — 发布前批量预览' },
  },
  metrics: {
    metric1Label: { en: 'Saved per HR week',   km: 'ពេលវេលាសន្សំក្នុងសប្តាហ៍',           zh: '每周节省的 HR 工时' },
    metric1Value: { en: '12+ hours',           km: '១២+ ម៉ោង',                          zh: '12+ 小时' },
    metric2Label: { en: 'Faster payroll',      km: 'ដំណើរការប្រាក់ខែលឿនជាង',             zh: '发薪速度提升' },
    metric2Value: { en: '8×',                  km: '៨ ដង',                              zh: '8 倍' },
    metric3Label: { en: 'TOS accuracy',        km: 'ភាពត្រឹមត្រូវនៃពន្ធលើប្រាក់ខែ',       zh: '薪资税准确度' },
    metric3Value: { en: '100%',                km: '១០០%',                              zh: '100%' },
    metric4Label: { en: 'Locations supported', km: 'ទីតាំងដែលគាំទ្រ',                    zh: '可支持地点数' },
    metric4Value: { en: 'Unlimited',           km: 'គ្មានកំណត់',                          zh: '无限制' },
  },
  modules: {
    sectionEyebrow: { en: 'What HRMS Portal does', km: 'អ្វីដែល HRMS Portal ធ្វើ', zh: 'HRMS Portal 提供什么' },
    sectionTitle:   { en: 'Everything you need to run HR in Cambodia',
                      km: 'អ្វីៗដែលអ្នកត្រូវការសម្រាប់ដំណើរការធនធានមនុស្សនៅកម្ពុជា',
                      zh: '在柬埔寨运营 HR 所需的一切' },
    sectionDesc:    { en: 'NSSF-compliant payroll · attendance tracking · payroll & payslip management · earnings & deductions · multi-device management · employee management · department & group · contract renewal. One platform, one database, one permission model.',
                      km: 'ប្រាក់ខែអនុលោម ប.ស.ស · តាមដានវត្តមាន · គ្រប់គ្រងប្រាក់ខែ និងបង្កាន់ដៃ · គ្រប់គ្រងប្រាក់ចំណូល និងការកាត់ · គ្រប់គ្រងឧបករណ៍ច្រើន · គ្រប់គ្រងបុគ្គលិក · នាយកដ្ឋាន និងក្រុម · ការបន្តកិច្ចសន្យា។ វេទិកាមួយ ទិន្នន័យតែមួយ គំរូសិទ្ធិតែមួយ។',
                      zh: '符合 ប.ស.ស 的薪资 · 考勤追踪 · 薪资与工资单管理 · 收入与扣款 · 多设备管理 · 员工管理 · 部门与分组 · 合同续签。一个平台，一个数据库，一套权限模型。' },
  },
  how: {
    sectionEyebrow: { en: 'How it works', km: 'របៀបដំណើរការ', zh: '使用流程' },
    sectionTitle:   { en: 'Up and running in days, not months',
                      km: 'ដំណើរការក្នុងពេលប៉ុន្មានថ្ងៃ មិនមែនពេលប៉ុន្មានខែទេ',
                      zh: '数天即可上线，无需数月' },
  },
  deploy: {
    eyebrow: { en: 'Stand-alone or Online — both available',
               km: 'Stand-alone ឬ Online — មានទាំងពីរ',
               zh: 'Stand-alone 或 Online — 两者皆可' },
    title:   { en: 'Run it your way',
               km: 'ដំណើរការតាមរបៀបរបស់អ្នក',
               zh: '按您的方式运行' },
    desc:    { en: 'Some sites need data to stay inside the building. Others want the convenience of cloud access. HRMS Portal supports both — and if you need both at once, Connect & Sync glues them together.',
               km: 'ទីតាំងខ្លះត្រូវការទិន្នន័យឱ្យនៅក្នុងអាគារ។ ខ្លះទៀតចង់បានភាពងាយស្រួលនៃការចូលប្រើតាមពពក។ HRMS Portal គាំទ្រទាំងពីរ — ហើយប្រសិនបើអ្នកត្រូវការទាំងពីរក្នុងពេលតែមួយ Connect & Sync ភ្ជាប់ពួកវាជាមួយគ្នា។',
               zh: '有些站点需要数据保留在内部，有些则希望享受云端访问的便利。HRMS Portal 同时支持两种方式 — 如需两者并用，Connect & Sync 会将它们无缝衔接。' },
    standaloneTitle: { en: 'Stand-alone',          km: 'Stand-alone',                       zh: 'Stand-alone（本地部署）' },
    standaloneSub:   { en: 'On-premise · your hardware', km: 'ក្នុងស្រុក · ឧបករណ៍របស់អ្នក', zh: '本地 · 您的硬件' },
    standaloneB1:    { en: 'Runs entirely inside your office network',
                       km: 'ដំណើរការទាំងស្រុងក្នុងបណ្តាញការិយាល័យរបស់អ្នក',
                       zh: '完全在您的办公网络内运行' },
    standaloneB2:    { en: 'No internet required for daily operation',
                       km: 'មិនទាមទារអ៊ីនធឺណែតសម្រាប់ដំណើរការប្រចាំថ្ងៃ',
                       zh: '日常运营无需互联网' },
    standaloneB3:    { en: 'Your data stays on your servers — full sovereignty',
                       km: 'ទិន្នន័យរបស់អ្នកនៅលើ Server របស់អ្នក — អធិបតេយ្យពេញលេញ',
                       zh: '数据留在您的服务器 — 完全自主可控' },
    standaloneB4:    { en: 'One-time install · perpetual licence option',
                       km: 'ដំឡើងតែម្តង · ជម្រើសសិទ្ធិអាជ្ញាប័ណ្ណជារៀងរហូត',
                       zh: '一次性安装 · 可选永久授权' },
    onlineTitle:     { en: 'Online',                km: 'Online',                          zh: 'Online（云端）' },
    onlineSub:       { en: 'Cloud-hosted · access anywhere', km: 'លើពពក · ចូលប្រើបាននៅគ្រប់ទីកន្លែង',
                       zh: '云端托管 · 随处可访问' },
    onlineB1:        { en: 'No infrastructure to manage on your side',
                       km: 'មិនមានហេដ្ឋារចនាសម្ព័ន្ធដែលត្រូវគ្រប់គ្រងពីខាងអ្នក',
                       zh: '无需自行管理基础设施' },
    onlineB2:        { en: 'Automatic backups and daily snapshots',
                       km: 'ចម្លងទុកដោយស្វ័យប្រវត្តិ និងស្នាប់សុតប្រចាំថ្ងៃ',
                       zh: '自动备份与每日快照' },
    onlineB3:        { en: 'Always running the latest features',
                       km: 'ដំណើរការមុខងារថ្មីបំផុតជានិច្ច',
                       zh: '始终运行最新功能' },
    onlineB4:        { en: 'HR managers log in from any browser',
                       km: 'អ្នកគ្រប់គ្រង HR ចូលប្រើពីកម្មវិធីរុករកណាមួយ',
                       zh: 'HR 主管在任意浏览器中登录' },
    hybridNote:      { en: 'Need both? Connect & Sync replicates every site to a central cloud automatically.',
                       km: 'ត្រូវការទាំងពីរ? Connect & Sync ចម្លងទីតាំងនីមួយៗទៅពពកកណ្តាលដោយស្វ័យប្រវត្តិ។',
                       zh: '需要两者并用？Connect & Sync 自动将各站点同步至中央云端。' },
  },
  cambodia: {
    eyebrow: { en: 'Cambodia-first compliance', km: 'អនុលោមតាមច្បាប់កម្ពុជា',
               zh: '柬埔寨合规优先' },
    title:   { en: 'Built for the way Cambodia does payroll',
               km: 'រចនាឡើងសម្រាប់របៀបធ្វើប្រាក់ខែនៅកម្ពុជា',
               zh: '为柬埔寨发薪方式量身打造' },
    desc:    { en: 'Most HR tools bend foreign rules to fit Cambodia. We started with the Cambodian payroll act — progressive Tax on Salary brackets, NSSF tiers, foreign tax credit, fringe benefits at the statutory 20%, dependents, residency status, and Khmer-language payslips — then built the rest of the suite around it.',
               km: 'ឧបករណ៍ធនធានមនុស្សភាគច្រើនព្យាយាមកែច្បាប់បរទេសឱ្យស្របនឹងកម្ពុជា។ យើងចាប់ផ្តើមដោយផ្អែកលើច្បាប់ប្រាក់ខែកម្ពុជា — ពន្ធលើប្រាក់ខែតាមថ្នាក់ ថ្នាក់ ប.ស.ស ការដកពន្ធបរទេស អត្ថប្រយោជន៍ 20% អ្នកនៅក្នុងបន្ទុក ស្ថានភាពអ្នករស់នៅ និងបង្កាន់ដៃប្រាក់ខែជាភាសាខ្មែរ — រួចសាងសង់មុខងារផ្សេងទៀតជុំវិញវា។',
               zh: '大多数 HR 工具都生搬硬套外国规则来适配柬埔寨。我们从柬埔寨薪资法出发 — 累进薪资税档次、ប.ស.ស 等级、外国税抵免、20% 法定附加福利、被扶养人、居民身份和柬文工资单 — 再以此构建其余功能。' },
  },
  workingRule: {
    eyebrow: { en: 'Cambodia labour-law cheatsheet',
               km: 'សេចក្តីសង្ខេបច្បាប់ការងារកម្ពុជា',
               zh: '柬埔寨劳动法速查表' },
    title:   { en: 'The working rules every HR officer needs at hand',
               km: 'ច្បាប់ការងារដែលមន្ត្រី HR ត្រូវការក្បែរដៃ',
               zh: 'HR 必须随手掌握的工作规则' },
    desc:    { en: 'A quick reference for the same statutes the system automates — hours, overtime, paid leave, social security, and Tax on Salary. Numbers below trace back to the Labour Law of Cambodia (1997, amended through the 2018 Prakas), the General Department of Taxation, and the National Social Security Fund.',
               km: 'សេចក្តីយោងរហ័សសម្រាប់ច្បាប់ដែលប្រព័ន្ធគ្រប់គ្រងដោយស្វ័យប្រវត្តិ — ម៉ោងធ្វើការ ការងារបន្ថែម ការឈប់សម្រាក សន្តិសុខសង្គម និងពន្ធលើប្រាក់ខែ។ លេខខាងក្រោមផ្អែកលើច្បាប់ការងារនៃកម្ពុជា (១៩៩៧ កែប្រែតាមប្រកាស ២០១៨) អគ្គនាយកដ្ឋានពន្ធដារ និងបេឡាជាតិសន្តិសុខសង្គម។',
               zh: '与系统自动化处理同源的法规速查 — 工作时间、加班、带薪假、社会保障与薪资税。下列数据均依据柬埔寨劳动法（1997 年，2018 年公告修订）、税务总局及国家社会保障基金（ប.ស.ស）。' },
    source:  { en: 'Sources: Cambodian Labour Law · 2018 Prakas on Seniority Indemnity · General Department of Taxation · NSSF',
               km: 'ប្រភព៖ ច្បាប់ការងារកម្ពុជា · ប្រកាសឆ្នាំ ២០១៨ ស្តីពីប្រាក់ចូលនិវត្តន៍ · អគ្គនាយកដ្ឋានពន្ធដារ · ប.ស.ស',
               zh: '资料来源：柬埔寨劳动法 · 2018 年关于工龄抚恤金的公告 · 税务总局 · ប.ស.ស' },
  },
  benefitCalcs: {
    eyebrow: { en: 'Five one-shot calculators',
               km: 'ឧបករណ៍គណនាប្រាំ',
               zh: '五个一次性计算器' },
    title:   { en: 'Benefit Calculator — built into Payroll Management',
               km: 'ឧបករណ៍គណនាអត្ថប្រយោជន៍ — នៅក្នុងការគ្រប់គ្រងប្រាក់ខែ',
               zh: '福利计算器 — 内建于薪资管理' },
    desc:    { en: 'A dedicated sub-menu under Payroll with five calculators for the lines that don\'t fit the regular monthly Salary batch. Each picks the right window, previews the eligibility table, and routes a dedicated payroll batch through the standard approval flow.',
               km: 'អនុម៉ឺនុយឧទ្ទិសក្នុងប្រាក់ខែ ដែលមានឧបករណ៍គណនាប្រាំ សម្រាប់បន្ទាត់ដែលមិនសមនឹង Salary ប្រចាំខែ។',
               zh: '薪资管理下的专用子菜单，包含 5 个计算器，处理常规月度薪资批次无法涵盖的项目。每个计算器都会选择合适的时间窗口、预览资格表，并通过标准审批流程生成专用薪资批次。' },
  },
  benefitFormulas: {
    eyebrow: { en: 'How the calculators work',
               km: 'របៀបដែលឧបករណ៍គណនាដំណើរការ',
               zh: '计算器是如何工作的' },
    title:   { en: 'Seniority & 5% Severance — the math, with a worked example',
               km: 'អតីតភាព និងសំណង ៥% — រូបមន្ត និងឧទាហរណ៍',
               zh: '工龄抚恤金 与 5% 解雇赔偿 — 公式与示例' },
    desc:    { en: 'Both lines are produced by the in-app Benefit Calculator and routed through the standard payroll-batch approval flow. Here is exactly what the numbers mean.',
               km: 'ទាំងពីរត្រូវបានបង្កើតដោយឧបករណ៍គណនាអត្ថប្រយោជន៍ និងបញ្ជូនតាមដំណើរការអនុម័តប្រាក់បៀវត្ស។ នេះជាអត្ថន័យពិតប្រាកដនៃលេខទាំងនោះ។',
               zh: '两项均由应用内的福利计算器生成，并通过标准的薪资批次审批流程发放。下面是这些数字背后的精确含义。' },
  },
  testimonials: {
    eyebrow: { en: 'What teams say', km: 'អ្វីដែលក្រុមការងារនិយាយ', zh: '客户怎么说' },
    title:   { en: 'HR teams trade spreadsheets for one source of truth',
               km: 'ក្រុមធនធានមនុស្សផ្លាស់ប្តូរពីសៀវភៅគណនេយ្យទៅជាប្រភពទិន្នន័យតែមួយ',
               zh: 'HR 团队用电子表格换来唯一可信的数据来源' },
  },
  faq: {
    eyebrow: { en: 'Questions, answered',  km: 'សំណួរ និងចម្លើយ', zh: '问题解答' },
    title:   { en: 'Frequently asked',     km: 'សំណួរញឹកញាប់',    zh: '常见问题' },
  },
  cta: {
    title:    { en: 'Ready to stop fighting your spreadsheets?',
                km: 'រួចរាល់ឈប់តស៊ូជាមួយសៀវភៅគណនេយ្យហើយឬនៅ?',
                zh: '准备好告别繁琐的电子表格了吗？' },
    subtitle: { en: 'See your team’s first payroll close in minutes — built for Cambodian factories and offices alike.',
                km: 'មើលប្រាក់ខែដំបូងរបស់ក្រុមអ្នកបិទក្នុងពេលប៉ុន្មាននាទី — រចនាសម្រាប់រោងចក្រ និងការិយាល័យកម្ពុជា។',
                zh: '几分钟内就能完成团队的首次发薪 — 为柬埔寨工厂与办公室共同打造。' },
  },
  footer: {
    tagline: { en: 'The HR platform built for Cambodian businesses.',
               km: 'វេទិកាធនធានមនុស្សដែលរចនាសម្រាប់អាជីវកម្មកម្ពុជា។',
               zh: '为柬埔寨企业打造的 HR 平台。' },
    product: { en: 'Product',  km: 'ផលិតផល',   zh: '产品' },
    company: { en: 'Company',  km: 'ក្រុមហ៊ុន', zh: '公司' },
    contact: { en: 'Contact',  km: 'ទំនាក់ទំនង', zh: '联系我们' },
    rights:  { en: 'All rights reserved.', km: 'រក្សាសិទ្ធិគ្រប់យ៉ាង។', zh: '版权所有。' },
  },
} as const;

/** Helper — picks the right language variant. Falls back to English when a
 *  Chinese variant is missing so partial translations don't crash the page. */
function t(entry: { en: string; km: string; zh?: string }, lang: Lang) {
  if (lang === 'zh') return entry.zh ?? entry.en;
  return entry[lang];
}

/** Container with the page max-width + responsive padding used by every section. */
function Container({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-7xl px-6 sm:px-8 lg:px-12 ${className}`}>{children}</div>;
}

/** Small eyebrow label above section titles. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-700">
      <Sparkles className="h-3.5 w-3.5" />
      {children}
    </p>
  );
}

/** Top navigation: brand on the left, anchor links + language + Sign In on the right. */
function LandingNav({
  lang, setLang, onSignIn, onDemo,
}: { lang: Lang; setLang: (l: Lang) => void; onSignIn: () => void; onDemo?: () => void }) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70">
      <Container className="flex h-16 items-center justify-between">
        <a href="#top" className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white">
            <Building2 className="h-5 w-5" />
          </span>
          <span className="text-base font-semibold tracking-tight">HRMS Portal</span>
        </a>

        <nav className="hidden items-center gap-8 text-sm text-slate-600 md:flex">
          <a href="#modules"     className="hover:text-slate-900">{t(T.nav.modules, lang)}</a>
          <a href="#how"         className="hover:text-slate-900">{t(T.nav.howItWorks, lang)}</a>
          <a href="#rules"       className="hover:text-slate-900">{t(T.nav.rules, lang)}</a>
          <a href="#faq"         className="hover:text-slate-900">{t(T.nav.faq, lang)}</a>
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLang(lang === 'en' ? 'km' : lang === 'km' ? 'zh' : 'en')}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            aria-label="Toggle language"
            title={lang === 'en' ? 'Switch to Khmer' : lang === 'km' ? '切换到中文' : 'Switch to English'}
          >
            <Languages className="h-3.5 w-3.5" />
            {lang === 'en' ? 'ខ្មែរ' : lang === 'km' ? '中文' : 'EN'}
          </button>
          {onDemo && (
            <Button
              variant="outline"
              size="sm"
              onClick={onDemo}
              className="hidden sm:inline-flex border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              title="Sign in as admin@demo.com"
            >
              {t(T.nav.tryDemo, lang)}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onSignIn} className="hidden sm:inline-flex">
            {t(T.nav.signIn, lang)}
          </Button>
          <Button size="sm" onClick={onSignIn}>
            {t(T.nav.getStarted, lang)}
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </div>
      </Container>
    </header>
  );
}

/** Hero block with gradient background, dual CTA, and a stylised dashboard preview on the right. */
function Hero({ lang, onSignIn, onDemo }: { lang: Lang; onSignIn: () => void; onDemo?: () => void }) {
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-indigo-50" aria-hidden />
      <div
        className="absolute -top-24 right-0 -z-0 h-[480px] w-[480px] rounded-full bg-gradient-to-tr from-blue-200/40 to-indigo-200/40 blur-3xl"
        aria-hidden
      />
      <Container className="relative grid items-center gap-12 py-20 lg:grid-cols-2 lg:py-28">
        <div>
          <Badge variant="secondary" className="mb-5 bg-blue-100 text-blue-700 hover:bg-blue-100">
            {t(T.hero.eyebrow, lang)}
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            {t(T.hero.title1, lang)}{' '}
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              {t(T.hero.title2, lang)}
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
            {t(T.hero.subtitle, lang)}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={onSignIn} className="h-12 px-6 text-base">
              {t(T.hero.ctaPrimary, lang)}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            {onDemo && (
              <Button
                size="lg"
                variant="outline"
                onClick={onDemo}
                className="h-12 px-6 text-base border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                title="Sign in as admin@demo.com"
              >
                {t(T.nav.tryDemo, lang)}
              </Button>
            )}
            <Button size="lg" variant="outline" asChild className="h-12 px-6 text-base">
              <a href="#how">{t(T.hero.ctaSecondary, lang)}</a>
            </Button>
          </div>
          <p className="mt-5 text-sm text-slate-500">{t(T.hero.trustNote, lang)}</p>

          {/* Industry chips — visual reinforcement of the "factory + company + all sizes" pitch. */}
          <div className="mt-8 flex flex-wrap items-center gap-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t(T.hero.chipsLabel, lang)}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm">
              <Factory className="h-3.5 w-3.5 text-blue-600" />
              {t(T.industries.factoryTitle, lang)}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm">
              <Briefcase className="h-3.5 w-3.5 text-indigo-600" />
              {t(T.industries.officeTitle, lang)}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm">
              <Cloud className="h-3.5 w-3.5 text-emerald-600" />
              {t(T.industries.multiTitle, lang)}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm">
              <Store className="h-3.5 w-3.5 text-amber-600" />
              {t(T.industries.smbTitle, lang)}
            </span>
          </div>
        </div>

        {/* Stylised dashboard preview — pure CSS, no screenshot dependencies. */}
        <div className="relative">
          <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-blue-200/30 to-indigo-200/30 blur-2xl" aria-hidden />
          <Card className="relative overflow-hidden border-slate-200/70 shadow-2xl">
            <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <span className="ml-3 text-xs text-slate-400">hrms.local · Dashboard</span>
            </div>
            <CardContent className="p-6">
              <div className="grid grid-cols-3 gap-3">
                <MiniStat icon={Users}      label="Employees"     value="248" tone="blue" />
                <MiniStat icon={Clock}      label="Present today" value="231" tone="emerald" />
                <MiniStat icon={TimerIcon}  label="OT pending"    value="14"  tone="amber" />
              </div>
              <div className="mt-5 rounded-lg border border-slate-100 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-500">This month · Payroll</p>
                  <span className="text-[10px] font-medium text-emerald-600">+4.2%</span>
                </div>
                <div className="flex items-end gap-1.5 h-20">
                  {[40, 60, 45, 70, 55, 80, 65, 90, 72, 95, 84, 100].map((h, i) => (
                    <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-blue-500 to-indigo-500" style={{ height: `${h}%` }} />
                  ))}
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2.5 text-xs">
                <span className="flex items-center gap-2 font-medium text-emerald-700">
                  <Fingerprint className="h-3.5 w-3.5" />
                  4 of 5 devices syncing
                </span>
                <span className="text-emerald-600">30s ago</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </Container>
    </section>
  );
}

function MiniStat({
  icon: Icon, label, value, tone,
}: { icon: React.ElementType; label: string; value: string; tone: 'blue' | 'emerald' | 'amber' }) {
  const tones = {
    blue:    'bg-blue-50 text-blue-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber:   'bg-amber-50 text-amber-700',
  } as const;
  return (
    <div className="rounded-lg border border-slate-100 p-3">
      <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${tones[tone]}`}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <p className="mt-2 text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

/** Numbers strip directly below the hero — short, scannable. */
function MetricsStrip({ lang }: { lang: Lang }) {
  const items = [
    { v: t(T.metrics.metric1Value, lang), l: t(T.metrics.metric1Label, lang) },
    { v: t(T.metrics.metric2Value, lang), l: t(T.metrics.metric2Label, lang) },
    { v: t(T.metrics.metric3Value, lang), l: t(T.metrics.metric3Label, lang) },
    { v: t(T.metrics.metric4Value, lang), l: t(T.metrics.metric4Label, lang) },
  ];
  return (
    <section className="border-y border-slate-100 bg-slate-50/50 py-10">
      <Container>
        <dl className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {items.map((it, i) => (
            <div key={i}>
              <dt className="text-3xl font-bold tracking-tight text-slate-900">{it.v}</dt>
              <dd className="mt-1 text-sm text-slate-600">{it.l}</dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// SVG industry illustrations — hand-drawn flat scenes, no external assets.
// All scenes share a palette aligned with the page's blue/slate accents so they
// read as a cohesive set.
// ──────────────────────────────────────────────────────────────────────────────

/** Featured factory scene — buildings, smokestacks, conveyor, workers, time clock. */
function FactoryScene({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 600 400" className={className} aria-hidden xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fsky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#dbeafe" />
          <stop offset="100%" stopColor="#eff6ff" />
        </linearGradient>
        <linearGradient id="fmain" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e40af" />
          <stop offset="100%" stopColor="#1e3a8a" />
        </linearGradient>
      </defs>

      {/* Sky */}
      <rect width="600" height="320" fill="url(#fsky)" />
      <circle cx="500" cy="60" r="32" fill="#fef3c7" opacity="0.85" />
      <ellipse cx="100" cy="50" rx="40" ry="8" fill="#ffffff" opacity="0.7" />
      <ellipse cx="200" cy="80" rx="30" ry="6" fill="#ffffff" opacity="0.6" />

      {/* Back factory block */}
      <polygon points="40,140 100,110 160,140" fill="#1e293b" />
      <rect x="40" y="140" width="120" height="180" fill="#475569" />
      {/* Window rows on back block */}
      {[160, 184, 208, 232].map(y => (
        <g key={y}>
          {[60, 80, 100, 120, 140].map(x => (
            <rect key={`${x}-${y}`} x={x} y={y} width="14" height="14" fill={x === 100 && y === 160 ? '#fbbf24' : '#fef3c7'} />
          ))}
        </g>
      ))}

      {/* Smokestacks */}
      <rect x="170" y="80"  width="16" height="240" fill="#64748b" />
      <rect x="195" y="100" width="16" height="220" fill="#64748b" />
      <ellipse cx="178" cy="70" rx="14" ry="6" fill="#e2e8f0" opacity="0.85" />
      <ellipse cx="170" cy="50" rx="22" ry="8" fill="#e2e8f0" opacity="0.65" />
      <ellipse cx="203" cy="90" rx="12" ry="5" fill="#e2e8f0" opacity="0.75" />

      {/* Main factory building with sawtooth roof */}
      <polygon
        points="220,120 250,90 280,120 310,90 340,120 370,90 400,120 420,120 420,140 220,140"
        fill="#1e3a8a"
      />
      <rect x="220" y="140" width="200" height="180" fill="url(#fmain)" />
      {/* Window grid with attendance-status colour cues */}
      {[
        [150, ['e','e','e','e','e','e']],
        [180, ['e','e','p','e','e','e']],
        [210, ['e','e','e','e','l','e']],
      ].map(([y, row]) => (
        <g key={y as number}>
          {(row as string[]).map((status, i) => {
            const fill =
              status === 'p' ? '#22c55e' :
              status === 'l' ? '#fbbf24' :
              '#fef3c7';
            return (
              <rect
                key={i}
                x={240 + i * 30}
                y={y as number}
                width="20"
                height="20"
                fill={fill}
              />
            );
          })}
        </g>
      ))}
      {/* Entrance */}
      <rect x="310" y="260" width="40" height="60" fill="#0f172a" />
      <line x1="330" y1="260" x2="330" y2="320" stroke="#334155" strokeWidth="2" />

      {/* Side shed */}
      <polygon points="440,180 500,150 560,180" fill="#475569" />
      <rect x="440" y="180" width="120" height="140" fill="#64748b" />
      <rect x="470" y="260" width="30" height="60" fill="#0f172a" />

      {/* Ground */}
      <rect y="320" width="600" height="80" fill="#cbd5e1" />

      {/* Conveyor belt */}
      <rect x="0" y="340" width="600" height="6" fill="#1e293b" />
      <circle cx="20"  cy="343" r="6" fill="#0f172a" />
      <circle cx="580" cy="343" r="6" fill="#0f172a" />
      {[40, 130, 220, 310, 400, 490].map(x => (
        <rect key={x} x={x} y="324" width="32" height="16" fill="#a16207" rx="2" />
      ))}

      {/* Fingerprint time-clock device */}
      <g transform="translate(60 240)">
        <rect x="0" y="0" width="50" height="80" rx="6" fill="#0f172a" />
        <rect x="6" y="8" width="38" height="22" fill="#22c55e" />
        <text x="25" y="24" textAnchor="middle" fontFamily="monospace" fontSize="11" fill="#fff">07:32</text>
        <circle cx="25" cy="52" r="11" fill="#3b82f6" />
        <path d="M 19 52 Q 25 44 31 52 Q 25 60 19 52 Z" fill="#fff" />
      </g>

      {/* Worker 1 — hard hat + hi-vis vest */}
      <g transform="translate(150 244)">
        <circle cx="0" cy="10" r="10" fill="#fed7aa" />
        <path d="M -12 8 Q -12 -2 0 -2 Q 12 -2 12 8 Z" fill="#f59e0b" />
        <rect x="-12" y="20" width="24" height="36" rx="2" fill="#facc15" />
        <rect x="-14" y="20" width="4" height="18" fill="#fed7aa" />
        <rect x="10"  y="20" width="4" height="18" fill="#fed7aa" />
        <rect x="-8"  y="56" width="6" height="20" fill="#1e3a8a" />
        <rect x="2"   y="56" width="6" height="20" fill="#1e3a8a" />
      </g>

      {/* Worker 2 */}
      <g transform="translate(380 244)">
        <circle cx="0" cy="10" r="10" fill="#fed7aa" />
        <path d="M -12 8 Q -12 -2 0 -2 Q 12 -2 12 8 Z" fill="#f59e0b" />
        <rect x="-12" y="20" width="24" height="36" rx="2" fill="#facc15" />
        <rect x="-14" y="20" width="4" height="18" fill="#fed7aa" />
        <rect x="10"  y="20" width="4" height="18" fill="#fed7aa" />
        <rect x="-8"  y="56" width="6" height="20" fill="#1e3a8a" />
        <rect x="2"   y="56" width="6" height="20" fill="#1e3a8a" />
      </g>

      {/* Connectivity pulses from device toward main building */}
      <circle cx="120" cy="265" r="3" fill="#3b82f6" opacity="0.65">
        <animate attributeName="opacity" values="0.65;0.05;0.65" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="160" cy="270" r="3" fill="#3b82f6" opacity="0.45">
        <animate attributeName="opacity" values="0.45;0.05;0.45" dur="2.2s" repeatCount="indefinite" />
      </circle>
      <circle cx="200" cy="275" r="3" fill="#3b82f6" opacity="0.35">
        <animate attributeName="opacity" values="0.35;0.05;0.35" dur="2.4s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

/** Compact office-tower scene. */
function OfficeScene({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 200" className={className} aria-hidden xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="osky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e0e7ff" />
          <stop offset="100%" stopColor="#f5f3ff" />
        </linearGradient>
      </defs>
      <rect width="240" height="170" fill="url(#osky)" />
      <circle cx="200" cy="40" r="18" fill="#fef3c7" opacity="0.85" />
      {/* tower A */}
      <rect x="30" y="60" width="60" height="110" fill="#4338ca" />
      {[0,1,2,3,4].map(r => [0,1,2].map(c => (
        <rect key={`a-${r}-${c}`} x={36 + c * 18} y={70 + r * 18} width="12" height="10"
              fill={r === 2 && c === 1 ? '#22c55e' : '#fde68a'} />
      )))}
      {/* tower B taller */}
      <rect x="100" y="40" width="50" height="130" fill="#6366f1" />
      <polygon points="100,40 125,20 150,40" fill="#4338ca" />
      {[0,1,2,3,4,5,6].map(r => [0,1].map(c => (
        <rect key={`b-${r}-${c}`} x={108 + c * 20} y={50 + r * 16} width="14" height="10"
              fill={r === 3 && c === 0 ? '#22c55e' : '#fde68a'} />
      )))}
      {/* tower C */}
      <rect x="160" y="80" width="50" height="90" fill="#7c3aed" />
      {[0,1,2,3].map(r => [0,1].map(c => (
        <rect key={`c-${r}-${c}`} x={168 + c * 20} y={90 + r * 18} width="14" height="10"
              fill="#fde68a" />
      )))}
      {/* ground */}
      <rect y="170" width="240" height="30" fill="#cbd5e1" />
      {/* avatar trio */}
      <g transform="translate(40 178)">
        {[0,16,32].map((x, i) => (
          <g key={i} transform={`translate(${x} 0)`}>
            <circle cx="6" cy="6" r="6" fill={['#6366f1','#22c55e','#f59e0b'][i]} />
            <rect x="0" y="12" width="12" height="10" fill={['#6366f1','#22c55e','#f59e0b'][i]} rx="2" />
          </g>
        ))}
      </g>
    </svg>
  );
}

/** Multi-site scene — pins on a stylised map joined to a central cloud. */
function MultiSiteScene({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 200" className={className} aria-hidden xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="msbg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ecfdf5" />
          <stop offset="100%" stopColor="#f0fdf4" />
        </linearGradient>
      </defs>
      <rect width="240" height="200" fill="url(#msbg)" />
      {/* abstract land mass */}
      <path
        d="M 30 80 Q 60 60 90 80 T 160 90 Q 200 80 220 100 L 220 160 Q 180 170 140 160 T 60 170 Q 30 160 30 130 Z"
        fill="#86efac" opacity="0.6"
      />
      {/* central cloud hub */}
      <g transform="translate(120 50)">
        <ellipse cx="0" cy="0" rx="32" ry="14" fill="#10b981" />
        <ellipse cx="-14" cy="-6" rx="14" ry="10" fill="#10b981" />
        <ellipse cx="14"  cy="-6" rx="14" ry="10" fill="#10b981" />
        <path d="M -10 -2 L -3 5 L 12 -10" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>
      {/* dashed lines from cloud to sites */}
      {[[60, 130],[120, 150],[180, 130],[90, 110],[170, 100]].map(([x, y], i) => (
        <line key={i} x1="120" y1="60" x2={x} y2={y} stroke="#10b981" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6" />
      ))}
      {/* pins */}
      {[[60, 130, '#10b981'],[120, 150, '#10b981'],[180, 130, '#10b981'],[90, 110, '#fbbf24'],[170, 100, '#10b981']].map(([x, y, c], i) => (
        <g key={i} transform={`translate(${x as number} ${y as number})`}>
          <path d="M 0 -16 Q -10 -16 -10 -6 Q -10 4 0 12 Q 10 4 10 -6 Q 10 -16 0 -16 Z" fill={c as string} />
          <circle cx="0" cy="-6" r="4" fill="#fff" />
        </g>
      ))}
    </svg>
  );
}

/** Small-business storefront. */
function RetailScene({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 200" className={className} aria-hidden xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="rsky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fef3c7" />
          <stop offset="100%" stopColor="#fff7ed" />
        </linearGradient>
      </defs>
      <rect width="240" height="170" fill="url(#rsky)" />
      <circle cx="40" cy="40" r="16" fill="#fef3c7" opacity="0.9" />
      {/* storefront */}
      <rect x="40" y="80" width="160" height="90" fill="#fde68a" />
      {/* awning stripes */}
      <g>
        {[0,1,2,3,4,5,6,7].map(i => (
          <rect key={i} x={40 + i * 20} y="70" width="20" height="14" fill={i % 2 === 0 ? '#dc2626' : '#fff'} />
        ))}
      </g>
      {/* sign */}
      <rect x="80" y="86" width="80" height="18" fill="#1f2937" rx="2" />
      <text x="120" y="100" textAnchor="middle" fontFamily="sans-serif" fontSize="11" fontWeight="bold" fill="#fff">SHOP</text>
      {/* window */}
      <rect x="50" y="116" width="50" height="50" fill="#bfdbfe" />
      <line x1="75" y1="116" x2="75" y2="166" stroke="#fde68a" strokeWidth="2" />
      <line x1="50" y1="141" x2="100" y2="141" stroke="#fde68a" strokeWidth="2" />
      {/* door */}
      <rect x="110" y="116" width="40" height="54" fill="#7c2d12" />
      <circle cx="143" cy="143" r="2" fill="#fbbf24" />
      {/* counter window right */}
      <rect x="160" y="116" width="32" height="50" fill="#bfdbfe" />
      {/* avatar at counter */}
      <g transform="translate(176 130)">
        <circle cx="0" cy="0" r="6" fill="#fed7aa" />
        <rect x="-7" y="6" width="14" height="14" fill="#dc2626" rx="2" />
      </g>
      <rect y="170" width="240" height="30" fill="#cbd5e1" />
    </svg>
  );
}

/** Industries section — Factory is the lead, the other three are smaller cards. */
function Industries({ lang }: { lang: Lang }) {
  return (
    <section className="bg-slate-50/60 py-20 sm:py-24">
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow>{t(T.industries.eyebrow, lang)}</Eyebrow>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            {t(T.industries.title, lang)}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600">
            {t(T.industries.desc, lang)}
          </p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-5">
          {/* Featured factory card (spans 3 of 5 cols on lg) */}
          <Card className="relative overflow-hidden border-blue-200 shadow-lg lg:col-span-3">
            <div className="absolute right-5 top-5 z-10">
              <Badge className="bg-blue-600 text-white hover:bg-blue-600">
                <Factory className="mr-1 h-3 w-3" />
                {t(T.industries.factoryBadge, lang)}
              </Badge>
            </div>
            <FactoryScene className="w-full" />
            <CardContent className="p-7">
              <h3 className="text-2xl font-bold tracking-tight text-slate-900">
                {t(T.industries.factoryTitle, lang)}
              </h3>
              <p className="mt-2 text-base text-slate-600">{t(T.industries.factoryDesc, lang)}</p>
              <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
                {[T.industries.factoryB1, T.industries.factoryB2, T.industries.factoryB3, T.industries.factoryB4].map((b, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                    <span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-blue-50 text-blue-600">
                      <Check className="h-3 w-3" />
                    </span>
                    <span>{t(b, lang)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Three secondary industry cards stacked on lg (each spans 2 of 5 → 2+3=5, but we want stacked
              right column — use col-span-2 with vertical grid).  */}
          <div className="grid gap-6 lg:col-span-2">
            <IndustryMiniCard
              illustration={<OfficeScene className="h-full w-full" />}
              title={t(T.industries.officeTitle, lang)}
              desc={t(T.industries.officeDesc, lang)}
              bullets={[t(T.industries.officeB1, lang), t(T.industries.officeB2, lang)]}
              icon={Briefcase}
              tone="indigo"
            />
            <IndustryMiniCard
              illustration={<MultiSiteScene className="h-full w-full" />}
              title={t(T.industries.multiTitle, lang)}
              desc={t(T.industries.multiDesc, lang)}
              bullets={[t(T.industries.multiB1, lang), t(T.industries.multiB2, lang)]}
              icon={Cloud}
              tone="emerald"
            />
            <IndustryMiniCard
              illustration={<RetailScene className="h-full w-full" />}
              title={t(T.industries.smbTitle, lang)}
              desc={t(T.industries.smbDesc, lang)}
              bullets={[t(T.industries.smbB1, lang), t(T.industries.smbB2, lang)]}
              icon={Store}
              tone="amber"
            />
          </div>
        </div>
      </Container>
    </section>
  );
}

/** Small horizontal card used for the three non-featured industries. */
function IndustryMiniCard({
  illustration, title, desc, bullets, icon: Icon, tone,
}: {
  illustration: React.ReactNode;
  title: string;
  desc: string;
  bullets: string[];
  icon: React.ElementType;
  tone: 'indigo' | 'emerald' | 'amber';
}) {
  const tones = {
    indigo:  'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber:   'bg-amber-50 text-amber-600',
  } as const;
  return (
    <Card className="overflow-hidden border-slate-200/70 shadow-sm">
      <div className="grid grid-cols-5">
        <div className="col-span-2 bg-slate-50">{illustration}</div>
        <div className="col-span-3 p-5">
          <div className="flex items-center gap-2">
            <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${tones[tone]}`}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">{desc}</p>
          <ul className="mt-2.5 space-y-1.5">
            {bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-slate-700">
                <Check className="mt-0.5 h-3 w-3 flex-none text-emerald-600" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

/** Real-product showcase — single hero screenshot + a feature list alongside.
 *  Only the Payroll Management view is shown because the other available
 *  screenshots contain real Cambodian employee names. */
function RealProduct({ lang }: { lang: Lang }) {
  const highlights: Array<{ icon: React.ElementType; t: { en: string; km: string; zh: string } }> = [
    { icon: Receipt, t: { en: 'Batch payroll preview before posting',
                          km: 'មើលជាមុនមុនពេលបង្ហោះ',
                          zh: '发布前批量预览薪资' } },
    { icon: Check,   t: { en: 'Earnings, deductions, OT, allowances on one row',
                          km: 'ប្រាក់ចំណូល ការកាត់ ម៉ោងបន្ថែម និងប្រាក់បន្ថែមនៅជួរតែមួយ',
                          zh: '收入、扣款、加班与津贴在同一行显示' } },
    { icon: Globe,   t: { en: 'Multi-currency totals (KHR + USD)',
                          km: 'សរុបពហុរូបិយប័ណ្ណ (រៀល + ដុល្លារ)',
                          zh: '多币种合计（柬币 + 美元）' } },
    { icon: Lock,    t: { en: 'Approval gate before any line writes to the ledger',
                          km: 'ខ្សែសង្វាក់អនុម័តមុនពេលសរសេរទៅសៀវភៅ',
                          zh: '所有条目写入账本前均须审批' } },
  ];

  return (
    <section className="py-20 sm:py-24">
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow>{t(T.product.eyebrow, lang)}</Eyebrow>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            {t(T.product.title, lang)}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600">{t(T.product.desc, lang)}</p>
        </div>

        <div className="mt-14 grid items-center gap-10 lg:grid-cols-5">
          <figure className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl lg:col-span-3">
            <div className="aspect-[5/3] overflow-hidden bg-slate-50">
              <img
                src={imgPayroll}
                alt={t(T.product.payrollCap, lang)}
                loading="lazy"
                className="h-full w-full object-cover object-top"
              />
            </div>
            <figcaption className="border-t border-slate-100 bg-slate-50/50 px-5 py-3 text-xs font-medium text-slate-600">
              {t(T.product.payrollCap, lang)}
            </figcaption>
          </figure>

          <ul className="space-y-4 lg:col-span-2">
            {highlights.map((h, i) => (
              <li key={i} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <h.icon className="h-4 w-4" />
                </span>
                <span className="pt-1.5 text-sm leading-relaxed text-slate-700">{t(h.t, lang)}</span>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}

/** Eleven feature cards covering the actual nav modules. */
function ModulesGrid({ lang }: { lang: Lang }) {
  type Tone = 'blue' | 'emerald' | 'amber' | 'indigo' | 'rose' | 'violet' | 'cyan' | 'slate';
  const toneClasses: Record<Tone, string> = {
    blue:    'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber:   'bg-amber-50 text-amber-600',
    indigo:  'bg-indigo-50 text-indigo-600',
    rose:    'bg-rose-50 text-rose-600',
    violet:  'bg-violet-50 text-violet-600',
    cyan:    'bg-cyan-50 text-cyan-600',
    slate:   'bg-slate-100 text-slate-600',
  };
  // Cards map 1:1 to the keyword list that describes this product:
  //   NSSF-compliant payroll, attendance tracking, payroll & payslip,
  //   earnings & deductions, multi-device, employee, department/group,
  //   contract renewal — plus the supporting reports & multi-site sync cards.
  const modules: Array<{
    icon: React.ElementType; tone: Tone;
    title: { en: string; km: string; zh: string };
    desc:  { en: string; km: string; zh: string };
  }> = [
    { icon: ShieldCheck, tone: 'emerald',
      title: { en: 'NSSF-Compliant Payroll',
               km: 'ប្រាក់ខែអនុលោម ប.ស.ស',
               zh: '符合 ប.ស.ស 的薪资' },
      desc:  { en: 'Cambodia Tax on Salary, ប.ស.ស tiers, fringe benefits at 20%, dependents, and foreign tax credit — every payslip statutory-correct out of the box.',
               km: 'ពន្ធលើប្រាក់ខែកម្ពុជា ថ្នាក់ ប.ស.ស អត្ថប្រយោជន៍ 20% អ្នកនៅក្នុងបន្ទុក និងការដកពន្ធបរទេស — បង្កាន់ដៃនីមួយៗត្រូវតាមច្បាប់ពីដំបូង។',
               zh: '柬埔寨薪资税、ប.ស.ស 等级、20% 附加福利、被扶养人和外国税抵免 — 每张工资单开箱即合法合规。' } },
    { icon: Clock, tone: 'blue',
      title: { en: 'Attendance Tracking',
               km: 'តាមដានវត្តមាន',
               zh: '考勤追踪' },
      desc:  { en: 'Daily punches, weekend & holiday rules, late thresholds, lunch deductions, and flexible schedules — one source of truth for every clock-in.',
               km: 'ម៉ោងចូលចេញ ច្បាប់ចុងសប្តាហ៍ និងថ្ងៃបុណ្យ កំណត់យឺត ការដកម៉ោងសម្រាប់អាហារ និងកាលវិភាគទន់ភ្លន់ — ប្រភពទិន្នន័យតែមួយសម្រាប់រាល់ការចូលធ្វើការ។',
               zh: '每日打卡、周末与节假日规则、迟到阈值、午休扣减及弹性班次 — 每次打卡的唯一数据来源。' } },
    { icon: Receipt, tone: 'indigo',
      title: { en: 'Payroll & Payslip Management',
               km: 'គ្រប់គ្រងប្រាក់ខែ និងបង្កាន់ដៃ',
               zh: '薪资与工资单管理' },
      desc:  { en: 'Batch preview before posting, multi-currency totals (KHR + USD), and PDF payslips ready for the employee inbox in Khmer or English.',
               km: 'មើលជាមុនមុនពេលបង្ហោះ សរុបពហុរូបិយប័ណ្ណ (រៀល + ដុល្លារ) និងបង្កាន់ដៃ PDF ត្រៀមរួចសម្រាប់សារអ៊ីមែលបុគ្គលិកជាភាសាខ្មែរ ឬអង់គ្លេស។',
               zh: '发布前批量预览、多币种合计（KHR + USD），以及随时发送至员工邮箱的柬文或英文 PDF 工资单。' } },
    { icon: DollarSign, tone: 'violet',
      title: { en: 'Earnings & Deductions',
               km: 'ប្រាក់ចំណូល និងការកាត់',
               zh: '收入与扣款' },
      desc:  { en: 'Bonuses, allowances, salary increases, and deduction lines that roll forward into the next cycle without re-keying anything.',
               km: 'ប្រាក់រង្វាន់ ប្រាក់បន្ថែម ការដំឡើងប្រាក់ខែ និងបន្ទាត់ការកាត់ដែលបន្តទៅវដ្តបន្ទាប់ដោយមិនចាំបាច់វាយឡើងវិញ។',
               zh: '奖金、津贴、加薪与扣款项可结转至下一周期，无需重新录入。' } },
    { icon: Fingerprint, tone: 'cyan',
      title: { en: 'Multi-Device Management',
               km: 'គ្រប់គ្រងឧបករណ៍ច្រើន',
               zh: '多设备管理' },
      desc:  { en: 'Many ZKTeco terminals per site — register them in the dashboard, watch real-time punches, and see device health at a glance.',
               km: 'ឧបករណ៍ ZKTeco ច្រើនក្នុងទីតាំងនីមួយៗ — ចុះឈ្មោះក្នុង Dashboard មើលការចូលធ្វើការពេលវេលាជាក់ស្តែង និងស្ថានភាពឧបករណ៍ភ្លាមៗ។',
               zh: '每个站点可接入多台 ZKTeco 终端 — 在仪表盘中注册、实时查看打卡，一眼掌握设备状态。' } },
    { icon: Users, tone: 'blue',
      title: { en: 'Employee Management',
               km: 'គ្រប់គ្រងបុគ្គលិក',
               zh: '员工管理' },
      desc:  { en: 'Profiles, documents, dependents, residency, NSSF number, bank account, and bilingual Khmer + English names for Cambodian compliance.',
               km: 'ប្រវត្តិរូប ឯកសារ អ្នកនៅក្នុងបន្ទុក ស្ថានភាពអ្នករស់នៅ លេខ ប.ស.ស គណនីធនាគារ និងឈ្មោះខ្មែរ + អង់គ្លេសសម្រាប់អនុលោមតាមច្បាប់កម្ពុជា។',
               zh: '个人档案、文件、被扶养人、居民身份、ប.ស.ស 号码、银行账户，并支持柬英双语姓名以满足柬埔寨合规要求。' } },
    { icon: Network, tone: 'indigo',
      title: { en: 'Department & Group',
               km: 'នាយកដ្ឋាន និងក្រុម',
               zh: '部门与分组' },
      desc:  { en: 'Organize the workforce by department, location, or custom groups. Roll up headcount, attendance, and payroll per unit in one click.',
               km: 'រៀបចំពលករតាមនាយកដ្ឋាន ទីតាំង ឬក្រុមផ្ទាល់ខ្លួន។ សរុបចំនួនបុគ្គលិក វត្តមាន និងប្រាក់ខែតាមឯកតាក្នុងការចុចតែម្តង។',
               zh: '按部门、地点或自定义分组组织员工。一键汇总各单元的人数、考勤与薪资。' } },
    { icon: RefreshCw, tone: 'rose',
      title: { en: 'Contract Renewal',
               km: 'ការបន្តកិច្ចសន្យា',
               zh: '合同续签' },
      desc:  { en: 'Track every contract\'s expiry date, get reminders before they expire, and renew with a one-click workflow that leaves a full audit trail.',
               km: 'តាមដានកាលផុតកំណត់កិច្ចសន្យានីមួយៗ ទទួលការរំលឹកមុនពេលផុតកំណត់ និងបន្តដោយការចុចតែម្តង ដោយទុកប្រវត្តិត្រួតពិនិត្យពេញលេញ។',
               zh: '跟踪每份合同到期日，到期前自动提醒，一键完成续签并保留完整审计记录。' } },
    { icon: TimerIcon, tone: 'amber',
      title: { en: 'Overtime & Leave',
               km: 'ម៉ោងបន្ថែម និងការឈប់សម្រាក',
               zh: '加班与请假' },
      desc:  { en: 'Request → approve → pay overtime at the correct 2× / 3× multiplier for weekends and holidays. Leave balances roll automatically.',
               km: 'ស្នើ → អនុម័ត → បើកម៉ោងបន្ថែមតាមអត្រា 2× / 3× សម្រាប់ចុងសប្តាហ៍ និងថ្ងៃបុណ្យ។ សមតុល្យឈប់សម្រាករំកិលដោយស្វ័យប្រវត្តិ។',
               zh: '申请 → 审批 → 按周末 2× 与节假日 3× 倍率发放加班费。请假余额自动滚转。' } },
    { icon: BarChart3, tone: 'blue',
      title: { en: 'Reports & Analytics',
               km: 'របាយការណ៍ និងវិភាគ',
               zh: '报表与分析' },
      desc:  { en: 'Headcount, payroll cost, attendance trends, and contract expiry — all exportable to Excel for finance and senior management.',
               km: 'ចំនួនបុគ្គលិក ចំណាយប្រាក់ខែ និន្នាការវត្តមាន និងការផុតកំណត់កិច្ចសន្យា — នាំចេញទៅ Excel សម្រាប់ហិរញ្ញវត្ថុ និងការគ្រប់គ្រងជាន់ខ្ពស់។',
               zh: '员工人数、薪资成本、考勤趋势与合同到期 — 全部可导出至 Excel，供财务与高层管理使用。' } },
    { icon: Cloud, tone: 'emerald',
      title: { en: 'Stand-alone + Online Sync',
               km: 'Stand-alone + Online តភ្ជាប់',
               zh: 'Stand-alone + Online 同步' },
      desc:  { en: 'Run each branch Stand-alone on-prem and an Online cloud instance side-by-side. Connect & Sync replicates everything — survive network outages without losing a single punch.',
               km: 'ដំណើរការសាខានីមួយៗបែប Stand-alone ក្នុងស្រុក និងបែប Online លើពពកទន្ទឹមគ្នា។ Connect & Sync ចម្លងគ្រប់ទាំងអស់ — មិនបាត់ទិន្នន័យពេលអ៊ីនធឺណែតដាច់។',
               zh: '各分支机构以 Stand-alone 本地方式运行，同时与 Online 云端实例并行。Connect & Sync 自动复制全部数据 — 网络中断也不会丢失任何打卡。' } },
  ];

  return (
    <section id="modules" className="py-20 sm:py-24">
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow>{t(T.modules.sectionEyebrow, lang)}</Eyebrow>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            {t(T.modules.sectionTitle, lang)}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600">
            {t(T.modules.sectionDesc, lang)}
          </p>
        </div>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m, i) => (
            <Card key={i} className="group border-slate-200/70 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
              <CardContent className="p-6">
                <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${toneClasses[m.tone]}`}>
                  <m.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">{t(m.title, lang)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{t(m.desc, lang)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}

/** Three-step process band. */
function HowItWorks({ lang }: { lang: Lang }) {
  const steps: Array<{
    icon: React.ElementType;
    title: { en: string; km: string; zh: string };
    desc:  { en: string; km: string; zh: string };
  }> = [
    { icon: Users,
      title: { en: 'Onboard your team', km: 'បញ្ចូលក្រុមការងាររបស់អ្នក', zh: '导入您的团队' },
      desc:  { en: 'Import employees, departments, and contracts in bulk from Excel, or add them one at a time. Map device user IDs to employee numbers in one click.',
               km: 'នាំចូលបុគ្គលិក នាយកដ្ឋាន និងកិច្ចសន្យាដែលជាដុំៗពី Excel ឬបន្ថែមម្តងម្នាក់។ ផ្គូផ្គងលេខអ្នកប្រើឧបករណ៍ទៅនឹងលេខបុគ្គលិកដោយចុចតែម្តង។',
               zh: '从 Excel 批量导入员工、部门和合同，或逐条添加。一键将设备用户 ID 映射到工号。' } },
    { icon: Fingerprint,
      title: { en: 'Connect your devices', km: 'តភ្ជាប់ឧបករណ៍របស់អ្នក', zh: '接入您的设备' },
      desc:  { en: 'Plug in ZKTeco terminals, register them in the dashboard, and watch real-time punches stream in. No manual file uploads, ever.',
               km: 'ភ្ជាប់ឧបករណ៍ ZKTeco ចុះឈ្មោះវាក្នុង dashboard និងមើលទិន្នន័យពេលវេលាជាក់ស្តែងហូរចូល។ មិនមានការផ្ទុកឯកសារដោយដៃទៀតទេ។',
               zh: '接入 ZKTeco 终端，在仪表盘中注册后即可看到实时打卡流入。从此告别手动上传文件。' } },
    { icon: Receipt,
      title: { en: 'Run payroll, every month', km: 'ដំណើរការប្រាក់ខែរៀងរាល់ខែ', zh: '每月发薪' },
      desc:  { en: 'Close the cycle in minutes. Tax on Salary, NSSF, and statutory deductions compute automatically. Payslips ship as PDF in Khmer or English.',
               km: 'បិទវដ្តក្នុងពេលប៉ុន្មាននាទី។ ពន្ធលើប្រាក់ខែ ប.ស.ស និងការកាត់ផ្តាច់តាមច្បាប់គណនាដោយស្វ័យប្រវត្តិ។ បង្កាន់ដៃផ្ញើជា PDF ភាសាខ្មែរ ឬអង់គ្លេស។',
               zh: '几分钟内关账。薪资税、ប.ស.ស 与法定扣款自动计算。工资单以柬文或英文 PDF 形式发出。' } },
  ];

  return (
    <section id="how" className="bg-slate-50/60 py-20 sm:py-24">
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow>{t(T.how.sectionEyebrow, lang)}</Eyebrow>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            {t(T.how.sectionTitle, lang)}
          </h2>
        </div>
        <ol className="mt-14 grid gap-8 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={i} className="relative rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
              <span className="absolute -top-4 left-7 inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white shadow-md">
                {i + 1}
              </span>
              <s.icon className="h-7 w-7 text-blue-600" />
              <h3 className="mt-4 text-lg font-semibold text-slate-900">{t(s.title, lang)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{t(s.desc, lang)}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

/** Deployment options — Stand-alone vs Online, plus the hybrid via Connect & Sync. */
function Deployment({ lang }: { lang: Lang }) {
  return (
    <section className="py-20 sm:py-24">
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow>{t(T.deploy.eyebrow, lang)}</Eyebrow>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            {t(T.deploy.title, lang)}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600">{t(T.deploy.desc, lang)}</p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          {/* Stand-alone */}
          <Card className="relative overflow-hidden border-slate-200/70 shadow-md">
            <div className="absolute right-5 top-5">
              <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-100">
                <Building2 className="mr-1 h-3 w-3" />
                On-prem
              </Badge>
            </div>
            <CardContent className="p-7">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Lock className="h-6 w-6" />
              </span>
              <h3 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">
                {t(T.deploy.standaloneTitle, lang)}
              </h3>
              <p className="mt-1 text-sm text-slate-500">{t(T.deploy.standaloneSub, lang)}</p>
              <ul className="mt-6 space-y-3">
                {[T.deploy.standaloneB1, T.deploy.standaloneB2, T.deploy.standaloneB3, T.deploy.standaloneB4].map((b, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                    <span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-blue-50 text-blue-600">
                      <Check className="h-3 w-3" />
                    </span>
                    <span>{t(b, lang)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Online */}
          <Card className="relative overflow-hidden border-slate-200/70 shadow-md">
            <div className="absolute right-5 top-5">
              <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                <Cloud className="mr-1 h-3 w-3" />
                Cloud
              </Badge>
            </div>
            <CardContent className="p-7">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Cloud className="h-6 w-6" />
              </span>
              <h3 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">
                {t(T.deploy.onlineTitle, lang)}
              </h3>
              <p className="mt-1 text-sm text-slate-500">{t(T.deploy.onlineSub, lang)}</p>
              <ul className="mt-6 space-y-3">
                {[T.deploy.onlineB1, T.deploy.onlineB2, T.deploy.onlineB3, T.deploy.onlineB4].map((b, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                    <span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                      <Check className="h-3 w-3" />
                    </span>
                    <span>{t(b, lang)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Hybrid hint */}
        <div className="mx-auto mt-8 max-w-3xl rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-4 text-center">
          <p className="inline-flex items-center gap-2 text-sm text-slate-700">
            <RefreshCw className="h-4 w-4 text-slate-500" />
            {t(T.deploy.hybridNote, lang)}
          </p>
        </div>
      </Container>
    </section>
  );
}

/** Cambodia-compliance highlight section. */
function CambodiaSection({ lang }: { lang: Lang }) {
  const bullets: Array<{ en: string; km: string; zh: string }> = [
    { en: 'Progressive Tax on Salary brackets with auto-calc and exemptions',
      km: 'ពន្ធលើប្រាក់ខែតាមថ្នាក់ ដោយគណនាដោយស្វ័យប្រវត្តិ និងករណីលើកលែង',
      zh: '累进薪资税档次，自动计算并处理免税情形' },
    { en: 'NSSF tiers wired into every payslip',
      km: 'ថ្នាក់ ប.ស.ស ភ្ជាប់ក្នុងបង្កាន់ដៃនីមួយៗ',
      zh: '每张工资单嵌入 ប.ស.ស 等级' },
    { en: 'Resident vs non-resident treatment + dependents',
      km: 'អ្នករស់នៅ និងមិនរស់នៅ + អ្នកនៅក្នុងបន្ទុក',
      zh: '区分居民/非居民身份及被扶养人' },
    { en: 'Fringe benefits taxed at the statutory 20%',
      km: 'អត្ថប្រយោជន៍បុគ្គលិកត្រូវបង់ពន្ធ 20% តាមច្បាប់',
      zh: '附加福利按法定 20% 税率征收' },
    { en: 'Foreign tax credit handled in-engine',
      km: 'ការដកពន្ធបរទេសគ្រប់គ្រងក្នុងម៉ាស៊ីន',
      zh: '引擎内置外国税抵免处理' },
    { en: 'Khmer-language payslips and reports',
      km: 'បង្កាន់ដៃ និងរបាយការណ៍ជាភាសាខ្មែរ',
      zh: '柬文工资单与报表' },
  ];

  return (
    <section className="py-20 sm:py-24">
      <Container className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <Eyebrow>{t(T.cambodia.eyebrow, lang)}</Eyebrow>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            {t(T.cambodia.title, lang)}
          </h2>
          <p className="mt-5 text-base leading-relaxed text-slate-600">
            {t(T.cambodia.desc, lang)}
          </p>
        </div>
        <ul className="space-y-3">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <Check className="h-3.5 w-3.5" />
              </span>
              <span className="text-sm text-slate-700">{t(b, lang)}</span>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

/**
 * "Working Rule" — Cambodian labour-law cheatsheet. Eight cards covering
 * the same statutes the payroll/leave/OT engines automate. Numbers come
 * from the Labour Law of Cambodia (1997, amended through the 2018 Prakas
 * on Seniority Indemnity), the General Department of Taxation, and the
 * National Social Security Fund. Treat this as a reference card, not
 * legal advice — HR should verify against the latest Prakas before
 * acting on edge cases.
 */
function WorkingRule({ lang }: { lang: Lang }) {
  type ML = { en: string; km: string; zh: string };
  const rules: Array<{ icon: React.ElementType; tone: 'blue' | 'amber' | 'emerald' | 'rose'; title: ML; bullets: ML[] }> = [
    {
      icon: Clock, tone: 'blue',
      title:  { en: 'Working Hours',                          km: 'ម៉ោងធ្វើការ',                    zh: '工作时间' },
      bullets: [
        { en: '8 hours/day, 48 hours/week maximum',           km: '៨ ម៉ោង/ថ្ងៃ ៤៨ ម៉ោង/សប្តាហ៍ អតិបរមា', zh: '每日 8 小时，每周最多 48 小时' },
        { en: '1-hour unpaid lunch break',                    km: 'ពេលសម្រាក ១ ម៉ោងមិនបង់ប្រាក់',     zh: '1 小时无薪午休' },
        { en: 'Overtime capped at 2 hours per day',           km: 'ការងារបន្ថែមកំណត់ ២ ម៉ោងក្នុងមួយថ្ងៃ', zh: '加班每日上限 2 小时' },
      ],
    },
    {
      icon: TimerIcon, tone: 'amber',
      title:  { en: 'Overtime Rates',                         km: 'អត្រាការងារបន្ថែម',                zh: '加班费率' },
      bullets: [
        { en: 'Weekday OT: 150% of the hourly wage',          km: 'ការងារបន្ថែមថ្ងៃធ្វើការ: ១៥០% នៃប្រាក់ឈ្នួល/ម៉ោង', zh: '工作日加班：时薪 150%' },
        { en: 'Night work (10pm–5am): 130%',                  km: 'ការងារយប់ (ម៉ោង ១០ យប់ – ៥ ព្រឹក): ១៣០%',          zh: '夜班 (晚 10 时至凌晨 5 时)：130%' },
        { en: 'Weekend / public holiday: 200%',               km: 'ចុងសប្តាហ៍ / ថ្ងៃបុណ្យ: ២០០%',     zh: '周末 / 法定节假日：200%' },
      ],
    },
    {
      icon: CalendarDays, tone: 'emerald',
      title:  { en: 'Annual Leave & Holidays',                km: 'ការឈប់សម្រាកប្រចាំឆ្នាំ និងថ្ងៃបុណ្យ', zh: '年假与节假日' },
      bullets: [
        { en: '1.5 days/month worked, up to 18 days/year',    km: '១.៥ ថ្ងៃ/ខែ កំណត់ ១៨ ថ្ងៃ/ឆ្នាំ',  zh: '每工作 1 月累计 1.5 天，每年最多 18 天' },
        { en: 'Seniority bonus: +1 day every 3 years',        km: 'ប្រាក់រង្វាន់អតីតភាព: +១ ថ្ងៃរៀងរាល់ ៣ ឆ្នាំ', zh: '工龄奖励：每满 3 年增加 1 天' },
        { en: '14 designated public holidays per year',       km: '១៤ ថ្ងៃបុណ្យសាធារណៈក្នុងមួយឆ្នាំ', zh: '每年 14 个法定节假日' },
      ],
    },
    {
      icon: Baby, tone: 'rose',
      title:  { en: 'Maternity & Sick Leave',                 km: 'ការឈប់សម្រាកសម្រាល និងជំងឺ',       zh: '产假与病假' },
      bullets: [
        { en: 'Maternity: 90 days at 50% (≥ 1 year service)', km: 'ការសម្រាល: ៩០ ថ្ងៃ ៥០% (បំរើ ≥ ១ ឆ្នាំ)', zh: '产假：90 天，工资 50%（工龄需满 1 年）' },
        { en: 'Two 30-min nursing breaks daily until age 1',  km: 'សម្រាកបំបៅ ៣០ នាទី ២ ដងក្នុងមួយថ្ងៃ រហូតដល់អាយុ ១', zh: '婴儿满 1 岁前每日 2 次 30 分钟哺乳假' },
        { en: 'Sick leave: 100% month 1, 60% months 2–3',     km: 'ការឈប់សម្រាកជំងឺ: ១០០% ខែទី១ ៦០% ខែទី ២–៣', zh: '病假：第 1 月 100%，第 2–3 月 60%' },
      ],
    },
    {
      icon: FileText, tone: 'blue',
      title:  { en: 'Probation & Notice',                     km: 'រយៈពេលសាកល្បង និងការប្រកាស',       zh: '试用期与离职通知' },
      bullets: [
        { en: 'Probation: 3 mo (regular) · 2 mo · 1 mo',      km: 'រយៈពេលសាកល្បង: ៣ខែ (ធម្មតា) · ២ខែ · ១ខែ', zh: '试用期：3 月（一般）· 2 月 · 1 月' },
        { en: '≤ 6 mo tenure: 7 days notice',                 km: 'បំរើ ≤ ៦ខែ: ប្រកាស ៧ ថ្ងៃ',         zh: '工龄 ≤ 6 月：提前 7 天通知' },
        { en: '6 mo – 2 yr: 15 days · 2–5 yr: 1 month',       km: '៦ខែ – ២ឆ្នាំ: ១៥ ថ្ងៃ · ២–៥ឆ្នាំ: ១ខែ', zh: '6 月–2 年：15 天 · 2–5 年：1 月' },
        { en: '5–10 yr: 2 months · > 10 yr: 3 months',        km: '៥–១០ឆ្នាំ: ២ខែ · > ១០ឆ្នាំ: ៣ខែ',  zh: '5–10 年：2 月 · 10 年以上：3 月' },
      ],
    },
    {
      icon: DollarSign, tone: 'amber',
      title:  { en: 'Severance & Seniority',                  km: 'ប្រាក់សំណង និងអតីតភាព',           zh: '解雇赔偿与工龄抚恤金' },
      bullets: [
        { en: 'UDC (indefinite): 15 days per year of service', km: 'UDC (មិនកំណត់): ១៥ ថ្ងៃក្នុងមួយឆ្នាំបំរើ', zh: 'UDC（无固定期）：每工龄年 15 天' },
        { en: '2018 Prakas: 7.5 days twice yearly (Jun/Dec)',  km: 'ប្រកាស ២០១៨: ៧.៥ ថ្ងៃ ២ដងក្នុងមួយឆ្នាំ (មិថុនា/ធ្នូ)', zh: '2018 公告：每年 6 月/12 月各发 7.5 天' },
        { en: 'FDC: 5% of total wages over contract life',     km: 'FDC: ៥% នៃប្រាក់ឈ្នួលសរុបពេញកិច្ចសន្យា', zh: '固定期合约：合约期内总工资的 5%' },
      ],
    },
    {
      icon: ShieldCheck, tone: 'emerald',
      title:  { en: 'NSSF Contributions',                     km: 'ការបង់ ប.ស.ស',                     zh: 'ប.ស.ស 缴费' },
      bullets: [
        { en: 'Employer: 2% of contributory wage',            km: 'និយោជក: ២% នៃប្រាក់ឈ្នួលរួមចំណែក', zh: '雇主：缴费工资的 2%' },
        { en: 'Employee: 2% (first 5 years of pension scheme)', km: 'និយោជិត: ២% (៥ ឆ្នាំដំបូងនៃគម្រោងសោធន)',           zh: '员工：2%（养老保险前 5 年）' },
        { en: 'Wage cap: 1,200,000 KHR (~ $300 USD)',         km: 'ដែនកំណត់ប្រាក់ឈ្នួល: ១,២០០,០០០ រៀល', zh: '缴费工资上限：1,200,000 瑞尔' },
      ],
    },
    {
      icon: Receipt, tone: 'rose',
      title:  { en: 'Tax on Salary (TOS)',                    km: 'ពន្ធលើប្រាក់បៀវត្ស',              zh: '薪资税' },
      bullets: [
        { en: '0% up to 1.5M KHR · 5% to 2M · 10% to 8.5M',   km: '០% ដល់ ១.៥លាន · ៥% ដល់ ២លាន · ១០% ដល់ ៨.៥លាន', zh: '0%（≤150 万）· 5%（≤200 万）· 10%（≤850 万）' },
        { en: '15% up to 12.5M · 20% above',                  km: '១៥% ដល់ ១២.៥លាន · ២០% លើស',       zh: '15%（≤1250 万）· 20%（以上）' },
        { en: '150,000 KHR deduction per dependent',          km: 'កាត់បន្ថយ ១៥០,០០០ រៀលក្នុងម្នាក់នៅក្នុងបន្ទុក', zh: '每位被扶养人扣减 150,000 瑞尔' },
      ],
    },
  ];

  const toneStyles: Record<'blue' | 'amber' | 'emerald' | 'rose', { iconBg: string; iconText: string; ring: string }> = {
    blue:    { iconBg: 'bg-blue-50',    iconText: 'text-blue-600',    ring: 'ring-blue-100' },
    amber:   { iconBg: 'bg-amber-50',   iconText: 'text-amber-600',   ring: 'ring-amber-100' },
    emerald: { iconBg: 'bg-emerald-50', iconText: 'text-emerald-600', ring: 'ring-emerald-100' },
    rose:    { iconBg: 'bg-rose-50',    iconText: 'text-rose-600',    ring: 'ring-rose-100' },
  };

  return (
    <section id="rules" className="py-20 sm:py-24">
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow>{t(T.workingRule.eyebrow, lang)}</Eyebrow>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            {t(T.workingRule.title, lang)}
          </h2>
          <p className="mt-5 text-base leading-relaxed text-slate-600">
            {t(T.workingRule.desc, lang)}
          </p>
        </div>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {rules.map((r, i) => {
            const Icon = r.icon;
            const tn = toneStyles[r.tone];
            return (
              <Card key={i} className="border-slate-200/70 shadow-sm">
                <CardContent className="p-6">
                  <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${tn.iconBg} ${tn.iconText} ring-4 ${tn.ring}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-slate-900">{t(r.title, lang)}</h3>
                  <ul className="mt-3 space-y-2">
                    {r.bullets.map((b, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm leading-snug text-slate-600">
                        <Check className="mt-1 h-3.5 w-3.5 flex-none text-emerald-600" />
                        <span>{t(b, lang)}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <p className="mt-10 text-center text-xs text-slate-500">
          {t(T.workingRule.source, lang)}
        </p>
      </Container>
    </section>
  );
}

/**
 * Knowledge section explaining how the two Cambodian termination-benefit
 * calculators work — Seniority Indemnity (UDC) and 5% Severance (FDC).
 * Numbers are taken from the same source of truth the in-app calculators
 * read at runtime (2018 Prakas + Labour Law Art. 73). Worked examples
 * use round-number inputs so HR can sanity-check the dialog.
 */
function BenefitFormulas({ lang }: { lang: Lang }) {
  type ML = { en: string; km: string; zh: string };
  const cards: Array<{
    icon: React.ElementType;
    tone: 'emerald' | 'amber';
    title: ML;
    eligibility: ML;
    formula: string;
    example: { input: ML; steps: string[]; result: ML };
    cite: ML;
  }> = [
    {
      icon: Scale, tone: 'emerald',
      title: {
        en: 'Seniority Indemnity (UDC)',
        km: 'ប្រាក់ចូលនិវត្តន៍ (UDC)',
        zh: '工龄抚恤金 (UDC)',
      },
      eligibility: {
        en: 'Paid twice a year (June + December) to every employee on an Undetermined Duration Contract — 7.5 days × daily wage per cycle, covering the prior 6 months.',
        km: 'បង់ ២ ដងក្នុងមួយឆ្នាំ (មិថុនា + ធ្នូ) ដល់និយោជិតលើកិច្ចសន្យារយៈពេលមិនកំណត់ (UDC) — ៧.៥ ថ្ងៃ × ប្រាក់ឈ្នួលប្រចាំថ្ងៃ ក្នុងមួយវគ្គ។',
        zh: '每年发放两次（6 月 + 12 月）给所有无固定期合约 (UDC) 员工：每期 7.5 天 × 日薪。',
      },
      formula: 'daily_wage = monthly_gross ÷ working_days\nseniority   = daily_wage × 7.5',
      example: {
        input: {
          en: 'UDC employee · monthly gross = $500 · working days = 26 (Mon–Sat)',
          km: 'និយោជិត UDC · ប្រាក់ខែសរុប = ៥០០ ដុល្លារ · ថ្ងៃធ្វើការ = ២៦ (ច័ន្ទ–សៅរ៍)',
          zh: 'UDC 员工 · 月度毛工资 = $500 · 工作日 = 26（周一至周六）',
        },
        steps: [
          'daily_wage = 500 ÷ 26     = $19.23',
          'seniority  = 19.23 × 7.5  = $144.23',
        ],
        result: {
          en: '$144.23 paid in June, again in December → $288.46/year',
          km: '១៤៤.២៣ ដុល្លារ បង់នៅខែមិថុនា និង ខែធ្នូ → ២៨៨.៤៦ ដុល្លារ/ឆ្នាំ',
          zh: '6 月发 $144.23，12 月再发 $144.23 → 每年 $288.46',
        },
      },
      cite: {
        en: '2018 Prakas on Seniority Indemnity · Labour Law of Cambodia Art. 89',
        km: 'ប្រកាសឆ្នាំ ២០១៨ ស្តីពីប្រាក់ចូលនិវត្តន៍ · ច្បាប់ការងារ មាត្រា ៨៩',
        zh: '2018 年关于工龄抚恤金的公告 · 柬埔寨劳动法 第 89 条',
      },
    },
    {
      icon: Calculator, tone: 'amber',
      title: {
        en: '5% Severance (FDC)',
        km: 'សំណង ៥% (FDC)',
        zh: '5% 解雇赔偿 (FDC)',
      },
      eligibility: {
        en: 'Paid once, on the natural expiry of a Fixed Duration Contract — 5% × total gross wages earned over the contract\'s lifetime. Forfeited if the contract ends for serious misconduct.',
        km: 'បង់ម្តងតែប៉ុណ្ណោះ នៅពេលផុតកំណត់នៃកិច្ចសន្យារយៈពេលកំណត់ — ៥% × ប្រាក់ឈ្នួលសរុបក្នុងអំឡុងពេលកិច្ចសន្យា។ ប្រាក់សំណងត្រូវផ្ងាក់ប្រសិនបើបញ្ចប់កិច្ចសន្យាដោយការប្រព្រឹត្តខុស។',
        zh: '在固定期合约 (FDC) 自然到期时一次性发放：合约期内总毛工资 × 5%。若因严重失职终止则丧失资格。',
      },
      formula: 'total_wages = Σ monthly_gross_earnings.totalEarnings\nseverance   = total_wages × 5%',
      example: {
        input: {
          en: 'FDC employee · 3-month contract · pay = $500 / $550 / $600',
          km: 'និយោជិត FDC · កិច្ចសន្យា ៣ ខែ · ប្រាក់ឈ្នួល = ៥០០ / ៥៥០ / ៦០០ ដុល្លារ',
          zh: 'FDC 员工 · 3 个月合约 · 工资 = $500 / $550 / $600',
        },
        steps: [
          'total_wages = 500 + 550 + 600  = $1,650.00',
          'severance   = 1,650.00 × 0.05  = $82.50',
        ],
        result: {
          en: '$82.50 added to the final month\'s payslip ($600 + $82.50 = $682.50)',
          km: '៨២.៥០ ដុល្លារ បន្ថែមលើបង្កាន់ដៃប្រាក់ខែខែចុងក្រោយ ($600 + $82.50 = $682.50)',
          zh: '$82.50 计入最后一个月的工资单（$600 + $82.50 = $682.50）',
        },
      },
      cite: {
        en: 'Labour Law of Cambodia Art. 73 · FDC natural-expiry severance',
        km: 'ច្បាប់ការងារ មាត្រា ៧៣ · សំណងផុតកំណត់ FDC',
        zh: '柬埔寨劳动法 第 73 条 · FDC 合约自然到期解雇赔偿',
      },
    },
  ];

  const toneStyles: Record<'emerald' | 'amber', { iconBg: string; iconText: string; ring: string; resultBg: string; resultText: string }> = {
    emerald: { iconBg: 'bg-emerald-50', iconText: 'text-emerald-600', ring: 'ring-emerald-100', resultBg: 'bg-emerald-50',  resultText: 'text-emerald-800' },
    amber:   { iconBg: 'bg-amber-50',   iconText: 'text-amber-600',   ring: 'ring-amber-100',   resultBg: 'bg-amber-50',    resultText: 'text-amber-800'   },
  };

  return (
    <section id="benefit-formulas" className="py-20 sm:py-24 bg-slate-50/70">
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow>{t(T.benefitFormulas.eyebrow, lang)}</Eyebrow>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            {t(T.benefitFormulas.title, lang)}
          </h2>
          <p className="mt-5 text-base leading-relaxed text-slate-600">
            {t(T.benefitFormulas.desc, lang)}
          </p>
        </div>
        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          {cards.map((c, i) => {
            const Icon = c.icon;
            const tn = toneStyles[c.tone];
            return (
              <Card key={i} className="border-slate-200/70 shadow-sm">
                <CardContent className="p-6 sm:p-8">
                  <div className="flex items-start gap-4">
                    <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${tn.iconBg} ${tn.iconText} ring-4 ${tn.ring}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-slate-900">{t(c.title, lang)}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-slate-600">{t(c.eligibility, lang)}</p>
                    </div>
                  </div>
                  <pre className="mt-6 whitespace-pre-wrap rounded-lg bg-slate-900 px-4 py-3 text-[12px] font-mono leading-relaxed text-slate-100">
{c.formula}
                  </pre>
                  <div className="mt-5">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                      {lang === 'km' ? 'ឧទាហរណ៍' : lang === 'zh' ? '示例' : 'Worked example'}
                    </div>
                    <p className="mt-1 text-sm text-slate-700">{t(c.example.input, lang)}</p>
                    <pre className="mt-2 whitespace-pre-wrap rounded-md bg-white border border-slate-200 px-3 py-2 text-[12px] font-mono text-slate-700">
{c.example.steps.join('\n')}
                    </pre>
                    <div className={`mt-3 rounded-md ${tn.resultBg} px-3 py-2 text-sm font-medium ${tn.resultText}`}>
                      = {t(c.example.result, lang)}
                    </div>
                  </div>
                  <p className="mt-5 text-[11px] text-slate-500">{t(c.cite, lang)}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

/**
 * Benefit Calculators showcase — one read-only card per calculator that
 * lives on the in-app Benefit Calculator page. Visitors see what the
 * product can do without needing to sign in. Each card mirrors the
 * tone + icon used inside the app so the visual signal carries over
 * post-login.
 */
function BenefitCalculatorsShowcase({ lang }: { lang: Lang }) {
  type ML = { en: string; km: string; zh: string };
  type Tone = 'emerald' | 'indigo' | 'amber' | 'blue' | 'rose';

  const cards: Array<{
    icon: React.ElementType;
    tone: Tone;
    kind: 'earning' | 'deduction';
    title: ML;
    cite: ML;
    desc: ML;
  }> = [
    {
      icon: Scale, tone: 'emerald', kind: 'earning',
      title: { en: 'Seniority',         km: 'អតីតភាព',          zh: '工龄抚恤金' },
      cite:  { en: 'UDC · 2018 Prakas', km: 'UDC · ប្រកាស ២០១៨', zh: 'UDC · 2018 公告' },
      desc:  { en: '7.5 days × daily wage, paid twice a year (June + December) to every UDC employee.',
               km: '៧.៥ ថ្ងៃ × ប្រាក់ឈ្នួលប្រចាំថ្ងៃ បង់ ២ ដងក្នុងមួយឆ្នាំ (មិថុនា + ធ្នូ) ដល់និយោជិត UDC។',
               zh: '每年 6 月与 12 月各发放 7.5 天 × 日薪给所有 UDC（无固定期）员工。' },
    },
    {
      icon: CalendarDays, tone: 'indigo', kind: 'earning',
      title: { en: 'AL Remain',                 km: 'ប្រាក់ឈប់សម្រាក',       zh: '剩余年假' },
      cite:  { en: 'Unused annual-leave payout', km: 'បំណល់ឈប់សម្រាកប្រចាំឆ្នាំ', zh: '未休年假折现' },
      desc:  { en: 'Annual allocation × months_in_window ÷ 12, minus approved usage, times daily wage. Pick a half or full year.',
               km: 'ការបែងចែកប្រចាំឆ្នាំ × ខែក្នុងបង្អួច ÷ ១២ ដក ការប្រើប្រាស់ដែលបានអនុម័ត គុណនឹងប្រាក់ឈ្នួលប្រចាំថ្ងៃ។',
               zh: '年度配额 × 窗口内月数 ÷ 12，减去已批准用量，再乘以日薪。可选半年或整年。' },
    },
    {
      icon: Calculator, tone: 'amber', kind: 'earning',
      title: { en: '5% Severance',                       km: 'សំណង ៥%',              zh: '5% 解雇赔偿' },
      cite:  { en: 'FDC · Labour Law Art. 73',           km: 'FDC · មាត្រា ៧៣',       zh: 'FDC · 劳动法 第 73 条' },
      desc:  { en: 'One installment per completed 3-month block of the FDC contract, locked to the salary at contract start.',
               km: '១ ការបង់ក្នុងបន្ទប់ ៣ ខែនៃកិច្ចសន្យា FDC ភ្ជាប់ទៅនឹងប្រាក់ខែដំបូងនៃកិច្ចសន្យា។',
               zh: '固定期合约每完成 3 个月发放一次，金额锁定为合约起始薪资。' },
    },
    {
      icon: Receipt, tone: 'blue', kind: 'deduction',
      title: { en: 'Tax on Salary (TOS)',           km: 'ពន្ធលើប្រាក់បៀវត្ស',     zh: '薪资税' },
      cite:  { en: 'Cambodia GDT · 5 / 10 / 15 / 20 %', km: 'GDT · ៥/១០/១៥/២០ %', zh: '柬埔寨税务总局 · 5/10/15/20%' },
      desc:  { en: 'Progressive monthly tax preview using the tenant\'s configured KHR/USD FX rate, dependent deductions, and bracket table.',
               km: 'មើលជាមុនពន្ធប្រចាំខែតាមលំដាប់ ដោយប្រើអត្រាប្តូរ KHR/USD ការដកដែលនៅក្នុងបន្ទុក និងតារាងថ្នាក់ពន្ធ។',
               zh: '使用租户配置的 KHR/USD 汇率、被扶养人扣减和税率表预览月度累进税。' },
    },
    {
      icon: ShieldCheck, tone: 'rose', kind: 'deduction',
      title: { en: 'NSSF Contributions',                          km: 'ការបង់ ប.ស.ស',                 zh: 'ប.ស.ស 缴费' },
      cite:  { en: 'Employee 2% + Employer 5.4%',                  km: 'និយោជិត ២% + និយោជក ៥.៤%',     zh: '员工 2% + 雇主 5.4%' },
      desc:  { en: 'Pension, occupational risk, and healthcare contributions on a contributory wage capped at 1,200,000 KHR.',
               km: 'ការចូលរួមសោធននិវត្តន៍ ហានិភ័យការងារ និងសុខភាព លើប្រាក់ឈ្នួលចំណែកដែលកំណត់ត្រឹម ១,២០០,០០០ រៀល។',
               zh: '在缴费工资上限 1,200,000 瑞尔范围内缴纳养老、职业风险与医疗保险。' },
    },
  ];

  const toneStyles: Record<Tone, { card: string; iconBg: string; iconText: string; chip: string }> = {
    emerald: { card: 'border-emerald-100', iconBg: 'bg-emerald-50', iconText: 'text-emerald-600', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    indigo:  { card: 'border-indigo-100',  iconBg: 'bg-indigo-50',  iconText: 'text-indigo-600',  chip: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    amber:   { card: 'border-amber-100',   iconBg: 'bg-amber-50',   iconText: 'text-amber-600',   chip: 'bg-amber-50 text-amber-700 border-amber-200' },
    blue:    { card: 'border-blue-100',    iconBg: 'bg-blue-50',    iconText: 'text-blue-600',    chip: 'bg-blue-50 text-blue-700 border-blue-200' },
    rose:    { card: 'border-rose-100',    iconBg: 'bg-rose-50',    iconText: 'text-rose-600',    chip: 'bg-rose-50 text-rose-700 border-rose-200' },
  };

  return (
    <section id="benefit-calculators" className="py-20 sm:py-24 bg-white">
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow>{t(T.benefitCalcs.eyebrow, lang)}</Eyebrow>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            {t(T.benefitCalcs.title, lang)}
          </h2>
          <p className="mt-5 text-base leading-relaxed text-slate-600">
            {t(T.benefitCalcs.desc, lang)}
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c, i) => {
            const Icon = c.icon;
            const tn = toneStyles[c.tone];
            return (
              <Card key={i} className={`border ${tn.card} shadow-sm`}>
                <CardContent className="p-6">
                  <div className="flex items-start gap-3">
                    <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${tn.iconBg} ${tn.iconText}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-semibold text-slate-900">{t(c.title, lang)}</h3>
                        <span className={`inline-flex items-center text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border ${tn.chip}`}>
                          {c.kind === 'earning' ? 'Earning' : 'Deduction'}
                        </span>
                      </div>
                      <p className="text-[11px] mt-0.5 text-slate-500">{t(c.cite, lang)}</p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-slate-600">{t(c.desc, lang)}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

/** Testimonials — three short quotes. Stock names; replace with real once available. */
function Testimonials({ lang }: { lang: Lang }) {
  const items: Array<{
    quote: { en: string; km: string; zh: string };
    name: string; role: { en: string; km: string; zh: string };
  }> = [
    { quote: { en: 'We closed our monthly payroll in 40 minutes instead of three days. The TOS engine just works.',
               km: 'យើងបិទប្រាក់ខែប្រចាំខែក្នុង ៤០ នាទី ជំនួសឱ្យ ៣ ថ្ងៃ។ ម៉ាស៊ីនពន្ធលើប្រាក់ខែដំណើរការល្អ។',
               zh: '我们月度发薪从 3 天缩短到 40 分钟。薪资税引擎非常好用。' },
      name: 'Oun Saovady', role: { en: 'HR Manager · Manufacturing',
                                   km: 'ប្រធានធនធានមនុស្ស · ផលិតកម្ម',
                                   zh: 'HR 经理 · 制造业' } },
    { quote: { en: 'Five sites, one dashboard. We finally see who is at work in real-time without calling each branch.',
               km: 'ប្រាំសាខា dashboard តែមួយ។ យើងឃើញនរណាមានវត្តមានជាក់ស្តែងដោយមិនចាំបាច់ហៅទៅសាខានីមួយៗ។',
               zh: '五个站点，一个仪表盘。我们终于能实时看到谁在岗，再也不用挨个分店打电话了。' },
      name: 'Borith Ouk',  role: { en: 'Operations Director · Retail',
                                    km: 'នាយកប្រតិបត្តិការ · លក់រាយ',
                                    zh: '运营总监 · 零售' } },
    { quote: { en: 'The fingerprint device sync alone paid for the whole platform in the first month.',
               km: 'ការតភ្ជាប់ឧបករណ៍ស្នាមម្រាមដៃតែឯងបង់សងតម្លៃវេទិកាទាំងមូលក្នុងខែដំបូង។',
               zh: '仅指纹设备同步一项，就在第一个月内为整个平台赚回了成本。' },
      name: 'Dara Lim',    role: { en: 'Finance Lead · F&B Group',
                                    km: 'ប្រធានហិរញ្ញវត្ថុ · ក្រុមអាហារនិងភេសជ្ជៈ',
                                    zh: '财务负责人 · 餐饮集团' } },
  ];

  return (
    <section className="bg-slate-50/60 py-20 sm:py-24">
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow>{t(T.testimonials.eyebrow, lang)}</Eyebrow>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            {t(T.testimonials.title, lang)}
          </h2>
        </div>
        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {items.map((q, i) => (
            <Card key={i} className="border-slate-200/70 shadow-sm">
              <CardContent className="p-7">
                <Quote className="h-7 w-7 text-blue-200" />
                <p className="mt-4 text-base leading-relaxed text-slate-700">{t(q.quote, lang)}</p>
                <div className="mt-6 flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 text-sm font-semibold text-blue-700">
                    {q.name.split(' ').map(p => p[0]).slice(0, 2).join('')}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{q.name}</p>
                    <p className="text-xs text-slate-500">{t(q.role, lang)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}

/** FAQ accordion — 6 questions. */
function Faq({ lang }: { lang: Lang }) {
  const items: Array<{ q: { en: string; km: string; zh: string }; a: { en: string; km: string; zh: string } }> = [
    { q: { en: 'Is this hosted in Cambodia?',
           km: 'តើនេះត្រូវបានដាក់ដំណើរការនៅកម្ពុជាដែរទេ?',
           zh: '系统是托管在柬埔寨吗？' },
      a: { en: 'Yes — you can run the platform fully on-premise inside your own office, on a regional cloud, or as a hybrid setup where each site runs locally and syncs to a central instance.',
           km: 'ត្រូវ — អ្នកអាចដំណើរការវេទិកាទាំងស្រុងក្នុងការិយាល័យរបស់អ្នក នៅលើពពកក្នុងតំបន់ ឬជាការដាក់រួមបញ្ចូលគ្នាដែលសាខានីមួយៗដំណើរការក្នុងស្រុក និងតភ្ជាប់ទៅសេវាកណ្តាល។',
           zh: '可以 — 您可以完全在自己的办公室本地运行，部署到区域云端，或采用混合方案：各站点本地运行并同步至中央实例。' } },
    { q: { en: 'Do you support our existing fingerprint terminals?',
           km: 'តើអ្នកគាំទ្រឧបករណ៍ស្នាមម្រាមដៃដែលយើងមានស្រាប់ឬទេ?',
           zh: '是否支持我们现有的指纹终端？' },
      a: { en: 'Any ZKTeco terminal that speaks the PushSDK protocol over TCP/4370 works out of the box — including multi-device setups (one per office, one per floor).',
           km: 'ឧបករណ៍ ZKTeco ណាមួយដែលនិយាយពិធីការ PushSDK តាមរយៈ TCP/4370 ដំណើរការដោយស្វ័យប្រវត្តិ — រួមទាំងការដាក់ឧបករណ៍ច្រើន (មួយក្នុងការិយាល័យនីមួយៗ មួយក្នុងជាន់នីមួយៗ)។',
           zh: '任何通过 TCP/4370 使用 PushSDK 协议的 ZKTeco 终端都可即插即用 — 支持多设备部署（每个办公室一台、每层楼一台）。' } },
    { q: { en: 'How is Cambodia Tax on Salary calculated?',
           km: 'តើពន្ធលើប្រាក់ខែកម្ពុជាគណនាដោយរបៀបណា?',
           zh: '柬埔寨薪资税如何计算？' },
      a: { en: 'The engine runs progressive brackets per the General Department of Taxation, adjusts for dependents and residency, applies the 20% fringe benefit rate, and credits foreign tax already withheld. The math is auditable on every payslip.',
           km: 'ម៉ាស៊ីនដំណើរការតាមថ្នាក់ពន្ធរបស់អគ្គនាយកដ្ឋានពន្ធដារ កែតម្រូវសម្រាប់អ្នកនៅក្នុងបន្ទុក និងស្ថានភាពអ្នករស់នៅ អនុវត្តអត្រា 20% សម្រាប់អត្ថប្រយោជន៍ និងដកពន្ធបរទេសដែលបានរក្សាទុក។ ការគណនាអាចត្រួតពិនិត្យបាននៅលើបង្កាន់ដៃនីមួយៗ។',
           zh: '引擎按税务总局规定的累进档次计算，根据被扶养人和居民身份调整，按 20% 计征附加福利，并抵免已预扣的外国税。每张工资单的计算过程均可审计。' } },
    { q: { en: 'What happens to attendance data if our internet goes down?',
           km: 'តើទិន្នន័យវត្តមានកើតមានអ្វីបើអ៊ីនធឺណែតរបស់យើងដាច់?',
           zh: '如果我们的网络中断，考勤数据会怎样？' },
      a: { en: 'Every site runs its own copy of the backend. Local punches keep being recorded and queued; once the link is back, the outbox syncs to the central instance automatically.',
           km: 'ទីតាំងនីមួយៗដំណើរការ backend ផ្ទាល់ខ្លួន។ ការចូលក្នុងស្រុកនៅតែត្រូវបានកត់ត្រា និងដាក់ជួរ; នៅពេលដែលអ៊ីនធឺណែតមកវិញ ប្រអប់ផ្ញើចេញនឹងភ្ជាប់ទៅសេវាកណ្តាលដោយស្វ័យប្រវត្តិ។',
           zh: '每个站点都运行自己的后端。本地打卡会继续被记录并排队；网络恢复后，发件箱将自动同步至中央实例。' } },
    { q: { en: 'Can my employees see their own payslips?',
           km: 'តើបុគ្គលិករបស់ខ្ញុំអាចមើលបង្កាន់ដៃរបស់ខ្លួនបានទេ?',
           zh: '员工可以查看自己的工资单吗？' },
      a: { en: 'Yes. Each employee has a self-service login showing their attendance, leave balance, OT history, and downloadable payslips — without exposing anyone else’s data.',
           km: 'បាទ/ចាស។ បុគ្គលិកម្នាក់ៗមានគណនីផ្ទាល់ខ្លួនបង្ហាញវត្តមាន សមតុល្យឈប់សម្រាក ប្រវត្តិម៉ោងបន្ថែម និងបង្កាន់ដៃដែលអាចទាញយកបាន — ដោយមិនបង្ហាញទិន្នន័យអ្នកដ៏ទៃ។',
           zh: '可以。每位员工都有自助登录入口，能查看自己的考勤、假期余额、加班记录及可下载的工资单 — 不会泄露他人数据。' } },
    { q: { en: 'How long does a typical rollout take?',
           km: 'តើការដាក់ឱ្យដំណើរការធម្មតាប្រើពេលប៉ុន្មាន?',
           zh: '通常上线需要多长时间？' },
      a: { en: 'A single-site company with under 200 employees is usually live in under a week: day 1 for import, day 2–3 for device pairing and rule configuration, day 4 for a parallel-run payroll, day 5 onward business as usual.',
           km: 'ក្រុមហ៊ុនដែលមានសាខាមួយ និងបុគ្គលិកតិចជាង ២០០ ជាធម្មតាដំណើរការក្នុងរយៈពេលតិចជាងមួយសប្តាហ៍៖ ថ្ងៃទី ១ សម្រាប់ការនាំចូល ថ្ងៃទី ២-៣ សម្រាប់ការផ្គូផ្គងឧបករណ៍ និងការកំណត់ច្បាប់ ថ្ងៃទី ៤ សម្រាប់ដំណើរការប្រាក់ខែស្របៗ ថ្ងៃទី ៥ ដំណើរការធម្មតា។',
           zh: '员工不超过 200 人的单站点公司通常在一周内即可上线：第 1 天导入，第 2–3 天配对设备并配置规则，第 4 天并行试运行发薪，第 5 天起正式投入使用。' } },
  ];

  return (
    <section id="faq" className="py-20 sm:py-24">
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow>{t(T.faq.eyebrow, lang)}</Eyebrow>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            {t(T.faq.title, lang)}
          </h2>
        </div>
        <div className="mx-auto mt-12 max-w-3xl">
          <Accordion type="single" collapsible className="space-y-3">
            {items.map((it, i) => (
              <AccordionItem
                key={i}
                value={`faq-${i}`}
                className="rounded-xl border border-slate-200 bg-white px-5 shadow-sm"
              >
                <AccordionTrigger className="py-5 text-left text-base font-semibold text-slate-900 hover:no-underline">
                  <span className="flex items-start gap-3">
                    <HelpCircle className="mt-0.5 h-5 w-5 flex-none text-blue-600" />
                    {t(it.q, lang)}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-5 pl-8 text-sm leading-relaxed text-slate-600">
                  {t(it.a, lang)}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </Container>
    </section>
  );
}

/** Closing CTA band. */
function CtaBanner({ lang, onSignIn }: { lang: Lang; onSignIn: () => void }) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-blue-600 to-indigo-700 py-20 text-white">
      <div className="absolute inset-0 opacity-10 [background-image:radial-gradient(circle_at_30%_50%,white_1px,transparent_1px),radial-gradient(circle_at_70%_50%,white_1px,transparent_1px)] [background-size:24px_24px]" aria-hidden />
      <Container className="relative text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t(T.cta.title, lang)}</h2>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-blue-100">
          {t(T.cta.subtitle, lang)}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button
            size="lg"
            variant="secondary"
            className="h-12 bg-white px-6 text-base text-blue-700 hover:bg-blue-50"
            onClick={onSignIn}
          >
            {t(T.hero.ctaPrimary, lang)}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </Container>
    </section>
  );
}

/** Footer with link columns and a contact line. */
function LandingFooter({ lang }: { lang: Lang }) {
  return (
    <footer className="border-t border-slate-200 bg-slate-50 py-12">
      <Container>
        <div className="grid gap-8 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white">
                <Building2 className="h-5 w-5" />
              </span>
              <span className="text-base font-semibold tracking-tight text-slate-900">HRMS Portal</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-slate-600">{t(T.footer.tagline, lang)}</p>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t(T.footer.product, lang)}
            </h4>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li><a href="#modules"  className="hover:text-slate-900">{t(T.nav.modules, lang)}</a></li>
              <li><a href="#how"      className="hover:text-slate-900">{t(T.nav.howItWorks, lang)}</a></li>
              <li><a href="#rules"    className="hover:text-slate-900">{t(T.nav.rules, lang)}</a></li>
              <li><a href="#faq"      className="hover:text-slate-900">{t(T.nav.faq, lang)}</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t(T.footer.company, lang)}
            </h4>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li className="flex items-center gap-2"><Globe className="h-3.5 w-3.5" /> Cambodia</li>
              <li className="flex items-center gap-2"><Target className="h-3.5 w-3.5" /> SMB to Enterprise</li>
              <li className="flex items-center gap-2"><LineChart className="h-3.5 w-3.5" /> Founded 2024</li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t(T.footer.contact, lang)}
            </h4>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5" />
                <a href="https://t.me/Maxwells_CX" target="_blank" rel="noopener noreferrer"
                   className="hover:text-blue-600 hover:underline">
                  @Maxwells_CX
                </a>
              </li>
              <li className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> +855 98 844 504</li>
              <li className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" /> Phnom Penh, Cambodia</li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-slate-200 pt-6 text-xs text-slate-500 sm:flex-row">
          <p>© {new Date().getFullYear()} HRMS Portal. {t(T.footer.rights, lang)}</p>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> SOC2-ready</span>
            <span className="inline-flex items-center gap-1.5"><FileSpreadsheet className="h-3.5 w-3.5" /> Excel exports</span>
          </div>
        </div>
      </Container>
    </footer>
  );
}

export function LandingPage({ onSignInClick, onDemoClick }: LandingPageProps) {
  // Drive the landing language off the global I18nContext so the toggle here
  // also flips the html.lang-km class (which triggers Khmer typography) and
  // persists into the post-login UI. I18nContext supports 'en' | 'km' | 'zh';
  // the landing copy is only en/km, so we clamp anything else to 'en'.
  const i18n = useI18n();
  // I18nContext already supports en/km/zh — use whichever is active.
  const lang: Lang = (['en', 'km', 'zh'] as const).includes(i18n.lang as Lang)
    ? (i18n.lang as Lang)
    : 'en';
  const setLang = (next: Lang) => i18n.setLang(next);
  // Anonymous landing-view tracker. Fires once per mount; the API endpoint is
  // open by design and swallows its own errors, so this is safe to call without
  // session-dedup here.
  useEffect(() => { trackLandingView(); }, []);
  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased">
      <LandingNav lang={lang} setLang={setLang} onSignIn={onSignInClick} onDemo={onDemoClick} />
      <Hero lang={lang} onSignIn={onSignInClick} onDemo={onDemoClick} />
      <MetricsStrip lang={lang} />
      <Industries lang={lang} />
      <ModulesGrid lang={lang} />
      <RealProduct lang={lang} />
      <HowItWorks lang={lang} />
      <Deployment lang={lang} />
      <CambodiaSection lang={lang} />
      <WorkingRule lang={lang} />
      <BenefitFormulas lang={lang} />
      <BenefitCalculatorsShowcase lang={lang} />
      <Testimonials lang={lang} />
      <Faq lang={lang} />
      <CtaBanner lang={lang} onSignIn={onSignInClick} />
      <LandingFooter lang={lang} />
    </div>
  );
}
