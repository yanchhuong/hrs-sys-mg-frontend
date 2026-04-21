import { useState, useEffect } from 'react';
import { mockEmployees, mockContracts } from '../../data/mockData';
import { Contract, Employee } from '../../types/hrms';
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
import { Search, Plus, Mail, Phone, MapPin, Calendar, User, FileText, Upload, RefreshCw, Building2, Briefcase, DollarSign, CalendarCheck, Edit, ChevronDown, UserPlus, FileSpreadsheet, Download, Trash2 } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { AddEmployeeDialog } from '../common/AddEmployeeDialog';
import { BulkUploadEmployeesDialog } from '../common/BulkUploadEmployeesDialog';
import { format, isWithinInterval, parseISO, differenceInMonths, differenceInYears } from 'date-fns';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { EmployeeCell } from '../common/EmployeeCell';

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pb-2 border-b">
      <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{children}</h3>
    </div>
  );
}

function FieldRow({
  label, children, isEditing, required, full, icon,
}: {
  label: string;
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
  onChange: (docs: import('../../types/hrms').EmployeeDocument[]) => void;
}) {
  const [uploadType, setUploadType] = useState<import('../../types/hrms').EmployeeDocumentType>('contract');
  const [filter, setFilter] = useState<string>('all');

  const docs = employee.documents ?? [];
  const visible = filter === 'all' ? docs : docs.filter(d => d.type === filter);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next: import('../../types/hrms').EmployeeDocument[] = [...docs];
    let rejected = 0;
    Array.from(files).forEach(f => {
      if (f.size > DOC_LIMIT_MB * 1024 * 1024) {
        rejected++;
        return;
      }
      next.push({
        id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        employeeId: employee.id,
        name: f.name,
        type: uploadType,
        mimeType: f.type || 'application/octet-stream',
        sizeBytes: f.size,
        uploadedAt: new Date().toISOString(),
        uploadedBy: 'you',
      });
    });
    onChange(next);
    if (rejected > 0) toast.error(`${rejected} file(s) exceeded ${DOC_LIMIT_MB} MB and were skipped`);
    else toast.success(`Uploaded ${files.length} file${files.length !== 1 ? 's' : ''}`);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this document?')) return;
    onChange(docs.filter(d => d.id !== id));
    toast.success('Document deleted');
  };

  const handleDownload = (doc: import('../../types/hrms').EmployeeDocument) => {
    toast.success(`Downloading ${doc.name}…`);
    // In real backend this is a pre-signed URL from object storage.
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
              onChange={(e) => handleFiles(e.target.files)}
              className="hidden"
              id="doc-upload-input"
            />
            <label htmlFor="doc-upload-input">
              <Button variant="outline" size="sm" asChild>
                <span>
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  Upload file(s)
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
          <p className="text-sm text-gray-500">No documents yet.</p>
          <p className="text-xs text-gray-400 mt-1">Upload contracts, ID scans, certificates, etc.</p>
        </div>
      ) : (
        <ul className="divide-y border rounded-md">
          {visible.map(doc => {
            const label = DOC_TYPES.find(t => t.value === doc.type)?.label ?? doc.type;
            return (
              <li key={doc.id} className="flex items-center gap-3 p-3 hover:bg-gray-50">
                <div className="h-9 w-9 rounded-md bg-blue-50 flex items-center justify-center shrink-0">
                  <FileText className="h-4 w-4 text-blue-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{doc.name}</p>
                  <p className="text-xs text-gray-500">
                    <span className="capitalize">{label}</span> · {formatBytes(doc.sizeBytes)} · {format(new Date(doc.uploadedAt), 'MMM dd, yyyy')}
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

export function Employees() {
  const [searchTerm, setSearchTerm] = useState('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  // Bump on create so re-read of mockEmployees refreshes the table.
  const [, setRosterVersion] = useState(0);
  const bumpRoster = () => setRosterVersion(v => v + 1);

  const handleCreated = (emp: Employee) => {
    mockEmployees.push(emp);
    bumpRoster();
  };
  const handleImported = (rows: Employee[]) => {
    rows.forEach(r => mockEmployees.push(r));
    bumpRoster();
  };
  const [selectedEmployee, setSelectedEmployee] = useState<typeof mockEmployees[0] | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedEmployee, setEditedEmployee] = useState<typeof mockEmployees[0] | null>(null);
  const [renewDialogOpen, setRenewDialogOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [renewalData, setRenewalData] = useState({
    startDate: '',
    endDate: '',
    salary: 0,
    contractType: '',
    notes: '',
  });
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

  const handleSaveEmployee = () => {
    if (!editedEmployee) return;

    // Validation
    if (!editedEmployee.name || !editedEmployee.email || !editedEmployee.contactNumber) {
      toast.error('Please fill in all required fields');
      return;
    }

    // Update the employee (in a real app, this would be an API call)
    setSelectedEmployee(editedEmployee);
    toast.success('Employee updated successfully');
    setIsEditing(false);
    setEditedEmployee(null);
  };

  const handleRenewContract = (contract: Contract) => {
    setSelectedContract(contract);
    setRenewalData({
      startDate: contract.endDate,
      endDate: '',
      salary: contract.salary || 0,
      contractType: contract.contractType,
      notes: '',
    });
    setRenewDialogOpen(true);
  };

  const handleSaveRenewal = () => {
    if (!renewalData.startDate || !renewalData.endDate) {
      toast.error('Please fill in all required fields');
      return;
    }
    toast.success('Contract renewed successfully');
    setRenewDialogOpen(false);
  };

  const getEmployeeContracts = (employeeId: string) => {
    return mockContracts
      .filter(c => c.employeeId === employeeId)
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  };

  const getContractStatusBadge = (status: Contract['status']) => {
    const colors = {
      active: 'bg-green-100 text-green-800',
      expiring: 'bg-orange-100 text-orange-800',
      expired: 'bg-gray-100 text-gray-800',
    };
    return <Badge className={colors[status]}>{status}</Badge>;
  };

  let filteredEmployees = mockEmployees.filter(emp =>
    emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.department.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

  // Reset pagination when search or filter changes
  useEffect(() => {
    employeePagination.resetPage();
  }, [searchTerm, dateFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Employee Management</h1>
          <p className="text-gray-500">Manage all employee records</p>
        </div>
        <div className="flex gap-2">
          <DateRangeFilter onFilterChange={handleDateFilterChange} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Employee
                <ChevronDown className="ml-2 h-4 w-4 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => setAddDialogOpen(true)}>
                <UserPlus className="mr-2 h-4 w-4" />
                Add Single Employee
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setBulkDialogOpen(true)}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Upload Bulk (Excel)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <AddEmployeeDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onCreated={handleCreated}
      />
      <BulkUploadEmployeesDialog
        open={bulkDialogOpen}
        onOpenChange={setBulkDialogOpen}
        onImported={handleImported}
      />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search employees..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
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
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employeePagination.paginatedItems.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell className="font-medium">{employee.id}</TableCell>
                  <TableCell>
                    <EmployeeCell employee={employee} nameOnly />
                  </TableCell>
                  <TableCell className="text-sm">{employee.khmerName || '-'}</TableCell>
                  <TableCell className="capitalize">{employee.gender || '-'}</TableCell>
                  <TableCell>
                    {employee.dateOfBirth ? format(new Date(employee.dateOfBirth), 'MMM dd, yyyy') : '-'}
                  </TableCell>
                  <TableCell>{employee.position}</TableCell>
                  <TableCell>{employee.department}</TableCell>
                  <TableCell>{calculateExperience(employee.joinDate)}</TableCell>
                  <TableCell>{employee.contactNumber}</TableCell>
                  <TableCell>{employee.nffNo || '-'}</TableCell>
                  <TableCell>{employee.tid || '-'}</TableCell>
                  <TableCell>
                    {employee.contractExpireDate ? (
                      <span className={
                        new Date(employee.contractExpireDate) < new Date()
                          ? 'text-red-600 font-medium'
                          : new Date(employee.contractExpireDate) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
                          ? 'text-orange-600 font-medium'
                          : ''
                      }>
                        {format(new Date(employee.contractExpireDate), 'MMM dd, yyyy')}
                      </span>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={employee.status === 'active' ? 'default' : 'secondary'}>
                      {employee.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
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
                      src={(isEditing ? editedEmployee : selectedEmployee)?.profileImage}
                      className="rounded-lg object-cover"
                    />
                    <AvatarFallback className="text-lg bg-blue-100 text-blue-600 rounded-lg">
                      {((isEditing ? editedEmployee : selectedEmployee)?.name || '').charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  {isEditing && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="absolute -bottom-1.5 -right-1.5 h-6 w-6 p-0 rounded-full shadow-sm"
                      title="Upload avatar"
                    >
                      <Upload className="h-3 w-3" />
                    </Button>
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
                    <Badge variant={selectedEmployee.status === 'active' ? 'default' : 'secondary'}>
                      {selectedEmployee.status}
                    </Badge>
                    <span className="inline-flex items-center gap-1 text-gray-600">
                      <Briefcase className="h-3 w-3" />
                      {selectedEmployee.position}
                    </span>
                    <span className="inline-flex items-center gap-1 text-gray-600">
                      <Building2 className="h-3 w-3" />
                      {selectedEmployee.department}
                    </span>
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
                      {getEmployeeContracts(selectedEmployee.id).length}
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
                      <FieldRow label="Date of Birth" isEditing={isEditing}>
                        {isEditing && editedEmployee ? (
                          <Input
                            type="date"
                            value={editedEmployee.dateOfBirth || ''}
                            onChange={(e) => setEditedEmployee({ ...editedEmployee, dateOfBirth: e.target.value })}
                            className="h-9"
                          />
                        ) : (
                          <p>{selectedEmployee.dateOfBirth ? format(new Date(selectedEmployee.dateOfBirth), 'MMM dd, yyyy') : '—'}</p>
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
                          <Input
                            value={editedEmployee.position}
                            onChange={(e) => setEditedEmployee({ ...editedEmployee, position: e.target.value })}
                            className="h-9"
                          />
                        ) : (
                          <p>{selectedEmployee.position}</p>
                        )}
                      </FieldRow>
                      <FieldRow label="Department" required={isEditing} isEditing={isEditing}>
                        {isEditing && editedEmployee ? (
                          <Input
                            value={editedEmployee.department}
                            onChange={(e) => setEditedEmployee({ ...editedEmployee, department: e.target.value })}
                            className="h-9"
                          />
                        ) : (
                          <p>{selectedEmployee.department}</p>
                        )}
                      </FieldRow>
                      <FieldRow label="Reports To" isEditing={isEditing} full>
                        {isEditing && editedEmployee ? (
                          <select
                            value={editedEmployee.managerId || ''}
                            onChange={(e) => setEditedEmployee({ ...editedEmployee, managerId: e.target.value })}
                            className="w-full px-3 py-2 border rounded-md text-sm h-9"
                          >
                            <option value="">No Manager</option>
                            {mockEmployees.filter(e => e.id !== editedEmployee.id).map(emp => (
                              <option key={emp.id} value={emp.id}>{emp.name} — {emp.position}</option>
                            ))}
                          </select>
                        ) : (
                          <p>
                            {selectedEmployee.managerId
                              ? mockEmployees.find(e => e.id === selectedEmployee.managerId)?.name || '—'
                              : 'No manager'}
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
                          <p>{format(new Date(selectedEmployee.joinDate), 'MMM dd, yyyy')}</p>
                        )}
                      </FieldRow>
                      <FieldRow label="Experience" isEditing={false}>
                        <p>{calculateExperience(selectedEmployee.joinDate)}</p>
                      </FieldRow>
                      <FieldRow label="Base Salary ($)" required={isEditing} isEditing={isEditing}>
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
                          <Badge variant={selectedEmployee.status === 'active' ? 'default' : 'secondary'} className="capitalize">
                            {selectedEmployee.status}
                          </Badge>
                        )}
                      </FieldRow>
                      <FieldRow label="Contract Expire" isEditing={isEditing} full>
                        {isEditing && editedEmployee ? (
                          <Input
                            type="date"
                            value={editedEmployee.contractExpireDate || ''}
                            onChange={(e) => setEditedEmployee({ ...editedEmployee, contractExpireDate: e.target.value })}
                            className="h-9"
                          />
                        ) : (
                          <p>{selectedEmployee.contractExpireDate ? format(new Date(selectedEmployee.contractExpireDate), 'MMM dd, yyyy') : '—'}</p>
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
                      const contracts = getEmployeeContracts(selectedEmployee.id);
                      const activeContract = contracts.find(c => c.status === 'active' || c.status === 'expiring');
                      const nextExpiry = contracts
                        .filter(c => c.status !== 'expired')
                        .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime())[0];
                      return (
                        <>
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
                                {nextExpiry ? format(new Date(nextExpiry.endDate), 'MMM dd, yyyy') : '—'}
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
                                  <TableHead className="text-xs py-2">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {contracts.map((contract) => (
                                  <TableRow key={contract.id} className={`text-xs ${contract.id === activeContract?.id ? 'bg-blue-50/50' : ''}`}>
                                    <TableCell className="py-2 font-medium">{contract.contractType}</TableCell>
                                    <TableCell className="py-2">{format(new Date(contract.startDate), 'MMM dd, yyyy')}</TableCell>
                                    <TableCell className="py-2">{format(new Date(contract.endDate), 'MMM dd, yyyy')}</TableCell>
                                    <TableCell className="py-2">${contract.salary?.toLocaleString() || '-'}</TableCell>
                                    <TableCell className="py-2">{getContractStatusBadge(contract.status)}</TableCell>
                                    <TableCell className="py-2">
                                      {(contract.status === 'active' || contract.status === 'expiring') && (
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
                        const idx = mockEmployees.findIndex(e => e.id === selectedEmployee.id);
                        if (idx >= 0) mockEmployees[idx] = { ...mockEmployees[idx], documents: docs };
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
                    <span className="truncate">Last updated {format(new Date(selectedEmployee.joinDate), 'MMM dd, yyyy')}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  {!isEditing ? (
                    <Button size="sm" onClick={handleEditEmployee}>
                      <Edit className="h-3 w-3 mr-2" />
                      Edit
                    </Button>
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

      {/* Contract Renewal Dialog */}
      <Dialog open={renewDialogOpen} onOpenChange={setRenewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Renew Contract</DialogTitle>
            <DialogDescription>
              Create a new contract renewal for {selectedEmployee?.name}
            </DialogDescription>
          </DialogHeader>
          {selectedContract && (
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium mb-2">Current Contract</p>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-gray-600">Type</p>
                    <p className="font-medium">{selectedContract.contractType}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">End Date</p>
                    <p className="font-medium">{format(new Date(selectedContract.endDate), 'MMM dd, yyyy')}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Current Salary</p>
                    <p className="font-medium">${selectedContract.salary?.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">New Start Date *</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={renewalData.startDate}
                    onChange={(e) => setRenewalData({ ...renewalData, startDate: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">New End Date *</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={renewalData.endDate}
                    onChange={(e) => setRenewalData({ ...renewalData, endDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contractType">Contract Type *</Label>
                  <select
                    id="contractType"
                    value={renewalData.contractType}
                    onChange={(e) => setRenewalData({ ...renewalData, contractType: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="Fixed Term">Fixed Term</option>
                    <option value="Permanent">Permanent</option>
                    <option value="Probation">Probation</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="salary">Salary ($)</Label>
                  <Input
                    id="salary"
                    type="number"
                    value={renewalData.salary}
                    onChange={(e) => setRenewalData({ ...renewalData, salary: parseFloat(e.target.value) })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <textarea
                  id="notes"
                  rows={3}
                  value={renewalData.notes}
                  onChange={(e) => setRenewalData({ ...renewalData, notes: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder="Add any notes about this renewal..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setRenewDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveRenewal}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Renew Contract
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
