import { useState, useEffect } from 'react';
import { mockEmployees, mockContracts } from '../../data/mockData';
import { Contract, Employee } from '../../types/hrms';
import * as employeesApi from '../../api/employees';
import * as contractsApi from '../../api/contracts';
import * as departmentsApi from '../../api/departments';
import * as positionsApi from '../../api/positions';
import * as documentsApi from '../../api/documents';
import { USE_MOCKS } from '../../api/client';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../common/Pagination';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { Label } from '../ui/label';
import { DateRangeFilter } from '../common/DateRangeFilter';
import { Search, Plus, Mail, Phone, MapPin, Calendar, User, FileText, Upload, RefreshCw, Building2, Briefcase, DollarSign, CalendarCheck, Edit, FileSpreadsheet, Download, Trash2, GraduationCap, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { AddEmployeeDialog } from '../common/AddEmployeeDialog';
import { BulkUploadEmployeesDialog } from '../common/BulkUploadEmployeesDialog';
import { exportEmployeesToExcel } from '../../utils/employeeBulkParser';
import { AllDocumentsTab } from './AllDocumentsTab';
import { EXT_CHIP_CLASS, chipLabelOf, extOf, familyOf } from './documentExtension';
import { SearchablePicker } from '../common/SearchablePicker';
import { useI18n } from '../../i18n/I18nContext';
import { useDateFormat } from '../../context/DateFormatContext';
import { useTeamScope } from '../../hooks/useTeamScope';
import { useAuth } from '../../context/AuthContext';
import { format, isWithinInterval, parseISO, differenceInMonths, differenceInYears } from 'date-fns';
import { toast } from 'sonner';
import { notify } from '../../utils/notify';
import { makeDeptName } from '../../utils/deptName';
import { AuditCell } from '../common/AuditCell';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { EmployeeCell } from '../common/EmployeeCell';

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pb-2 border-b border-gray-300">
      <span className="inline-block h-4 w-1 rounded-sm bg-blue-600" aria-hidden />
      <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">{children}</h3>
    </div>
  );
}

function FieldRow({
  label, children, isEditing, required, full, icon,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  isEditing?: boolean;
  required?: boolean;
  full?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${full ? 'col-span-2' : ''}`}>
      <Label className="text-xs text-gray-500 flex items-center gap-1.5">
        {icon}
        {label}
        {required && <span className="text-red-500">*</span>}
      </Label>
      <div className={`text-sm ${!isEditing ? 'text-gray-900' : ''}`}>
        {children}
      </div>
    </div>
  );
}

function hasUnsavedChanges(
  original: typeof mockEmployees[0] | null,
  edited: typeof mockEmployees[0] | null,
): boolean {
  if (!original || !edited) return false;
  return JSON.stringify(original) !== JSON.stringify(edited);
}

// ---------------------------------------------------------------------------
// Documents tab
// ---------------------------------------------------------------------------
const DOC_TYPES: { value: import('../../types/hrms').EmployeeDocumentType; label: string }[] = [
  { value: 'contract',    label: 'Contract' },
  { value: 'id_card',     label: 'ID Card' },
  { value: 'passport',    label: 'Passport' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'resume',      label: 'Resume / CV' },
  { value: 'tax_form',    label: 'Tax Form' },
  { value: 'other',       label: 'Other' },
];

const DOC_LIMIT_MB = 10;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function EmployeeDocuments({
  employee,
  onChange,
}: {
  employee: import('../../types/hrms').Employee;
  /** Mock-mode hook so the parent can persist into mockEmployees. Ignored in live mode. */
  onChange?: (docs: import('../../types/hrms').EmployeeDocument[]) => void;
}) {
  const { formatDate } = useDateFormat();
  const [uploadType, setUploadType] = useState<documentsApi.EmployeeDocumentType>('contract');
  const [filter, setFilter] = useState<string>('all');
  // Live-mode state. In USE_MOCKS we read straight from `employee.documents`
  // and bypass this state entirely.
  const [liveDocs, setLiveDocs] = useState<documentsApi.EmployeeDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Backend keys documents by the employee UUID (apiId), not empNo.
  const employeeApiId = (employee as any).apiId ?? employee.id;

  const refresh = async () => {
    if (USE_MOCKS) return;
    setLoading(true);
    try {
      const fetched = await documentsApi.listForEmployee(employeeApiId);
      setLiveDocs(fetched);
      // Mirror into the parent's selectedEmployee.documents so the
      // tab-header badge count (read upstream) reflects what's on file
      // — otherwise it stays stuck at the empty array the API adapter
      // ships with.
      onChange?.(fetched.map(d => ({
        id: d.id,
        employeeId: d.employeeId,
        name: d.name,
        type: d.type as import('../../types/hrms').EmployeeDocumentType,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        uploadedAt: d.uploadedAt,
        notes: d.notes ?? undefined,
      })));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!USE_MOCKS) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeApiId]);

  // Adapter so the rest of the component renders the same shape regardless
  // of mode. Mock docs use `uploadedBy` (string), live docs don't carry it.
  const docs: import('../../types/hrms').EmployeeDocument[] = USE_MOCKS
    ? (employee.documents ?? [])
    : liveDocs.map(d => ({
        id: d.id,
        employeeId: d.employeeId,
        name: d.name,
        type: d.type as import('../../types/hrms').EmployeeDocumentType,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        uploadedAt: d.uploadedAt,
        notes: d.notes ?? undefined,
      }));
  const visible = filter === 'all' ? docs : docs.filter(d => d.type === filter);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    // Client-side size guard mirrors the server's multipart limit.
    const eligible: File[] = [];
    let rejected = 0;
    Array.from(files).forEach(f => {
      if (f.size > DOC_LIMIT_MB * 1024 * 1024) rejected++;
      else eligible.push(f);
    });
    if (rejected > 0) notify.validate(`${rejected} file(s) exceeded ${DOC_LIMIT_MB} MB and were skipped`);
    if (eligible.length === 0) return;

    if (USE_MOCKS) {
      const next: import('../../types/hrms').EmployeeDocument[] = [...docs];
      eligible.forEach(f => next.push({
        id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        employeeId: employee.id,
        name: f.name,
        type: uploadType,
        mimeType: f.type || 'application/octet-stream',
        sizeBytes: f.size,
        uploadedAt: new Date().toISOString(),
        uploadedBy: 'you',
      }));
      onChange?.(next);
      toast.success(`Uploaded ${eligible.length} file${eligible.length !== 1 ? 's' : ''}`);
      return;
    }

    setUploading(true);
    let succeeded = 0;
    try {
      // Sequential upload — keeps the failure mode obvious if one file is
      // rejected by the server (e.g. wrong MIME) and avoids slamming the
      // backend with parallel multipart streams.
      for (const f of eligible) {
        try {
          await documentsApi.upload(employeeApiId, f, uploadType);
          succeeded++;
        } catch (err) {
          toast.error(`Failed to upload ${f.name}: ${err instanceof Error ? err.message : 'unknown'}`);
        }
      }
      if (succeeded > 0) {
        toast.success(`Uploaded ${succeeded} file${succeeded !== 1 ? 's' : ''}`);
        await refresh();
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this document?')) return;
    if (USE_MOCKS) {
      onChange?.(docs.filter(d => d.id !== id));
      toast.success('Document deleted');
      return;
    }
    try {
      await documentsApi.remove(id);
      toast.success('Document deleted');
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handleDownload = async (doc: import('../../types/hrms').EmployeeDocument) => {
    if (USE_MOCKS) {
      toast.success(`Downloading ${doc.name}…`);
      return;
    }
    try {
      // Build a thin live-doc shape — only id and name are read by download().
      await documentsApi.download({
        id: doc.id, employeeId: doc.employeeId, name: doc.name,
        type: doc.type, mimeType: doc.mimeType, sizeBytes: doc.sizeBytes,
        uploadedAt: doc.uploadedAt,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to download');
    }
  };

  const counts = DOC_TYPES.reduce((m, t) => {
    m[t.value] = docs.filter(d => d.type === t.value).length;
    return m;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-4">
      {/* Upload */}
      <div className="p-4 rounded-md border-2 border-dashed border-gray-300 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <Label className="text-xs text-gray-600">Document type</Label>
            <select
              value={uploadType}
              onChange={(e) => setUploadType(e.target.value as typeof uploadType)}
              className="w-full h-9 px-3 border rounded-md text-sm"
            >
              {DOC_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 shrink-0">
            <Label className="text-xs text-gray-600">&nbsp;</Label>
            <input
              type="file"
              multiple
              onChange={(e) => { void handleFiles(e.target.files); e.target.value = ''; }}
              className="hidden"
              id="doc-upload-input"
              disabled={uploading}
            />
            <label htmlFor="doc-upload-input">
              <Button variant="outline" size="sm" asChild disabled={uploading}>
                <span>
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  {uploading ? 'Uploading…' : 'Upload file(s)'}
                </span>
              </Button>
            </label>
          </div>
        </div>
        <p className="text-[11px] text-gray-500">
          PDF, images, or Office documents up to {DOC_LIMIT_MB} MB each. Drag-drop supported when you click Upload.
        </p>
      </div>

      {/* Type filter */}
      {docs.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          <button
            onClick={() => setFilter('all')}
            className={`px-2 py-1 rounded-md border ${filter === 'all' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 hover:bg-gray-50'}`}
          >
            All <span className="ml-1 text-gray-500">{docs.length}</span>
          </button>
          {DOC_TYPES.filter(t => counts[t.value] > 0).map(t => (
            <button
              key={t.value}
              onClick={() => setFilter(t.value)}
              className={`px-2 py-1 rounded-md border ${filter === t.value ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 hover:bg-gray-50'}`}
            >
              {t.label} <span className="ml-1 text-gray-500">{counts[t.value]}</span>
            </button>
          ))}
        </div>
      )}

      {/* List */}
      {visible.length === 0 ? (
        <div className="text-center py-10 border border-dashed rounded-md">
          <FileText className="h-10 w-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">{loading ? 'Loading…' : 'No documents yet.'}</p>
          {!loading && (
            <p className="text-xs text-gray-400 mt-1">Upload contracts, ID scans, certificates, etc.</p>
          )}
        </div>
      ) : (
        <ul className="divide-y border rounded-md">
          {visible.map(doc => {
            const label = DOC_TYPES.find(t => t.value === doc.type)?.label ?? doc.type;
            const family = familyOf(extOf(doc.name), doc.mimeType);
            const chipLabel = chipLabelOf(doc.name);
            return (
              <li key={doc.id} className="flex items-center gap-3 p-3 hover:bg-gray-50">
                <span
                  className={`shrink-0 inline-flex items-center justify-center min-w-[2.25rem] h-9 px-1.5 rounded-md border text-[10px] font-semibold tracking-wide uppercase ${EXT_CHIP_CLASS[family]}`}
                  title={doc.mimeType}
                >
                  {chipLabel}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{doc.name}</p>
                  <p className="text-xs text-gray-500">
                    <span className="capitalize">{label}</span> · {formatBytes(doc.sizeBytes)} · {formatDate(doc.uploadedAt)}
                    {doc.uploadedBy && ` · ${doc.uploadedBy}`}
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDownload(doc)} title="Download">
                  <Download className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                  onClick={() => handleDelete(doc.id)}
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Adapts a backend Employee (api/employees.Employee) to the front-end mock
// Employee shape used throughout the UI. The user-facing `id` holds the
// human-readable empNo ("EMP001"); the backend UUID is kept on `apiId` and
// used only when calling mutating endpoints.
function adaptApiEmployee(e: employeesApi.Employee): Employee {
  return {
    id: e.empNo,
    apiId: e.id,
    name: e.name,
    khmerName: e.khmerName ?? undefined,
    email: e.email,
    position: e.position,
    department: e.departmentId ?? '-',
    joinDate: e.joinDate,
    status: (e.status === 'active' ? 'active' : 'inactive') as Employee['status'],
    contactNumber: e.contactNumber ?? '',
    baseSalary: e.baseSalary,
    managerId: e.managerId ?? undefined,
    profileImage: e.profileImage ?? undefined,
    gender: (e.gender === 'male' || e.gender === 'female') ? e.gender : undefined,
    maritalStatus: (e.maritalStatus === 'single' || e.maritalStatus === 'married' || e.maritalStatus === 'divorced' || e.maritalStatus === 'widowed') ? e.maritalStatus : undefined,
    numberOfChildren: e.numberOfChildren ?? 0,
    decouple: e.decouple ?? false,
    claimSpouse: e.claimSpouse ?? false,
    dateOfBirth: e.dateOfBirth ?? undefined,
    placeOfBirth: e.placeOfBirth ?? undefined,
    currentAddress: e.currentAddress ?? undefined,
    nffNo: e.nffNo ?? undefined,
    tid: e.tid ?? undefined,
    contractExpireDate: e.contractExpireDate ?? undefined,
    resignDate: e.resignDate ?? undefined,
    // Default true when the backend hasn't sent the field (older rows
    // before V15) so existing employees stay counted in attendance.
    attendanceYn: e.attendanceYn ?? true,
    // NOT NULL DEFAULT 0 columns since V43 — coerce missing server data
    // to 0 so the input + payslip line read a number, not blank.
    positionAllowance: e.positionAllowance ?? 0,
    evaluationAllowance: e.evaluationAllowance ?? 0,
    // V70 — Cambodian Labour Law skill level; nullable until HR sets it.
    level: (e.level as Employee['level']) ?? undefined,
    // Forward audit fields (createdAt/By/Name + updatedAt/By/Name) so
    // the Author/Modifier columns can read them. Cast to a dynamic
    // shape since the FE Employee type doesn't declare them yet.
    ...{
      createdAt: e.createdAt ?? undefined,
      createdById: e.createdById ?? undefined,
      createdByName: e.createdByName ?? undefined,
      updatedAt: e.updatedAt ?? undefined,
      updatedById: e.updatedById ?? undefined,
      updatedByName: e.updatedByName ?? undefined,
    },
  } as Employee;
}

// Adapts a backend Contract to the front-end mock Contract shape.
function adaptApiContract(c: contractsApi.Contract): Contract {
  const today = new Date().toISOString().slice(0, 10);
  // The UI distinguishes 'expiring' (active and within 60d of end) — backend
  // only stores active|expired|terminated.
  let status: Contract['status'];
  if (c.status === 'expired' || c.status === 'terminated') {
    status = 'expired';
  } else {
    const daysToEnd = Math.ceil(
      (new Date(c.endDate).getTime() - new Date(today).getTime()) / 86_400_000,
    );
    status = daysToEnd <= 60 && daysToEnd >= 0 ? 'expiring' : 'active';
  }
  return {
    id: c.id,
    employeeId: c.employeeId,
    startDate: c.startDate,
    endDate: c.endDate,
    status,
    contractType: c.contractType || 'UDC',
    salary: c.salary,
    notes: c.notes,
    createdAt: c.createdAt ?? new Date().toISOString(),
  };
}

export function Employees() {
  const { t } = useI18n();
  const { formatDate } = useDateFormat();
  const { isAdmin, isManager, isTenantWide, canViewEmployee } = useTeamScope();
  const { currentUser } = useAuth();
  void isAdmin; void isManager;
  // Live-data visibility resolver. The mock-backed canViewEmployee can't
  // see live employee UUIDs, so a manager logging into a fresh DB sees
  // an empty list. We derive the allowed set locally from the loaded
  // employees: self + everyone whose managerId points at me. Falls back
  // to the mock helper only when employees haven't loaded yet.
  const myEmpId = currentUser?.employeeId ?? '';
  const canSeeEmployee = (emp: Employee) => {
    if (isTenantWide) return true;
    if (!myEmpId) return false;
    const empApiId = (emp as { apiId?: string }).apiId;
    // Self
    if (emp.id === myEmpId || empApiId === myEmpId) return true;
    // Direct report — this employee's manager is me
    if (emp.managerId && emp.managerId === myEmpId) return true;
    // Mock-mode safety net for any data that lives only in mockEmployees
    return canViewEmployee(emp.id);
  };
  // Permission-matrix helpers — canManageRoster is true if the role can
  // create or update employees. Granular create/update/delete are exposed
  // separately so individual buttons (Edit, Delete, Bulk Upload) can gate
  // independently per the matrix the admin configured.
  const { canCreate, canUpdate, canDelete } = useAuth();
  const canCreateEmp = canCreate('employees');
  const canUpdateEmp = canUpdate('employees');
  const canDeleteEmp = canDelete('employees');
  const canCreateContract = canCreate('contracts');
  const canUpdateContract = canUpdate('contracts');
  const canManageRoster = canCreateEmp || canUpdateEmp;
  const [searchTerm, setSearchTerm] = useState('');
  // Default to "Active" — administrators almost always work with the
  // current roster; inactive/expired rows are a deliberate lookup.
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
  // Department filter — value is either 'all' or a deptId. Cleared via the
  // "All Departments" option. Persisted only in component state.
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>(USE_MOCKS ? mockEmployees : []);
  const [rawEmployees, setRawEmployees] = useState<employeesApi.Employee[]>([]);
  const [contracts, setContracts] = useState<Contract[]>(USE_MOCKS ? mockContracts : []);
  const [departments, setDepartments] = useState<departmentsApi.Department[]>([]);
  const [positions, setPositions] = useState<positionsApi.Position[]>([]);
  const [loading, setLoading] = useState<boolean>(!USE_MOCKS);

  // departmentId → name lookup. In mock mode the adapter stores the name
  // directly, so the map just round-trips through the same string.
  const deptName = makeDeptName(departments, '-');
  // Bump on create so re-read of mockEmployees refreshes the table.
  const [, setRosterVersion] = useState(0);
  const bumpRoster = () => setRosterVersion(v => v + 1);

  const loadEmployees = async () => {
    if (USE_MOCKS) {
      setEmployees([...mockEmployees]);
      return;
    }
    try {
      // Page through results so a tenant with > 1 page of employees never
      // silently truncates. Concrete bug we hit: an admin couldn't find
      // empNo 6160 (loaded after the backend's first-page cap), and got a
      // confusing "already exists" error when trying to re-add them.
      const PAGE_SIZE = 500;
      let page = 0;
      let res = await employeesApi.list({ size: PAGE_SIZE, page });
      let acc = [...res.content];
      const total = res.totalPages ?? 1;
      while ((page + 1) < total) {
        page += 1;
        res = await employeesApi.list({ size: PAGE_SIZE, page });
        acc = acc.concat(res.content);
      }
      setRawEmployees(acc);
      setEmployees(acc.map(adaptApiEmployee));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load employees');
    }
  };

  const loadContracts = async () => {
    if (USE_MOCKS) {
      setContracts([...mockContracts]);
      return;
    }
    try {
      // Backend caps page size at 200 (ContractService#search). For tenants
      // with more than 200 contracts we'd silently lose the tail — including
      // freshly-created contracts the user just clicked save on. Walk every
      // page until totalPages, with a safety cap so a misbehaving server
      // can't loop us forever.
      const PAGE_SIZE = 200;
      const SAFETY_PAGES = 50; // 10 000 contracts hard ceiling
      const all: Contract[] = [];
      for (let p = 0; p < SAFETY_PAGES; p++) {
        const res = await contractsApi.list({ size: PAGE_SIZE, page: p });
        all.push(...res.data.map(adaptApiContract));
        if (p + 1 >= (res.totalPages ?? 1)) break;
      }
      setContracts(all);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load contracts');
    }
  };

  const loadDepartments = async () => {
    if (USE_MOCKS) return;
    try {
      setDepartments(await departmentsApi.list());
    } catch (err) {
      // Non-fatal — without the map, dept cells fall back to the raw id.
      console.warn('Could not load departments', err);
    }
  };

  // Positions feed the Position picker on the Employee form. Loaded once on
  // mount; positions are managed in Settings → Employee Settings → Positions.
  const loadPositions = async () => {
    if (USE_MOCKS) return;
    try {
      setPositions(await positionsApi.list());
    } catch (err) {
      console.warn('Could not load positions', err);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await Promise.all([loadEmployees(), loadContracts(), loadDepartments(), loadPositions()]);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleCreated = (emp: Employee) => {
    if (USE_MOCKS) {
      mockEmployees.push(emp);
      setEmployees([...mockEmployees]);
      bumpRoster();
    } else {
      // AddEmployeeDialog is expected to perform the API create; just refetch.
      loadEmployees();
    }
  };
  const handleImported = (rows: Employee[]) => {
    if (USE_MOCKS) {
      rows.forEach(r => mockEmployees.push(r));
      setEmployees([...mockEmployees]);
      bumpRoster();
    } else {
      // BulkUploadEmployeesDialog is expected to perform API creates; just refetch.
      loadEmployees();
    }
  };
  const [selectedEmployee, setSelectedEmployee] = useState<typeof mockEmployees[0] | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedEmployee, setEditedEmployee] = useState<typeof mockEmployees[0] | null>(null);
  // Single dialog handles add / edit / renew. `selectedContract` is the row
  // being edited or renewed; null when adding.
  const [contractDialogOpen, setContractDialogOpen] = useState(false);
  const [contractMode, setContractMode] = useState<'add' | 'edit' | 'renew'>('add');
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [contractForm, setContractForm] = useState({
    startDate: '',
    endDate: '',
    salary: 0,
    contractType: 'UDC',
    notes: '',
    /** Why the contract ended. Empty = still active / natural expiry.
     *  Only persists on a contract that has actually ended; the form
     *  leaves it blank for new rows. */
    terminationReason: '',
  });
  const [savingContract, setSavingContract] = useState(false);

  // Profile image: in live mode the API's storage path isn't a browser-
  // loadable URL, so we fetch the bytes via apiFetch (carries the bearer)
  // and stash the blob URL for AvatarImage. Cache-bust counter forces a
  // refetch right after upload.
  const [avatarSrc, setAvatarSrc] = useState<string | undefined>(undefined);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [dateFilter, setDateFilter] = useState<{ start: string | null; end: string | null }>({
    start: null,
    end: null,
  });

  const handleDateFilterChange = (startDate: string | null, endDate: string | null) => {
    setDateFilter({ start: startDate, end: endDate });
  };

  const calculateExperience = (joinDate: string) => {
    const start = parseISO(joinDate);
    const now = new Date();
    const years = differenceInYears(now, start);
    const months = differenceInMonths(now, start) % 12;
    return `${years}y ${months}m`;
  };

  const handleEditEmployee = () => {
    if (selectedEmployee) {
      setEditedEmployee({ ...selectedEmployee });
      setIsEditing(true);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedEmployee(null);
  };

  const handleSaveEmployee = async () => {
    if (!editedEmployee) return;

    // Hard-required fields (name + email) match the backend's
    // @NotBlank columns. contactNumber stays optional because the
    // bootstrap admin (EMP001) seeds without one, and gating Save on
    // it makes the existing row un-editable until HR fills in a phone
    // that's been blank for the row's whole lifetime. Naming the
    // missing field explicitly tells the user where to look (the
    // Profile tab) — the previous toast just said "fill in required
    // fields" without saying which.
    const missing: string[] = [];
    if (!editedEmployee.name?.trim())  missing.push('Name');
    if (!editedEmployee.email?.trim()) missing.push('Email');
    if (missing.length > 0) {
      notify.validate(`Missing on Profile tab: ${missing.join(', ')}`);
      return;
    }

    if (USE_MOCKS) {
      setSelectedEmployee(editedEmployee);
      setEmployees(prev => prev.map(e => e.id === editedEmployee.id ? editedEmployee : e));
      toast.success('Employee updated successfully');
      setIsEditing(false);
      setEditedEmployee(null);
      return;
    }

    try {
      const { id: empNo, apiId, status, department, ...rest } = editedEmployee;
      // UI field `department` holds the departmentId in live mode — map it
      // back to the field name the backend DTO expects.
      const body: employeesApi.CreateEmployeeRequest = {
        ...(rest as unknown as Omit<employeesApi.CreateEmployeeRequest, 'departmentId' | 'empNo'>),
        empNo,
        departmentId: department && department !== '-' ? department : null,
        status,
      };
      // The mutating endpoint is keyed by the backend UUID, not the human empNo.
      const targetId = apiId ?? empNo;
      await employeesApi.update(targetId, body);
      toast.success('Employee updated successfully');
      setSelectedEmployee(editedEmployee);
      setIsEditing(false);
      setEditedEmployee(null);
      await loadEmployees();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update employee');
    }
  };

  /**
   * Inline single-field update from the row picker — currently used for
   * Position and Department. Optimistically swaps the field locally, fires
   * the PUT (the only mutating verb the employees endpoint exposes), and
   * rolls the row back if the request fails. Avoids a full reload so other
   * inline edits in flight don't get clobbered.
   *
   * When the dept changes, the employee's "Reports To" (managerId) is
   * auto-flipped to the new dept's PIC — but only when the current value
   * is unset OR still tracking the old dept's PIC. A managerId that was
   * manually overridden by HR (i.e. doesn't match either dept's PIC) is
   * left alone, mirroring the details-sheet edit flow.
   */
  const handleQuickFieldUpdate = async (
    employee: Employee,
    patch: { position?: string; department?: string | null },
  ) => {
    // Compute the auto-managerId follow-through up-front so both the
    // mock-mode short-circuit and the live PUT path apply it consistently.
    let managerPatch: { managerId?: string | null } = {};
    if (patch.department !== undefined) {
      const newDeptKey = patch.department && patch.department !== '-' ? patch.department : null;
      const newDept = newDeptKey
        ? departments.find(d => (USE_MOCKS ? d.name === newDeptKey : d.id === newDeptKey))
        : undefined;
      const oldDeptKey = employee.department && employee.department !== '-' ? employee.department : null;
      const oldDept = oldDeptKey
        ? departments.find(d => (USE_MOCKS ? d.name === oldDeptKey : d.id === oldDeptKey))
        : undefined;
      const newPic = newDept?.managerId ?? null;
      const oldPic = oldDept?.managerId ?? null;
      const currentReports = employee.managerId ?? null;
      const reportsFollowsDeptPic = !currentReports || currentReports === oldPic;
      if (reportsFollowsDeptPic && newPic !== currentReports) {
        managerPatch = { managerId: newPic };
      }
    }

    if (USE_MOCKS) {
      setEmployees(prev => prev.map(e =>
        e.id === employee.id
          ? { ...e, ...patch, ...(managerPatch.managerId !== undefined ? { managerId: managerPatch.managerId ?? undefined } : {}) }
          : e,
      ));
      toast.success('Updated');
      return;
    }
    const raw = rawEmployees.find(r => r.id === employee.apiId || r.empNo === employee.id);
    if (!raw) {
      toast.error('Could not locate the employee record to update');
      return;
    }
    // Snapshot for rollback if the API call rejects.
    const before = employee;
    setEmployees(prev => prev.map(e =>
      e.id === employee.id
        ? { ...e, ...patch, ...(managerPatch.managerId !== undefined ? { managerId: managerPatch.managerId ?? undefined } : {}) }
        : e,
    ));
    try {
      const body: employeesApi.CreateEmployeeRequest = {
        empNo: raw.empNo,
        name: raw.name,
        khmerName: raw.khmerName ?? null,
        email: raw.email,
        position: patch.position ?? raw.position,
        departmentId: patch.department === undefined
          ? (raw.departmentId ?? null)
          : (patch.department && patch.department !== '-' ? patch.department : null),
        joinDate: raw.joinDate,
        status: raw.status,
        contactNumber: raw.contactNumber ?? null,
        baseSalary: raw.baseSalary,
        managerId: managerPatch.managerId !== undefined ? managerPatch.managerId : (raw.managerId ?? null),
        gender: raw.gender ?? null,
        dateOfBirth: raw.dateOfBirth ?? null,
        placeOfBirth: raw.placeOfBirth ?? null,
        currentAddress: raw.currentAddress ?? null,
        nffNo: raw.nffNo ?? null,
        tid: raw.tid ?? null,
        contractExpireDate: raw.contractExpireDate ?? null,
        resignDate: raw.resignDate ?? null,
        attendanceYn: raw.attendanceYn,
        decouple: raw.decouple ?? false,
        claimSpouse: raw.claimSpouse ?? false,
        positionAllowance: raw.positionAllowance ?? 0,
        evaluationAllowance: raw.evaluationAllowance ?? 0,
      };
      const updated = await employeesApi.update(raw.id, body);
      // Refresh the raw cache so subsequent edits see the new value.
      setRawEmployees(prev => prev.map(r => r.id === updated.id ? updated : r));
      toast.success('Updated');
    } catch (err) {
      // Rollback on failure.
      setEmployees(prev => prev.map(e => e.id === employee.id ? before : e));
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  /** V70 — Cambodian Labour Law probation max by employee level.
   *  Returns the legal probation length in months for the picked level.
   *  Unset / unknown levels fall back to the 3-month default used for
   *  office / specialized roles so HR isn't blocked when the field is
   *  empty on legacy employees. */
  const probationMonthsForLevel = (level?: string | null): number => {
    switch (level) {
      case 'ns_cook':   return 1;
      case 'ns_labour': return 2;
      case 'office':
      case 'specialized':
      default:          return 3;
    }
  };

  /** Add N months to {@code yyyymmdd} and clamp the resulting day so
   *  the end-date lands on a valid calendar day. Used when HR flips a
   *  contract to {@code Probation} so the End Date snaps to the legal
   *  cap derived from the employee's level. */
  const addMonths = (yyyymmdd: string, months: number): string => {
    if (!yyyymmdd) return '';
    const d = new Date(yyyymmdd);
    if (isNaN(d.getTime())) return '';
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + months);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastDay));
    return d.toISOString().slice(0, 10);
  };

  const handleAddContract = () => {
    if (!selectedEmployee) return;
    setContractMode('add');
    setSelectedContract(null);
    setContractForm({
      startDate: new Date().toISOString().slice(0, 10),
      endDate: '',
      salary: selectedEmployee.baseSalary || 0,
      contractType: 'UDC',
      notes: '',
      terminationReason: '',
    });
    setContractDialogOpen(true);
  };

  const handleEditContract = (contract: Contract) => {
    setContractMode('edit');
    setSelectedContract(contract);
    setContractForm({
      startDate: contract.startDate,
      endDate: contract.endDate,
      salary: contract.salary || 0,
      contractType: contract.contractType,
      notes: contract.notes || '',
      terminationReason: (contract.terminationReason as string) || '',
    });
    setContractDialogOpen(true);
  };

  const handleRenewContract = (contract: Contract) => {
    setContractMode('renew');
    setSelectedContract(contract);
    setContractForm({
      startDate: contract.endDate,
      endDate: '',
      salary: contract.salary || 0,
      contractType: contract.contractType,
      notes: '',
      terminationReason: '',
    });
    setContractDialogOpen(true);
  };

  const handleSaveContract = async () => {
    if (!contractForm.startDate || !contractForm.endDate) {
      notify.validate('Start date and end date are required');
      return;
    }
    if (new Date(contractForm.endDate) <= new Date(contractForm.startDate)) {
      notify.validate('End date must be after start date');
      return;
    }
    if (!contractForm.contractType.trim()) {
      notify.validate('Contract type is required');
      return;
    }

    if (USE_MOCKS || !selectedEmployee) {
      // Mock mode mutates the local list — no backend round-trip.
      const today = new Date().toISOString().slice(0, 10);
      if (contractMode === 'edit' && selectedContract) {
        setContracts(contracts.map(c => c.id === selectedContract.id ? {
          ...c,
          startDate: contractForm.startDate,
          endDate: contractForm.endDate,
          contractType: contractForm.contractType,
          salary: contractForm.salary,
          notes: contractForm.notes,
        } : c));
        toast.success('Contract updated');
      } else if (contractMode === 'renew' && selectedContract) {
        const renewed: Contract = {
          id: `CON-${Date.now()}`,
          employeeId: selectedContract.employeeId,
          startDate: contractForm.startDate,
          endDate: contractForm.endDate,
          status: 'active',
          contractType: contractForm.contractType,
          salary: contractForm.salary,
          notes: contractForm.notes,
          createdAt: today,
        };
        setContracts([
          renewed,
          ...contracts.map(c => c.id === selectedContract.id ? { ...c, status: 'expired' as const } : c),
        ]);
        toast.success('Contract renewed');
      } else {
        const created: Contract = {
          id: `CON-${Date.now()}`,
          employeeId: selectedEmployee.id,
          startDate: contractForm.startDate,
          endDate: contractForm.endDate,
          status: 'active',
          contractType: contractForm.contractType,
          salary: contractForm.salary,
          notes: contractForm.notes,
          createdAt: today,
        };
        setContracts([created, ...contracts]);
        toast.success('Contract created');
      }
      setContractDialogOpen(false);
      return;
    }

    setSavingContract(true);
    try {
      const payload: contractsApi.ContractRequest = {
        startDate: contractForm.startDate,
        endDate: contractForm.endDate,
        contractType: contractForm.contractType.trim(),
        salary: contractForm.salary || null,
        notes: contractForm.notes || undefined,
        // Empty string means "natural / still active" — send empty
        // (not null) so the backend's null-leaves-untouched logic
        // doesn't preserve a stale 'misconduct' from a previous save.
        terminationReason: contractForm.terminationReason || '',
      };
      if (contractMode === 'add') {
        // Live mode needs the backend employee UUID, not empNo.
        const employeeApiId = selectedEmployee.apiId ?? selectedEmployee.id;
        await contractsApi.create(employeeApiId, payload);
        toast.success('Contract created');
      } else if (contractMode === 'edit' && selectedContract) {
        await contractsApi.update(selectedContract.id, payload);
        toast.success('Contract updated');
      } else if (contractMode === 'renew' && selectedContract) {
        await contractsApi.renew(selectedContract.id, payload);
        toast.success('Contract renewed');
      }
      setContractDialogOpen(false);
      await loadContracts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save contract');
    } finally {
      setSavingContract(false);
    }
  };

  /**
   * Returns contracts owned by the given employee. In mock mode `Employee.id`
   * is the empNo; in live mode it's still the empNo while `apiId` is the
   * backend UUID — so we match against both. Otherwise live-mode contract
   * lookups always come back empty because the API stores `employeeId` as
   * the UUID.
   */
  const getEmployeeContracts = (emp: Employee) => {
    const ids = new Set([emp.id, emp.apiId].filter(Boolean) as string[]);
    return contracts
      .filter(c => ids.has(c.employeeId))
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  };

  /**
   * Latest contract end date for an employee — i.e. the farthest-out endDate
   * across all of their contracts. Falls back to `Employee.contractExpireDate`
   * (the field stored directly on the employee record) when no contracts
   * exist yet, so freshly-imported employees still surface a sensible value.
   */
  const getLatestContractEnd = (emp: Employee): string | undefined => {
    const list = getEmployeeContracts(emp);
    if (list.length === 0) return emp.contractExpireDate;
    return list.reduce((best, c) =>
      !best || new Date(c.endDate) > new Date(best) ? c.endDate : best,
      undefined as string | undefined,
    ) ?? emp.contractExpireDate;
  };

  const getContractStatusBadge = (status: Contract['status']) => {
    const colors = {
      active: 'bg-green-100 text-green-800',
      expiring: 'bg-orange-100 text-orange-800',
      expired: 'bg-gray-100 text-gray-800',
    };
    return <Badge className={colors[status]}>{status}</Badge>;
  };

  // Multi-field wildcard search: split the input on whitespace and require
  // every token to appear as a substring of at least one searchable field.
  // Searchable fields: English name, Khmer name, employee id (empNo), phone,
  // email, department. Khmer is matched case-insensitively too — toLowerCase
  // is a no-op on Khmer script but keeps the comparison uniform.
  const tokens = searchTerm.trim().toLowerCase().split(/\s+/).filter(Boolean);
  // Visible roster (after permission scope) is the basis for both the
  // status-chip counts and the filtered list, so the badges always reflect
  // what the current user is allowed to see.
  const visibleEmployees = employees.filter(canSeeEmployee);
  const statusCounts = {
    all: visibleEmployees.length,
    active: visibleEmployees.filter(e => e.status === 'active').length,
    inactive: visibleEmployees.filter(e => e.status !== 'active').length,
  };
  let filteredEmployees = visibleEmployees.filter(emp => {
    if (statusFilter === 'active' && emp.status !== 'active') return false;
    if (statusFilter === 'inactive' && emp.status === 'active') return false;
    if (departmentFilter !== 'all' && emp.department !== departmentFilter) return false;
    if (tokens.length === 0) return true;
    const haystack = [
      emp.name,
      emp.khmerName,
      emp.id,
      emp.empNo,
      emp.contactNumber,
      emp.email,
      deptName(emp.department),
    ].filter(Boolean).join(' ').toLowerCase();
    return tokens.every(tok => haystack.includes(tok));
  });

  // Apply date filter based on joinDate
  if (dateFilter.start || dateFilter.end) {
    filteredEmployees = filteredEmployees.filter(emp => {
      const empDate = parseISO(emp.joinDate);
      if (dateFilter.start && dateFilter.end) {
        return isWithinInterval(empDate, {
          start: parseISO(dateFilter.start),
          end: parseISO(dateFilter.end),
        });
      } else if (dateFilter.start) {
        return empDate >= parseISO(dateFilter.start);
      } else if (dateFilter.end) {
        return empDate <= parseISO(dateFilter.end);
      }
      return true;
    });
  }

  // Pagination
  const employeePagination = usePagination(filteredEmployees, 10);

  // Reset pagination when search, filter, or data changes.
  useEffect(() => {
    employeePagination.resetPage();
  }, [searchTerm, dateFilter, statusFilter, departmentFilter, employees.length]);

  // Load the employee's profile image whenever the selected row changes (or
  // a fresh upload bumps the version). Mock mode uses profileImage as-is.
  useEffect(() => {
    if (USE_MOCKS) {
      setAvatarSrc(selectedEmployee?.profileImage);
      return;
    }
    const empApiId = (selectedEmployee as any)?.apiId ?? selectedEmployee?.id;
    if (!empApiId) {
      setAvatarSrc(undefined);
      return;
    }
    // Skip the blob fetch when the row has no stored image — the DTO's
    // profileImage carries the storage path, so an empty value means the
    // employee hasn't uploaded one. Without this guard every avatar render
    // logs a 404 from /profile-image to the network panel.
    if (!selectedEmployee?.profileImage) {
      setAvatarSrc(undefined);
      return;
    }
    let cancelled = false;
    let activeUrl: string | null = null;
    (async () => {
      try {
        const url = await documentsApi.fetchProfileImageBlobUrl(empApiId);
        if (cancelled) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        activeUrl = url;
        setAvatarSrc(url ?? undefined);
      } catch {
        if (!cancelled) setAvatarSrc(undefined);
      }
    })();
    return () => {
      cancelled = true;
      if (activeUrl) URL.revokeObjectURL(activeUrl);
    };
  }, [selectedEmployee?.id, (selectedEmployee as any)?.apiId, avatarVersion]);

  const handleProfileImageUpload = async (file: File) => {
    if (!selectedEmployee) return;
    if (!file.type.startsWith('image/')) {
      notify.validate('Please select an image file');
      return;
    }
    if (USE_MOCKS) {
      // Mock mode: read the file as a data URL and stick it on the local row.
      const reader = new FileReader();
      reader.onload = () => {
        const url = reader.result as string;
        setSelectedEmployee({ ...selectedEmployee, profileImage: url });
        if (editedEmployee) setEditedEmployee({ ...editedEmployee, profileImage: url });
        toast.success('Profile photo updated');
      };
      reader.readAsDataURL(file);
      return;
    }
    setUploadingAvatar(true);
    try {
      const empApiId = (selectedEmployee as any).apiId ?? selectedEmployee.id;
      await documentsApi.uploadProfileImage(empApiId, file);
      toast.success('Profile photo updated');
      // Bump version so the effect above re-fetches the new image.
      setAvatarVersion(v => v + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingAvatar(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('page.employees.title')}</h1>
          <p className="text-gray-500">{t('page.employees.description')}</p>
        </div>
        <div className="flex gap-2">
          <DateRangeFilter onFilterChange={handleDateFilterChange} />
          {/* Add/Bulk-upload are admin+manager only — employees (if they reach this view) see a read-only, team-scoped roster. */}
          {canManageRoster && (
            <>
              <Button variant="outline" onClick={() => setBulkDialogOpen(true)}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Upload Bulk
              </Button>
              <Button
                variant="outline"
                disabled={filteredEmployees.length === 0}
                onClick={() => {
                  // Re-importable Excel: same column order as the Bulk
                  // Upload template, so HR can round-trip edits through
                  // Excel and re-upload without reshaping.
                  if (filteredEmployees.length === 0) {
                    toast.error('No employees match the current filters');
                    return;
                  }
                  exportEmployeesToExcel(filteredEmployees, deptName);
                  toast.success(`Exported ${filteredEmployees.length} employee${filteredEmployees.length === 1 ? '' : 's'}`);
                }}
              >
                <Download className="mr-2 h-4 w-4" />
                Export Excel ({filteredEmployees.length})
              </Button>
              <Button onClick={() => setAddDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Employee
              </Button>
            </>
          )}
        </div>
      </div>

      <AddEmployeeDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onCreated={handleCreated}
        positions={positions}
        departments={departments}
        employees={employees}
      />
      <BulkUploadEmployeesDialog
        open={bulkDialogOpen}
        onOpenChange={setBulkDialogOpen}
        onImported={handleImported}
        departments={departments}
        existingEmpNos={USE_MOCKS ? employees.map(e => e.id) : rawEmployees.map(e => e.empNo)}
        existingEmails={USE_MOCKS ? employees.map(e => e.email) : rawEmployees.map(e => e.email)}
      />

      {/* Two tabs: the existing roster table, and a tenant-wide
          documents browser. The roster is the default so existing
          muscle-memory stays intact; All Documents is opt-in. */}
      <Tabs defaultValue="roster" className="space-y-4">
        <TabsList>
          <TabsTrigger value="roster">
            <User className="h-4 w-4 mr-1.5" />
            Employees
          </TabsTrigger>
          <TabsTrigger value="documents">
            <FileText className="h-4 w-4 mr-1.5" />
            All Documents
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roster" className="mt-0">

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by name, Khmer name, ID, or phone…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          {/* Status filter chips — counts derived from the permission-scoped
              roster, so they always agree with what the user can see in the
              table below. The Department dropdown stacks alongside on a wide
              screen, wraps to a new line on narrow ones. */}
          <div className="flex flex-wrap items-center gap-2">
            {([
              { key: 'all',      label: 'All' },
              { key: 'active',   label: 'Active' },
              { key: 'inactive', label: 'Inactive' },
            ] as const).map(chip => {
              const isActive = statusFilter === chip.key;
              const count = statusCounts[chip.key];
              return (
                <Button
                  key={chip.key}
                  variant={isActive ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter(chip.key)}
                  className={
                    isActive
                      ? chip.key === 'active'
                        ? 'bg-green-600 hover:bg-green-700 text-white border-0'
                        : chip.key === 'inactive'
                          ? 'bg-gray-700 hover:bg-gray-800 text-white border-0'
                          : 'bg-blue-600 hover:bg-blue-700 text-white border-0'
                      : ''
                  }
                >
                  {chip.label}
                  <Badge
                    variant="secondary"
                    className={`ml-2 ${isActive ? 'bg-white/20 text-white' : ''}`}
                  >
                    {count}
                  </Badge>
                </Button>
              );
            })}
            <div className="flex items-center gap-2 ml-auto">
              <Building2 className="h-4 w-4 text-gray-400" />
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="h-8 px-2 pr-8 text-sm border rounded-md bg-white max-w-[220px]"
              >
                <option value="all">All Departments ({visibleEmployees.length})</option>
                {departments.map(d => {
                  const n = visibleEmployees.filter(e => e.department === d.id).length;
                  return (
                    <option key={d.id} value={d.id}>{d.name} ({n})</option>
                  );
                })}
              </select>
              {departmentFilter !== 'all' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setDepartmentFilter('all')}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Khmer Name</TableHead>
                <TableHead>Gender</TableHead>
                <TableHead>Date of Birth</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Experience</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>NFF No</TableHead>
                <TableHead>TID</TableHead>
                <TableHead>Contract Expire</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Author</TableHead>
                <TableHead>Modifier</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employeePagination.paginatedItems.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell className="font-medium">{employee.id}</TableCell>
                  {/* Profile + Name is a duplicate trigger for the details
                      sheet: clicking the avatar or the name opens the same
                      Sheet as the View Details button. cursor-pointer +
                      hover:bg cues that the cell is clickable;
                      role/tabIndex/onKeyDown keep it keyboard-reachable. */}
                  <TableCell
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer hover:bg-blue-50/60 transition-colors"
                    onClick={() => {
                      setSelectedEmployee(employee);
                      setSheetOpen(true);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedEmployee(employee);
                        setSheetOpen(true);
                      }
                    }}
                  >
                    <EmployeeCell employee={employee} nameOnly />
                  </TableCell>
                  <TableCell className="text-sm">{employee.khmerName || '-'}</TableCell>
                  <TableCell className="capitalize">{employee.gender || '-'}</TableCell>
                  <TableCell>
                    {employee.dateOfBirth ? formatDate(employee.dateOfBirth) : '-'}
                  </TableCell>
                  <TableCell className="min-w-[180px]">
                    {canUpdateEmp ? (
                      <SearchablePicker
                        options={(() => {
                          const filtered = positions
                            .filter(p => !employee.department
                              || employee.department === '-'
                              || !p.departmentId
                              || p.departmentId === employee.department)
                            .map(p => ({
                              value: p.name,
                              label: p.name,
                              secondary: p.departmentId ? deptName(p.departmentId) : undefined,
                            }));
                          // If the row's current position isn't in the
                          // filtered list (deleted, or in a different dept),
                          // prepend it as a synthetic option so the trigger
                          // still shows the real value instead of "None".
                          if (employee.position && !filtered.some(o => o.value === employee.position)) {
                            filtered.unshift({ value: employee.position, label: employee.position });
                          }
                          return filtered;
                        })()}
                        value={employee.position}
                        onChange={v => {
                          if (v === employee.position) return;
                          void handleQuickFieldUpdate(employee, { position: v });
                        }}
                        placeholder="Set position…"
                        searchPlaceholder="Search position…"
                        allowClear={false}
                      />
                    ) : (
                      employee.position
                    )}
                  </TableCell>
                  <TableCell className="min-w-[180px]">
                    {canUpdateEmp ? (
                      <SearchablePicker
                        options={(USE_MOCKS
                          ? departments.map(d => ({ value: d.name, label: d.name }))
                          : departments.map(d => ({ value: d.id, label: d.name })))}
                        value={employee.department === '-' ? '' : employee.department ?? ''}
                        onChange={v => {
                          const next = v || null;
                          const current = employee.department === '-' ? null : (employee.department ?? null);
                          if (next === current) return;
                          void handleQuickFieldUpdate(employee, { department: v || '-' });
                        }}
                        placeholder="Set department…"
                        searchPlaceholder="Search department…"
                        allowClear
                      />
                    ) : (
                      deptName(employee.department)
                    )}
                  </TableCell>
                  <TableCell>{calculateExperience(employee.joinDate)}</TableCell>
                  <TableCell>{employee.contactNumber}</TableCell>
                  <TableCell>{employee.nffNo || '-'}</TableCell>
                  <TableCell>{employee.tid || '-'}</TableCell>
                  <TableCell>
                    {(() => {
                      const expire = getLatestContractEnd(employee);
                      if (!expire) return '-';
                      const cls = new Date(expire) < new Date()
                        ? 'text-red-600 font-medium'
                        : new Date(expire) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
                        ? 'text-orange-600 font-medium'
                        : '';
                      return <span className={cls}>{formatDate(expire)}</span>;
                    })()}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        employee.status === 'active'
                          ? 'bg-green-100 text-green-800 hover:bg-green-100 border-0 capitalize'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-100 border-0 capitalize'
                      }
                    >
                      {employee.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <AuditCell
                      name={(employee as any).createdByName}
                      at={(employee as any).createdAt}
                    />
                  </TableCell>
                  <TableCell>
                    <AuditCell
                      name={(employee as any).updatedByName}
                      at={(employee as any).updatedAt}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => {
                        setSelectedEmployee(employee);
                        setSheetOpen(true);
                      }}
                    >
                      View Details
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            currentPage={employeePagination.currentPage}
            totalPages={employeePagination.totalPages}
            onPageChange={employeePagination.goToPage}
            startIndex={employeePagination.startIndex}
            endIndex={employeePagination.endIndex}
            totalItems={employeePagination.totalItems}
          />
        </CardContent>
      </Card>

        </TabsContent>

        <TabsContent value="documents" className="mt-0">
          <AllDocumentsTab />
        </TabsContent>
      </Tabs>

      <Sheet open={sheetOpen} onOpenChange={(open) => {
        if (!open && isEditing && editedEmployee && hasUnsavedChanges(selectedEmployee, editedEmployee)) {
          if (!confirm('You have unsaved changes. Discard them?')) return;
        }
        setSheetOpen(open);
        if (!open) {
          setIsEditing(false);
          setEditedEmployee(null);
        }
      }}>
        <SheetContent className="w-full sm:max-w-3xl flex flex-col p-0 gap-0">
          <SheetHeader className="px-6 py-4 border-b shrink-0">
            <SheetTitle>Employee Details</SheetTitle>
            <SheetDescription>
              Complete information and contract history
            </SheetDescription>
          </SheetHeader>

          {selectedEmployee && (
            <>
              {/* Identity strip */}
              <div className="px-6 py-4 border-b shrink-0 flex items-center gap-4">
                <div className="relative shrink-0">
                  <Avatar className="h-16 w-16 rounded-lg border border-gray-200">
                    <AvatarImage
                      src={avatarSrc}
                      className="rounded-lg object-cover"
                    />
                    <AvatarFallback className="text-lg bg-blue-100 text-blue-600 rounded-lg">
                      {((isEditing ? editedEmployee : selectedEmployee)?.name || '').charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  {isEditing && (
                    <>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleProfileImageUpload(f);
                          e.target.value = '';
                        }}
                        className="hidden"
                        id="avatar-upload-input"
                        disabled={uploadingAvatar}
                      />
                      <label htmlFor="avatar-upload-input">
                        <Button
                          size="sm"
                          variant="outline"
                          asChild
                          className="absolute -bottom-1.5 -right-1.5 h-6 w-6 p-0 rounded-full shadow-sm cursor-pointer"
                          title={uploadingAvatar ? 'Uploading…' : 'Upload avatar'}
                        >
                          <span>
                            <Upload className="h-3 w-3" />
                          </span>
                        </Button>
                      </label>
                    </>
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  {isEditing && editedEmployee ? (
                    <Input
                      value={editedEmployee.name}
                      onChange={(e) => setEditedEmployee({ ...editedEmployee, name: e.target.value })}
                      className="text-base h-9 font-semibold"
                      placeholder="Full Name *"
                    />
                  ) : (
                    <h2 className="text-lg font-bold truncate">{selectedEmployee.name}</h2>
                  )}
                  {isEditing && editedEmployee ? (
                    <Input
                      value={editedEmployee.khmerName || ''}
                      onChange={(e) => setEditedEmployee({ ...editedEmployee, khmerName: e.target.value })}
                      className="text-sm h-8"
                      placeholder="Khmer Name"
                    />
                  ) : (
                    selectedEmployee.khmerName && (
                      <p className="text-sm text-gray-600 truncate">{selectedEmployee.khmerName}</p>
                    )
                  )}
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="text-gray-500 font-medium">{selectedEmployee.id}</span>
                    <Badge
                      className={
                        selectedEmployee.status === 'active'
                          ? 'bg-green-100 text-green-800 hover:bg-green-100 border-0 capitalize'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-100 border-0 capitalize'
                      }
                    >
                      {selectedEmployee.status}
                    </Badge>
                    <span className="inline-flex items-center gap-1 text-gray-600">
                      <Briefcase className="h-3 w-3" />
                      {selectedEmployee.position}
                    </span>
                    <span className="inline-flex items-center gap-1 text-gray-600">
                      <Building2 className="h-3 w-3" />
                      {deptName(selectedEmployee.department)}
                    </span>
                    {/* V70 — quick-glance Level chip so HR doesn't have
                        to open the Employment tab to see the Cambodian
                        Labour Law classification. Hidden when unset. */}
                    {selectedEmployee.level && (
                      <span className="inline-flex items-center gap-1 text-gray-600" title="Cambodian Labour Law level — drives the probation cap">
                        <GraduationCap className="h-3 w-3" />
                        {selectedEmployee.level === 'office'      ? 'Office Personnel' :
                         selectedEmployee.level === 'specialized' ? 'Specialized' :
                         selectedEmployee.level === 'ns_cook'     ? 'NS · Cook' :
                         selectedEmployee.level === 'ns_labour'   ? 'NS · Labour' :
                         selectedEmployee.level}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <Tabs defaultValue="profile" className="flex-1 flex flex-col min-h-0">
                <TabsList className="mx-6 mt-3 shrink-0 grid grid-cols-4">
                  <TabsTrigger value="profile">
                    <User className="h-3.5 w-3.5 mr-1.5" />
                    Profile
                  </TabsTrigger>
                  <TabsTrigger value="employment">
                    <Briefcase className="h-3.5 w-3.5 mr-1.5" />
                    Employment
                  </TabsTrigger>
                  <TabsTrigger value="contracts">
                    <FileText className="h-3.5 w-3.5 mr-1.5" />
                    Contracts
                    <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">
                      {getEmployeeContracts(selectedEmployee).length}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="documents">
                    <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
                    Documents
                    <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">
                      {(selectedEmployee.documents ?? []).length}
                    </Badge>
                  </TabsTrigger>
                </TabsList>

                <div className="flex-1 overflow-y-auto px-6 py-5">
                  {/* Profile Tab */}
                  <TabsContent value="profile" className="mt-0 space-y-6">
                    <SectionHeading>Personal</SectionHeading>
                    <div className="grid grid-cols-2 gap-4">
                      <FieldRow label="Gender" isEditing={isEditing}>
                        {isEditing && editedEmployee ? (
                          <select
                            value={editedEmployee.gender || ''}
                            onChange={(e) => setEditedEmployee({ ...editedEmployee, gender: e.target.value as 'male' | 'female' })}
                            className="w-full px-3 py-2 border rounded-md text-sm h-9"
                          >
                            <option value="">Select</option>
                            <option value="male">Male</option>
                            <option value="female">Female</option>
                          </select>
                        ) : (
                          <p className="capitalize">{selectedEmployee.gender || '—'}</p>
                        )}
                      </FieldRow>
                      {/* Marital status drives the Cambodia TOS dependents
                          deduction. When Married, surface the children
                          count input; when Single (or unset), hide it and
                          force the count to 0 so the dependent count never
                          accidentally inflates. */}
                      <FieldRow label="Marital Status" isEditing={isEditing}>
                        {isEditing && editedEmployee ? (
                          <select
                            value={editedEmployee.maritalStatus || ''}
                            onChange={(e) => {
                              const v = e.target.value as '' | 'single' | 'married' | 'divorced' | 'widowed';
                              // Only 'single' wipes the children count —
                              // divorced / widowed single parents commonly
                              // retain custody and still claim them in TOS,
                              // so we keep the count when flipping to those.
                              setEditedEmployee({
                                ...editedEmployee,
                                maritalStatus: v === '' ? undefined : v,
                                numberOfChildren: v === 'single' ? 0 : (editedEmployee.numberOfChildren ?? 0),
                              });
                            }}
                            className="w-full px-3 py-2 border rounded-md text-sm h-9"
                          >
                            <option value="">Select</option>
                            <option value="single">Single</option>
                            <option value="married">Married</option>
                            <option value="divorced">Divorced</option>
                            <option value="widowed">Widowed</option>
                          </select>
                        ) : (
                          <p className="capitalize">{selectedEmployee.maritalStatus || '—'}</p>
                        )}
                      </FieldRow>
                      {/* Number of Children is visible for any non-Single
                          (or unset) status. Single = no kids deduction
                          path; the other three (married / divorced /
                          widowed) can all have children claimed under
                          Cambodian TOS. */}
                      {(() => {
                        const ms = isEditing
                          ? editedEmployee?.maritalStatus
                          : selectedEmployee.maritalStatus;
                        return ms && ms !== 'single';
                      })() && (
                        <FieldRow label="Number of Children" isEditing={isEditing}>
                          {isEditing && editedEmployee ? (
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              value={editedEmployee.numberOfChildren ?? 0}
                              onChange={(e) => setEditedEmployee({
                                ...editedEmployee,
                                numberOfChildren: Math.max(0, Number(e.target.value) || 0),
                              })}
                              className="h-9"
                            />
                          ) : (
                            <p>{selectedEmployee.numberOfChildren ?? 0}</p>
                          )}
                        </FieldRow>
                      )}
                      {/* Decouple — V53. Flipped to Yes on the spouse who
                          claims the family dependents (housewife spouse +
                          children) on their own TOS. The other working
                          spouse stays at No so the same dependents aren't
                          double-counted across two payslips. */}
                      <FieldRow label="Claim Dependents (TOS)" isEditing={isEditing}>
                        {isEditing && editedEmployee ? (
                          <select
                            value={editedEmployee.decouple ? 'yes' : 'no'}
                            onChange={(e) => {
                              const yes = e.target.value === 'yes';
                              setEditedEmployee({
                                ...editedEmployee,
                                decouple: yes,
                                // Flipping back to No clears the spouse
                                // sub-flag so we don't keep stale state.
                                claimSpouse: yes ? (editedEmployee.claimSpouse ?? false) : false,
                              });
                            }}
                            className="w-full px-3 py-2 border rounded-md text-sm h-9"
                            title="Yes → this employee subtracts spouse + children allowances from their TOS base. No → no dependents are claimed on this payslip (the other spouse claims, or there are none)."
                          >
                            <option value="no">No</option>
                            <option value="yes">Yes</option>
                          </select>
                        ) : (
                          <p>{selectedEmployee.decouple ? 'Yes' : 'No'}</p>
                        )}
                      </FieldRow>
                      {/* Claim Spouse — V55. Nested under "Claim Dependents",
                          only visible when Decouple = Yes. Independent of
                          marital status: a widowed / divorced parent with
                          custody flips this to No and still claims their
                          children. A married housewife scenario flips it
                          to Yes. */}
                      {(isEditing
                        ? editedEmployee?.decouple
                        : selectedEmployee.decouple) && (
                        <FieldRow label="↳ Claim Spouse" isEditing={isEditing}>
                          {isEditing && editedEmployee ? (
                            <select
                              value={editedEmployee.claimSpouse ? 'yes' : 'no'}
                              onChange={(e) => setEditedEmployee({
                                ...editedEmployee,
                                claimSpouse: e.target.value === 'yes',
                              })}
                              className="w-full px-3 py-2 border rounded-md text-sm h-9"
                              title="Yes → adds 1 dependent (150,000 KHR) for the housewife spouse allowance. No → no spouse line (typical for widowed / divorced / single-parent rows, or dual-earner couples where neither claims a housewife spouse)."
                            >
                              <option value="no">No</option>
                              <option value="yes">Yes</option>
                            </select>
                          ) : (
                            <p>{selectedEmployee.claimSpouse ? 'Yes' : 'No'}</p>
                          )}
                        </FieldRow>
                      )}
                      <FieldRow label="Date of Birth" isEditing={isEditing}>
                        {isEditing && editedEmployee ? (
                          <Input
                            type="date"
                            value={editedEmployee.dateOfBirth || ''}
                            onChange={(e) => setEditedEmployee({ ...editedEmployee, dateOfBirth: e.target.value })}
                            className="h-9"
                          />
                        ) : (
                          <p>{selectedEmployee.dateOfBirth ? formatDate(selectedEmployee.dateOfBirth) : '—'}</p>
                        )}
                      </FieldRow>
                      <FieldRow label="Place of Birth" isEditing={isEditing} full>
                        {isEditing && editedEmployee ? (
                          <Input
                            value={editedEmployee.placeOfBirth || ''}
                            onChange={(e) => setEditedEmployee({ ...editedEmployee, placeOfBirth: e.target.value })}
                            className="h-9"
                          />
                        ) : (
                          <p>{selectedEmployee.placeOfBirth || '—'}</p>
                        )}
                      </FieldRow>
                      <FieldRow label="NFF No" isEditing={isEditing}>
                        {isEditing && editedEmployee ? (
                          <Input
                            value={editedEmployee.nffNo || ''}
                            onChange={(e) => setEditedEmployee({ ...editedEmployee, nffNo: e.target.value })}
                            className="h-9"
                          />
                        ) : (
                          <p>{selectedEmployee.nffNo || '—'}</p>
                        )}
                      </FieldRow>
                      <FieldRow label="TID" isEditing={isEditing}>
                        {isEditing && editedEmployee ? (
                          <Input
                            value={editedEmployee.tid || ''}
                            onChange={(e) => setEditedEmployee({ ...editedEmployee, tid: e.target.value })}
                            className="h-9"
                          />
                        ) : (
                          <p>{selectedEmployee.tid || '—'}</p>
                        )}
                      </FieldRow>
                    </div>

                    <SectionHeading>Contact</SectionHeading>
                    <div className="space-y-4">
                      <FieldRow label="Email" required={isEditing} isEditing={isEditing} icon={<Mail className="h-3.5 w-3.5" />}>
                        {isEditing && editedEmployee ? (
                          <Input
                            type="email"
                            value={editedEmployee.email}
                            onChange={(e) => setEditedEmployee({ ...editedEmployee, email: e.target.value })}
                            className="h-9"
                          />
                        ) : (
                          <p className="break-all">{selectedEmployee.email}</p>
                        )}
                      </FieldRow>
                      <FieldRow label="Contact Number" isEditing={isEditing} icon={<Phone className="h-3.5 w-3.5" />}>
                        {isEditing && editedEmployee ? (
                          <Input
                            value={editedEmployee.contactNumber}
                            onChange={(e) => setEditedEmployee({ ...editedEmployee, contactNumber: e.target.value })}
                            className="h-9"
                          />
                        ) : (
                          <p>{selectedEmployee.contactNumber}</p>
                        )}
                      </FieldRow>
                      <FieldRow label="Current Address" isEditing={isEditing} icon={<MapPin className="h-3.5 w-3.5" />}>
                        {isEditing && editedEmployee ? (
                          <Input
                            value={editedEmployee.currentAddress || ''}
                            onChange={(e) => setEditedEmployee({ ...editedEmployee, currentAddress: e.target.value })}
                            className="h-9"
                          />
                        ) : (
                          <p>{selectedEmployee.currentAddress || '—'}</p>
                        )}
                      </FieldRow>
                    </div>
                  </TabsContent>

                  {/* Employment Tab */}
                  <TabsContent value="employment" className="mt-0 space-y-6">
                    <SectionHeading>Position</SectionHeading>
                    <div className="grid grid-cols-2 gap-4">
                      <FieldRow label="Position" required={isEditing} isEditing={isEditing}>
                        {isEditing && editedEmployee ? (
                          <SearchablePicker
                            options={positions
                              // Show positions in the chosen department first; cross-dept
                              // positions (no departmentId) always pass through.
                              .filter(p => !editedEmployee.department
                                || !p.departmentId
                                || p.departmentId === editedEmployee.department)
                              .map(p => ({
                                value: p.name,
                                label: p.name,
                                secondary: p.departmentId ? deptName(p.departmentId) : undefined,
                              }))}
                            value={editedEmployee.position}
                            onChange={v => setEditedEmployee({ ...editedEmployee, position: v })}
                            placeholder="Select position…"
                            searchPlaceholder="Search position…"
                            emptyOptionsHint={
                              <>No positions defined yet — add some in <span className="font-medium">Settings → Employee Settings → Positions</span>.</>
                            }
                            allowClear={false}
                          />
                        ) : (
                          <p>{selectedEmployee.position}</p>
                        )}
                      </FieldRow>
                      <FieldRow label="Department" required={isEditing} isEditing={isEditing}>
                        {isEditing && editedEmployee ? (
                          <SearchablePicker
                            options={(USE_MOCKS
                              ? departments.map(d => ({ value: d.name, label: d.name }))
                              : departments.map(d => ({ value: d.id, label: d.name })))}
                            value={editedEmployee.department}
                            onChange={v => {
                              // When the department/team is changed, auto-suggest its
                              // PIC (managerId) as the employee's "Reports To". Only
                              // overwrites the existing managerId if the picked dept
                              // actually has a PIC AND the user hasn't manually set
                              // a different reports-to that doesn't match the old
                              // dept's PIC. This is the same convention HR uses
                              // verbally — "you report to your dept lead unless told
                              // otherwise."
                              const pickedDept = departments.find(d =>
                                (USE_MOCKS ? d.name === v : d.id === v),
                              );
                              const pickedPic = pickedDept?.managerId ?? '';
                              const oldDept = departments.find(d =>
                                (USE_MOCKS ? d.name === editedEmployee.department : d.id === editedEmployee.department),
                              );
                              const oldPic = oldDept?.managerId ?? '';
                              const currentReports = editedEmployee.managerId ?? '';
                              const reportsFollowsDeptPic =
                                !currentReports || currentReports === oldPic;
                              setEditedEmployee({
                                ...editedEmployee,
                                department: v,
                                ...(reportsFollowsDeptPic ? { managerId: pickedPic || undefined } : {}),
                              });
                            }}
                            placeholder="Select department…"
                            searchPlaceholder="Search department…"
                            allowClear={false}
                          />
                        ) : (
                          <p>{deptName(selectedEmployee.department)}</p>
                        )}
                      </FieldRow>
                      <FieldRow label="Reports To" isEditing={isEditing}>
                        {isEditing && editedEmployee ? (
                          <SearchablePicker
                            options={employees
                              .filter(e => e.id !== editedEmployee.id && e.status === 'active')
                              .map(emp => ({
                                // Value carries whatever the backend stores on managerId
                                // (UUID in live mode, empNo in mock mode).
                                value: emp.apiId ?? emp.id,
                                label: emp.name,
                                secondary: emp.position,
                                searchKey: `${emp.name} ${emp.id} ${emp.position ?? ''}`,
                              }))}
                            value={editedEmployee.managerId || ''}
                            onChange={v => setEditedEmployee({ ...editedEmployee, managerId: v })}
                            placeholder="Select manager…"
                            emptyLabel="No manager"
                            searchPlaceholder="Search by name, ID, position…"
                          />
                        ) : (
                          <p>
                            {selectedEmployee.managerId
                              ? employees.find(e => (e.apiId ?? e.id) === selectedEmployee.managerId)?.name || '—'
                              : 'No manager'}
                          </p>
                        )}
                      </FieldRow>
                      {/* V70 — Cambodian Labour Law skill level. Drives the
                          probation-max default on the Add Contract dialog.
                          Probation breakdown lives in the label tooltip so
                          the dropdown stays compact. */}
                      <FieldRow
                        label={
                          <TooltipProvider delayDuration={150}>
                            <span className="inline-flex items-center gap-1">
                              Level (Labour Law)
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className="inline-flex h-4 w-4 items-center justify-center rounded-full text-blue-600 hover:bg-blue-50"
                                    aria-label="Probation caps by level"
                                  >
                                    <Info className="h-3.5 w-3.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-xs text-left text-xs leading-relaxed">
                                  <p className="font-semibold mb-1">Probation maximum (Cambodian Labour Law)</p>
                                  <ul className="space-y-0.5">
                                    <li>• <strong>Office Personnel</strong>: 3 months</li>
                                    <li>• <strong>Specialized</strong>: 3 months</li>
                                    <li>• <strong>Non-Specialized · Cook</strong>: 1 month</li>
                                    <li>• <strong>Non-Specialized · Labour</strong>: 2 months</li>
                                  </ul>
                                  <p className="mt-1.5 opacity-80">The Add Contract dialog reads this to pre-fill the probation end date.</p>
                                </TooltipContent>
                              </Tooltip>
                            </span>
                          </TooltipProvider>
                        }
                        isEditing={isEditing}
                      >
                        {isEditing && editedEmployee ? (
                          <select
                            className="h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm"
                            value={editedEmployee.level ?? ''}
                            onChange={e => setEditedEmployee({
                              ...editedEmployee,
                              level: (e.target.value || undefined) as Employee['level'],
                            })}
                          >
                            <option value="">— not set —</option>
                            <option value="office">Office Personnel</option>
                            <option value="specialized">Specialized</option>
                            <option value="ns_cook">Non-Specialized · Cook</option>
                            <option value="ns_labour">Non-Specialized · Labour</option>
                          </select>
                        ) : (
                          <p>
                            {selectedEmployee.level === 'office'      ? 'Office Personnel' :
                             selectedEmployee.level === 'specialized' ? 'Specialized' :
                             selectedEmployee.level === 'ns_cook'     ? 'Non-Specialized · Cook' :
                             selectedEmployee.level === 'ns_labour'   ? 'Non-Specialized · Labour' :
                             <span className="text-gray-400">— not set —</span>}
                          </p>
                        )}
                      </FieldRow>
                    </div>

                    <SectionHeading>Tenure & Compensation</SectionHeading>
                    <div className="grid grid-cols-2 gap-4">
                      <FieldRow label="Join Date" isEditing={isEditing}>
                        {isEditing && editedEmployee ? (
                          <Input
                            type="date"
                            value={editedEmployee.joinDate}
                            onChange={(e) => setEditedEmployee({ ...editedEmployee, joinDate: e.target.value })}
                            className="h-9"
                          />
                        ) : (
                          <p>{formatDate(selectedEmployee.joinDate)}</p>
                        )}
                      </FieldRow>
                      <FieldRow label="Experience" isEditing={false}>
                        <p>{calculateExperience(selectedEmployee.joinDate)}</p>
                      </FieldRow>
                      <FieldRow label="Basic Salary ($)" required={isEditing} isEditing={isEditing}>
                        {isEditing && editedEmployee ? (
                          <Input
                            type="number"
                            value={editedEmployee.baseSalary}
                            onChange={(e) => setEditedEmployee({ ...editedEmployee, baseSalary: parseFloat(e.target.value) })}
                            className="h-9"
                          />
                        ) : (
                          <p>${selectedEmployee.baseSalary.toLocaleString()}</p>
                        )}
                      </FieldRow>
                      <FieldRow label="Position Allowance ($)" isEditing={isEditing}>
                        {isEditing && editedEmployee ? (
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={editedEmployee.positionAllowance ?? 0}
                            onChange={(e) => setEditedEmployee({ ...editedEmployee, positionAllowance: parseFloat(e.target.value) || 0 })}
                            className="h-9"
                            placeholder="0.00"
                          />
                        ) : (
                          <p>${(selectedEmployee.positionAllowance ?? 0).toLocaleString()}</p>
                        )}
                      </FieldRow>
                      <FieldRow label="Evaluation Allowance ($)" isEditing={isEditing}>
                        {isEditing && editedEmployee ? (
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={editedEmployee.evaluationAllowance ?? 0}
                            onChange={(e) => setEditedEmployee({ ...editedEmployee, evaluationAllowance: parseFloat(e.target.value) || 0 })}
                            className="h-9"
                            placeholder="0.00"
                          />
                        ) : (
                          <p>${(selectedEmployee.evaluationAllowance ?? 0).toLocaleString()}</p>
                        )}
                      </FieldRow>
                      <FieldRow label="Status" isEditing={isEditing}>
                        {isEditing && editedEmployee ? (
                          <select
                            value={editedEmployee.status}
                            onChange={(e) => setEditedEmployee({ ...editedEmployee, status: e.target.value as 'active' | 'inactive' })}
                            className="w-full px-3 py-2 border rounded-md text-sm h-9"
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        ) : (
                          <Badge
                            className={
                              selectedEmployee.status === 'active'
                                ? 'bg-green-100 text-green-800 hover:bg-green-100 border-0 capitalize'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-100 border-0 capitalize'
                            }
                          >
                            {selectedEmployee.status}
                          </Badge>
                        )}
                      </FieldRow>
                      <FieldRow label="Contract Expire" isEditing={isEditing}>
                        {isEditing && editedEmployee ? (
                          <Input
                            type="date"
                            value={editedEmployee.contractExpireDate || ''}
                            onChange={(e) => setEditedEmployee({ ...editedEmployee, contractExpireDate: e.target.value })}
                            className="h-9"
                          />
                        ) : (() => {
                          const expire = getLatestContractEnd(selectedEmployee);
                          return <p>{expire ? formatDate(expire) : '—'}</p>;
                        })()}
                      </FieldRow>
                      <FieldRow label="Resign Date" isEditing={isEditing}>
                        {isEditing && editedEmployee ? (
                          <Input
                            type="date"
                            value={editedEmployee.resignDate || ''}
                            onChange={(e) => setEditedEmployee({ ...editedEmployee, resignDate: e.target.value })}
                            className="h-9"
                          />
                        ) : (
                          <p className={selectedEmployee.resignDate ? 'text-red-600 font-medium' : ''}>
                            {selectedEmployee.resignDate
                              ? formatDate(selectedEmployee.resignDate)
                              : '—'}
                          </p>
                        )}
                      </FieldRow>
                      <FieldRow label="Count in Attendance" isEditing={isEditing}>
                        {isEditing && editedEmployee ? (
                          <select
                            value={editedEmployee.attendanceYn === false ? 'no' : 'yes'}
                            onChange={(e) =>
                              setEditedEmployee({ ...editedEmployee, attendanceYn: e.target.value === 'yes' })
                            }
                            className="w-full px-3 py-2 border rounded-md text-sm h-9"
                          >
                            <option value="yes">Yes — counted normally</option>
                            <option value="no">No — Exception (field / remote, not counted)</option>
                          </select>
                        ) : selectedEmployee.attendanceYn === false ? (
                          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-0">
                            Exception · not counted
                          </Badge>
                        ) : (
                          <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-0">
                            Yes
                          </Badge>
                        )}
                      </FieldRow>
                    </div>

                    <SectionHeading>Banking</SectionHeading>
                    <div className="grid grid-cols-2 gap-4">
                      <FieldRow label="Bank Name" isEditing={isEditing}>
                        {isEditing && editedEmployee ? (
                          <select
                            value={editedEmployee.bankName || ''}
                            onChange={(e) => setEditedEmployee({ ...editedEmployee, bankName: e.target.value })}
                            className="w-full px-3 py-2 border rounded-md text-sm h-9"
                          >
                            <option value="">Select bank…</option>
                            {['ABA', 'ACLEDA', 'Canadia', 'Chip Mong', 'Maybank', 'PPCB', 'Prince', 'SKB', 'Other'].map(b => (
                              <option key={b} value={b}>{b}</option>
                            ))}
                          </select>
                        ) : (
                          <p>{selectedEmployee.bankName || '—'}</p>
                        )}
                      </FieldRow>
                      <FieldRow label="Account Number" isEditing={isEditing}>
                        {isEditing && editedEmployee ? (
                          <Input
                            value={editedEmployee.bankAccount || ''}
                            onChange={(e) => setEditedEmployee({ ...editedEmployee, bankAccount: e.target.value })}
                            className="h-9"
                            placeholder="000-123-456"
                          />
                        ) : (
                          <p className="font-mono text-sm">{selectedEmployee.bankAccount || '—'}</p>
                        )}
                      </FieldRow>
                    </div>
                  </TabsContent>

                  {/* Contracts Tab */}
                  <TabsContent value="contracts" className="mt-0 space-y-4">
                    {(() => {
                      const contracts = getEmployeeContracts(selectedEmployee);
                      const activeContract = contracts.find(c => c.status === 'active' || c.status === 'expiring');
                      const nextExpiry = contracts
                        .filter(c => c.status !== 'expired')
                        .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime())[0];
                      return (
                        <>
                          <div className="flex items-center justify-between gap-3">
                            <SectionHeading>Contract History</SectionHeading>
                            {canCreateContract && (
                              <Button size="sm" onClick={handleAddContract} className="h-7 text-xs">
                                <Plus className="h-3 w-3 mr-1" />
                                {t('contract.add')}
                              </Button>
                            )}
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <div className="p-3 bg-gray-50 rounded-md">
                              <p className="text-xs text-gray-500">Total Contracts</p>
                              <p className="text-lg font-semibold">{contracts.length}</p>
                            </div>
                            <div className="p-3 bg-gray-50 rounded-md">
                              <p className="text-xs text-gray-500">Tenure</p>
                              <p className="text-lg font-semibold">{calculateExperience(selectedEmployee.joinDate)}</p>
                            </div>
                            <div className="p-3 bg-gray-50 rounded-md">
                              <p className="text-xs text-gray-500">Next Expiry</p>
                              <p className="text-lg font-semibold">
                                {nextExpiry ? formatDate(nextExpiry.endDate) : '—'}
                              </p>
                            </div>
                          </div>
                          <div className="border rounded-lg overflow-hidden">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-gray-50">
                                  <TableHead className="text-xs py-2">Type</TableHead>
                                  <TableHead className="text-xs py-2">Start</TableHead>
                                  <TableHead className="text-xs py-2">End</TableHead>
                                  <TableHead className="text-xs py-2">Salary</TableHead>
                                  <TableHead className="text-xs py-2">Status</TableHead>
                                  <TableHead className="text-xs py-2 text-right">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {contracts.length === 0 ? (
                                  <TableRow>
                                    <TableCell colSpan={6} className="text-center py-6 text-xs text-gray-400">
                                      {t('contract.empty')} {canCreateContract && t('contract.empty.hint')}
                                    </TableCell>
                                  </TableRow>
                                ) : contracts.map((contract) => (
                                  <TableRow key={contract.id} className={`text-xs ${contract.id === activeContract?.id ? 'bg-blue-50/50' : ''}`}>
                                    <TableCell className="py-2 font-medium">
                                      <Badge
                                        variant="outline"
                                        className={
                                          contract.contractType === 'UDC' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                          contract.contractType === 'FDC' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                                          contract.contractType === 'Probation' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                          contract.contractType === 'Internship' ? 'bg-violet-50 text-violet-700 border-violet-200' :
                                          'bg-slate-50 text-slate-700 border-slate-200'
                                        }
                                      >
                                        {contract.contractType}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="py-2">{formatDate(contract.startDate)}</TableCell>
                                    <TableCell className="py-2">{formatDate(contract.endDate)}</TableCell>
                                    <TableCell className="py-2">${contract.salary?.toLocaleString() || '-'}</TableCell>
                                    <TableCell className="py-2">{getContractStatusBadge(contract.status)}</TableCell>
                                    <TableCell className="py-2 text-right">
                                      {(canUpdateContract || canCreateContract) && (
                                        <div className="flex justify-end gap-1.5">
                                          {canUpdateContract && (
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              className="h-6 text-xs px-2"
                                              onClick={() => handleEditContract(contract)}
                                            >
                                              <Edit className="h-3 w-3 mr-1" />
                                              Edit
                                            </Button>
                                          )}
                                          {canCreateContract && (contract.status === 'active' || contract.status === 'expiring') && (
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              className="h-6 text-xs px-2"
                                              onClick={() => handleRenewContract(contract)}
                                            >
                                              <RefreshCw className="h-3 w-3 mr-1" />
                                              Renew
                                            </Button>
                                          )}
                                        </div>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </>
                      );
                    })()}
                  </TabsContent>

                  {/* Documents Tab */}
                  <TabsContent value="documents" className="mt-0">
                    <EmployeeDocuments
                      employee={selectedEmployee}
                      onChange={(docs) => {
                        // TODO: wire EmployeeDocument upload/list/delete to the backend API.
                        if (USE_MOCKS) {
                          const idx = mockEmployees.findIndex(e => e.id === selectedEmployee.id);
                          if (idx >= 0) mockEmployees[idx] = { ...mockEmployees[idx], documents: docs };
                        }
                        setSelectedEmployee({ ...selectedEmployee, documents: docs });
                      }}
                    />
                  </TabsContent>
                </div>
              </Tabs>

              {/* Sticky action bar */}
              <SheetFooter className="px-6 py-3 border-t shrink-0 bg-white flex-row sm:justify-between sm:items-center gap-3">
                <div className="text-xs text-gray-500 flex-1 min-w-0">
                  {isEditing && editedEmployee && hasUnsavedChanges(selectedEmployee, editedEmployee) ? (
                    <span className="inline-flex items-center gap-1.5 text-amber-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                      Unsaved changes
                    </span>
                  ) : (
                    <span className="truncate">Last updated {formatDate(selectedEmployee.joinDate)}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  {!isEditing ? (
                    canUpdateEmp && (
                      <Button size="sm" onClick={handleEditEmployee}>
                        <Edit className="h-3 w-3 mr-2" />
                        Edit
                      </Button>
                    )
                  ) : (
                    <>
                      <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSaveEmployee}
                        disabled={!editedEmployee || !hasUnsavedChanges(selectedEmployee, editedEmployee)}
                      >
                        Save
                      </Button>
                    </>
                  )}
                </div>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Contract Add / Edit / Renew Dialog */}
      <Dialog open={contractDialogOpen} onOpenChange={setContractDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {contractMode === 'add' ? t('contract.add')
                : contractMode === 'edit' ? t('contract.edit')
                : t('contract.renew')}
            </DialogTitle>
            <DialogDescription>
              {contractMode === 'add' && `${t('contract.add.desc')} ${selectedEmployee?.name}.`}
              {contractMode === 'edit' && `${t('contract.edit.desc')} ${selectedEmployee?.name}.`}
              {contractMode === 'renew' && t('contract.renew.desc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {contractMode === 'renew' && selectedContract && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium mb-2">{t('contract.current')}</p>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-gray-600">{t('contract.type')}</p>
                    <p className="font-medium">{selectedContract.contractType}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">{t('contract.end_date')}</p>
                    <p className="font-medium">{formatDate(selectedContract.endDate)}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">{t('contract.salary.current')}</p>
                    <p className="font-medium">${selectedContract.salary?.toLocaleString() || '-'}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Duration presets — auto-fill end date relative to start. The
                user can still pick a custom end date manually below. */}
            <div className="space-y-2">
              <Label className="text-xs text-gray-600">{t('contract.duration')}</Label>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: t('contract.duration.3mo'), months: 3 },
                  { label: t('contract.duration.6mo'), months: 6 },
                  { label: t('contract.duration.1yr'), months: 12 },
                  { label: t('contract.duration.2yr'), months: 24 },
                ].map(p => (
                  <Button
                    key={p.months}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      if (!contractForm.startDate) {
                        notify.validate(t('contract.validate.start_required'));
                        return;
                      }
                      const start = new Date(contractForm.startDate);
                      // setMonth handles year roll-over and clamps day for
                      // shorter months (e.g. Jan 31 + 1 month → Feb 28/29).
                      const end = new Date(start);
                      end.setMonth(end.getMonth() + p.months);
                      // Subtract 1 day so a "1 Year" contract starting Apr 28
                      // ends Apr 27 next year, not Apr 28 — standard contract
                      // term convention.
                      end.setDate(end.getDate() - 1);
                      setContractForm({ ...contractForm, endDate: end.toISOString().slice(0, 10) });
                    }}
                  >
                    {p.label}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-gray-500"
                  onClick={() => setContractForm({ ...contractForm, endDate: '' })}
                  title="Clear end date and pick custom"
                >
                  {t('contract.duration.custom')}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contractStart">
                  {contractMode === 'renew' ? t('contract.start_date.new') : t('contract.start_date')} *
                </Label>
                <Input
                  id="contractStart"
                  type="date"
                  value={contractForm.startDate}
                  onChange={(e) => setContractForm({ ...contractForm, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contractEnd">
                  {contractMode === 'renew' ? t('contract.end_date.new') : t('contract.end_date')} *
                </Label>
                <Input
                  id="contractEnd"
                  type="date"
                  value={contractForm.endDate}
                  onChange={(e) => setContractForm({ ...contractForm, endDate: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contractType">{t('contract.contract_type')} *</Label>
                <select
                  id="contractType"
                  value={contractForm.contractType}
                  onChange={(e) => {
                    const next = e.target.value;
                    // V70 — when HR picks Probation, snap End Date to the
                    // legal probation cap for the employee's level
                    // (Office/Specialized = 3, NS Cook = 1, NS Labour = 2).
                    // HR can still adjust afterwards; this just provides
                    // a sensible default so the field isn't left blank.
                    if (next === 'Probation' && contractForm.startDate) {
                      const months = probationMonthsForLevel(selectedEmployee?.level);
                      setContractForm({
                        ...contractForm,
                        contractType: next,
                        endDate: addMonths(contractForm.startDate, months),
                      });
                    } else {
                      setContractForm({ ...contractForm, contractType: next });
                    }
                  }}
                  className="w-full px-3 py-2 border rounded-md text-sm h-9"
                >
                  <option value="UDC">{t('contract.type.udc')}</option>
                  <option value="FDC">{t('contract.type.fdc')}</option>
                  <option value="Probation">{t('contract.type.probation')}</option>
                  <option value="Internship">{t('contract.type.internship')}</option>
                </select>
                <p className="text-[11px] text-gray-500">
                  {t('contract.type.helper')}
                  {contractForm.contractType === 'Probation' && selectedEmployee?.level && (
                    <span className="block mt-1 text-amber-700">
                      {t('contract.probation.cap_prefix')} <strong>{selectedEmployee.level}</strong>: {probationMonthsForLevel(selectedEmployee.level)} {t('contract.probation.cap_suffix')}
                    </span>
                  )}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="contractSalary">{t('contract.salary')}</Label>
                <Input
                  id="contractSalary"
                  type="number"
                  min={0}
                  step={0.01}
                  value={contractForm.salary}
                  onChange={(e) => setContractForm({ ...contractForm, salary: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            {/* Termination reason — only relevant once a contract has
                actually ended. Leave blank for new contracts; HR fills
                this in when editing an expired row. 'Misconduct'
                forfeits the FDC 5% severance per Cambodian Labour Law. */}
            <div className="space-y-2">
              <Label htmlFor="terminationReason">{t('contract.termination_reason')}</Label>
              <select
                id="terminationReason"
                value={contractForm.terminationReason}
                onChange={(e) => setContractForm({ ...contractForm, terminationReason: e.target.value })}
                className="w-full px-3 py-2 border rounded-md text-sm h-9"
              >
                <option value="">{t('contract.term.still_active')}</option>
                <option value="natural">{t('contract.term.natural')}</option>
                <option value="misconduct">{t('contract.term.misconduct')}</option>
                <option value="mutual">{t('contract.term.mutual')}</option>
                <option value="resignation">{t('contract.term.resignation')}</option>
                <option value="other">{t('contract.term.other')}</option>
              </select>
              {contractForm.terminationReason === 'misconduct' && contractForm.contractType === 'FDC' && (
                <p className="text-[11px] text-amber-700">
                  {t('contract.term.misconduct.warn')}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="contractNotes">{t('contract.notes')}</Label>
              <textarea
                id="contractNotes"
                rows={3}
                value={contractForm.notes}
                onChange={(e) => setContractForm({ ...contractForm, notes: e.target.value })}
                className="w-full px-3 py-2 border rounded-md text-sm"
                placeholder={
                  contractMode === 'renew' ? t('contract.notes.placeholder.renew')
                    : t('contract.notes.placeholder')
                }
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setContractDialogOpen(false)} disabled={savingContract}>
                {t('action.cancel')}
              </Button>
              <Button onClick={handleSaveContract} disabled={savingContract}>
                {contractMode === 'renew' && <RefreshCw className="mr-2 h-4 w-4" />}
                {contractMode === 'add' && <Plus className="mr-2 h-4 w-4" />}
                {contractMode === 'edit' && <Edit className="mr-2 h-4 w-4" />}
                {savingContract ? t('contract.btn.saving')
                  : contractMode === 'add' ? t('contract.btn.create')
                  : contractMode === 'edit' ? t('contract.btn.save')
                  : t('contract.renew')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
