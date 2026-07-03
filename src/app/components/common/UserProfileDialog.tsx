import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Badge } from '../ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
  User as UserIcon, Mail, Phone, MapPin, Calendar, KeyRound, Shield,
  Eye, EyeOff, Save, CheckCircle, AlertTriangle, Lock,
  Paperclip, Upload, Download, Trash2,
} from 'lucide-react';
import { format } from 'date-fns';
import { useDateFormat } from '../../context/DateFormatContext';
import { toast } from 'sonner';
import { mockEmployees } from '../../data/mockData';
import { Employee } from '../../types/hrms';
import * as departmentsApi from '../../api/departments';
import * as documentsApi from '../../api/documents';
import * as authApi from '../../api/auth';
import { USE_MOCKS } from '../../api/client';
import { makeDeptName } from '../../utils/deptName';
import { EXT_CHIP_CLASS, chipLabelOf, extOf, familyOf } from '../views/documentExtension';
import { useConfirm } from '../../context/ConfirmContext';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const BLANK_EMPLOYEE: Partial<Employee> = {
  name: '',
  email: '',
  contactNumber: '',
};

export function UserProfileDialog({ open, onOpenChange }: Props) {
  const confirm = useConfirm();
  const { formatDate } = useDateFormat();
  const { currentUser, currentEmployee, refreshUser } = useAuth();
  const employeeRef = currentEmployee ?? BLANK_EMPLOYEE;

  // Profile tab state. Display name preference: explicit user.name
  // (set via this dialog, V140) → linked employee name → empty. The
  // resolved value is what /me returns to currentUser.name, so we
  // can read it straight off the auth context.
  const [profile, setProfile] = useState<Partial<Employee>>(() => ({
    ...employeeRef,
    name: currentUser?.name ?? employeeRef.name ?? '',
  }));
  const [accountEmail, setAccountEmail] = useState(currentUser?.email ?? '');
  const [savingProfile, setSavingProfile] = useState(false);

  // Departments list — only used to resolve the dept UUID on
  // currentEmployee.department into a human label for the badge
  // + the Profile-tab dept field. Fetched lazily on dialog open
  // so closed-dialog renders don't pay the round-trip.
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    if (!open || USE_MOCKS) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await departmentsApi.list();
        if (!cancelled) setDepartments(list.map(d => ({ id: d.id, name: d.name })));
      } catch { /* badge falls back to '—'; non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [open]);
  const deptName = useMemo(() => makeDeptName(departments, ''), [departments]);
  const employeeDeptLabel = deptName(currentEmployee?.department);

  // Attachments tab — the user uploads files against their own
  // employee record. Hidden when the account isn't linked to an
  // employee (e.g. a super_admin or service account); the backend's
  // /api/v1/employees/{id}/documents endpoint requires the FK.
  const empApiId: string | undefined =
    (currentEmployee as { apiId?: string } | null | undefined)?.apiId
    ?? currentEmployee?.id;
  const showAttachments = !!empApiId && !USE_MOCKS;

  const DOC_TYPES: ReadonlyArray<{ value: documentsApi.EmployeeDocumentType; label: string }> = [
    { value: 'contract',    label: 'Contract' },
    { value: 'id_card',     label: 'ID Card' },
    { value: 'passport',    label: 'Passport' },
    { value: 'certificate', label: 'Certificate' },
    { value: 'resume',      label: 'Resume' },
    { value: 'tax_form',    label: 'Tax Form' },
    { value: 'other',       label: 'Other' },
  ];
  const DOC_TYPE_LABEL: Record<string, string> = DOC_TYPES.reduce(
    (acc, t) => { acc[t.value] = t.label; return acc; }, {} as Record<string, string>,
  );

  const [attachments, setAttachments] = useState<documentsApi.EmployeeDocument[]>([]);
  const [attachLoading, setAttachLoading] = useState(false);
  const [attachUploadType, setAttachUploadType] = useState<documentsApi.EmployeeDocumentType>('other');
  const [attachUploading, setAttachUploading] = useState(false);
  const [attachDownloadingId, setAttachDownloadingId] = useState<string | null>(null);

  const refreshAttachments = async () => {
    if (!showAttachments || !empApiId) return;
    setAttachLoading(true);
    try {
      setAttachments(await documentsApi.listForEmployee(empApiId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load attachments');
    } finally {
      setAttachLoading(false);
    }
  };

  useEffect(() => {
    // Lazy-load when the dialog opens AND the user has an employee
    // record. Avoids a per-render fetch on closed-dialog re-renders.
    if (open && showAttachments) void refreshAttachments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, empApiId]);

  const handleAttachUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !empApiId) return;
    setAttachUploading(true);
    let ok = 0;
    try {
      // Sequential upload so a failure on file N doesn't trash the
      // already-saved 1..N-1 — same pattern as the per-employee
      // Documents tab on the Employees page.
      for (const f of Array.from(files)) {
        try {
          await documentsApi.upload(empApiId, f, attachUploadType);
          ok++;
        } catch (e) {
          toast.error(`Failed to upload ${f.name}: ${e instanceof Error ? e.message : 'unknown'}`);
        }
      }
      if (ok > 0) {
        toast.success(`Uploaded ${ok} file${ok === 1 ? '' : 's'}`);
        await refreshAttachments();
      }
    } finally {
      setAttachUploading(false);
    }
  };

  const handleAttachDownload = async (doc: documentsApi.EmployeeDocument) => {
    setAttachDownloadingId(doc.id);
    try {
      await documentsApi.download(doc);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setAttachDownloadingId(null);
    }
  };

  const handleAttachDelete = async (doc: documentsApi.EmployeeDocument) => {
    if (!(await confirm({ title: `Delete '${doc.name}'?`, variant: 'destructive', confirmLabel: 'Delete' }))) return;
    try {
      await documentsApi.remove(doc.id);
      setAttachments(prev => prev.filter(d => d.id !== doc.id));
      toast.success('Deleted');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  /** Human file size for the Attachments list. */
  const fmtAttachSize = (bytes: number) =>
    bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : bytes >= 1024 ? `${(bytes / 1024).toFixed(0)} KB`
    : `${bytes} B`;

  // Password tab state
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  // Reset form when dialog opens/reopens
  useEffect(() => {
    if (open) {
      setProfile(employeeRef);
      setAccountEmail(currentUser?.email ?? '');
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setShowCurrent(false);
      setShowNew(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentUser?.email, currentEmployee?.id]);

  const initials = useMemo(
    () => (profile.name || currentUser?.email || '?').split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase(),
    [profile.name, currentUser?.email],
  );

  const handleSaveProfile = async () => {
    const trimmed = profile.name?.trim() ?? '';
    if (!trimmed) {
      toast.error('Name is required');
      return;
    }
    // V140 — persist the display name via PATCH /api/v1/auth/me.
    // In mock mode we still write to mockEmployees so the
    // legacy demo flow keeps working.
    setSavingProfile(true);
    try {
      if (USE_MOCKS) {
        if (currentEmployee) {
          const idx = mockEmployees.findIndex(e => e.id === currentEmployee.id);
          if (idx >= 0) mockEmployees[idx] = { ...mockEmployees[idx], ...profile } as Employee;
        }
      } else {
        await authApi.updateProfile({ name: trimmed });
        await refreshUser();
      }
      toast.success('Profile updated');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveAccount = () => {
    if (!accountEmail || !/^\S+@\S+\.\S+$/.test(accountEmail)) {
      toast.error('Enter a valid email address');
      return;
    }
    // In real backend: PATCH /api/v1/auth/me — may require email re-verification.
    toast.success(`Account email updated. A verification link was sent to ${accountEmail}.`);
    onOpenChange(false);
  };

  const pwStrength = usePasswordStrength(newPw);
  const canChangePassword =
    currentPw.length > 0 &&
    newPw.length >= 8 &&
    newPw === confirmPw &&
    pwStrength.score >= 3;

  const handleChangePassword = () => {
    if (!canChangePassword) {
      if (newPw !== confirmPw) toast.error('New passwords do not match');
      else if (pwStrength.score < 3) toast.error('Password is not strong enough');
      else toast.error('Please fill all fields');
      return;
    }
    // Real backend: POST /api/v1/auth/change-password — verifies currentPw, applies policy.
    toast.success('Password changed. You will stay signed in on this device.');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0">
        {/* Title + description kept sr-only so the dialog still has a
            programmatic label, but the visible "header" is the
            identity strip — avatar + name + role/dept badges already
            convey what the dialog is about; the redundant "Your
            Profile" line was just chrome. */}
        <DialogHeader className="sr-only">
          <DialogTitle>Your Profile</DialogTitle>
          <DialogDescription>Update personal information, login email, or password.</DialogDescription>
        </DialogHeader>

        {/* Identity strip = the visible header */}
        <div className="px-6 pt-6 pb-4 flex items-center gap-4 border-b">
          <Avatar className="h-14 w-14 rounded-lg border border-gray-200">
            <AvatarImage src={profile.profileImage} className="rounded-lg object-cover" />
            <AvatarFallback className="rounded-lg bg-blue-100 text-blue-700 text-sm font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">{profile.name || currentUser?.email}</p>
            <p className="text-xs text-gray-500 truncate">{currentUser?.email}</p>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap text-xs">
              <Badge variant="outline" className="capitalize">
                <Shield className="h-2.5 w-2.5 mr-1" />
                {currentUser?.role.replace('_', ' ')}
              </Badge>
              {employeeDeptLabel && (
                <Badge variant="outline" className="text-gray-600">{employeeDeptLabel}</Badge>
              )}
            </div>
          </div>
        </div>

        <Tabs defaultValue="profile" className="px-6 pt-4 pb-2">
          <TabsList className={`grid ${showAttachments ? 'grid-cols-4 max-w-xl' : 'grid-cols-3 max-w-md'}`}>
            <TabsTrigger value="profile">
              <UserIcon className="h-3.5 w-3.5 mr-1.5" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="account">
              <Mail className="h-3.5 w-3.5 mr-1.5" />
              Account
            </TabsTrigger>
            <TabsTrigger value="password">
              <KeyRound className="h-3.5 w-3.5 mr-1.5" />
              Password
            </TabsTrigger>
            {showAttachments && (
              <TabsTrigger value="attachments">
                <Paperclip className="h-3.5 w-3.5 mr-1.5" />
                Attachments
              </TabsTrigger>
            )}
          </TabsList>

          {/* Profile tab */}
          <TabsContent value="profile" className="space-y-4 pt-4 pb-2">
            <div className="grid grid-cols-2 gap-4">
              <FieldBox label="Full Name" required>
                <Input
                  value={profile.name ?? ''}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  placeholder="Full Name"
                />
              </FieldBox>
              <FieldBox label="Khmer Name">
                <Input
                  value={profile.khmerName ?? ''}
                  onChange={(e) => setProfile({ ...profile, khmerName: e.target.value })}
                  placeholder="ឈ្មោះជាភាសាខ្មែរ"
                />
              </FieldBox>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FieldBox label="Gender">
                <select
                  value={profile.gender ?? ''}
                  onChange={(e) => setProfile({ ...profile, gender: e.target.value as 'male' | 'female' })}
                  className="w-full h-9 px-3 border rounded-md text-sm"
                >
                  <option value="">Not specified</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </FieldBox>
              <FieldBox label="Date of Birth" icon={Calendar}>
                <Input
                  type="date"
                  value={profile.dateOfBirth ?? ''}
                  onChange={(e) => setProfile({ ...profile, dateOfBirth: e.target.value })}
                />
              </FieldBox>
            </div>
            <FieldBox label="Contact Number" icon={Phone}>
              <Input
                value={profile.contactNumber ?? ''}
                onChange={(e) => setProfile({ ...profile, contactNumber: e.target.value })}
                placeholder="+855-12-345-678"
              />
            </FieldBox>
            <FieldBox label="Place of Birth" icon={MapPin}>
              <Input
                value={profile.placeOfBirth ?? ''}
                onChange={(e) => setProfile({ ...profile, placeOfBirth: e.target.value })}
                placeholder="City, Country"
              />
            </FieldBox>
            <FieldBox label="Current Address" icon={MapPin}>
              <Input
                value={profile.currentAddress ?? ''}
                onChange={(e) => setProfile({ ...profile, currentAddress: e.target.value })}
                placeholder="Street, District, City, Country"
              />
            </FieldBox>

            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={savingProfile}>Cancel</Button>
              <Button onClick={() => { void handleSaveProfile(); }} disabled={savingProfile}>
                <Save className="h-4 w-4 mr-2" />
                {savingProfile ? 'Saving…' : 'Save Profile'}
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* Account tab */}
          <TabsContent value="account" className="space-y-4 pt-4 pb-2">
            <FieldBox label="Sign-in Email" required icon={Mail}>
              <Input
                type="email"
                value={accountEmail}
                onChange={(e) => setAccountEmail(e.target.value)}
                placeholder="you@company.com"
              />
              <p className="text-xs text-gray-500">
                Changing this sends a verification link to the new address. Your current email stays active until you verify.
              </p>
            </FieldBox>

            <div className="grid grid-cols-2 gap-4">
              <FieldBox label="Role">
                <div className="h-9 flex items-center px-3 border rounded-md bg-gray-50 text-sm capitalize">
                  {currentUser?.role.replace('_', ' ')}
                </div>
              </FieldBox>
              <FieldBox label="Employee ID">
                {/* Human emp_no (e.g. EMP002), never the backend UUID
                    — currentUser.employeeId is the FK to employees,
                    which is internal plumbing nobody wants to see in
                    a profile card. */}
                <div className="h-9 flex items-center px-3 border rounded-md bg-gray-50 text-sm tabular-nums text-gray-700">
                  {currentEmployee?.empNo || currentEmployee?.id || '—'}
                </div>
              </FieldBox>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FieldBox label="Member Since">
                <div className="h-9 flex items-center px-3 border rounded-md bg-gray-50 text-sm text-gray-700">
                  {currentUser?.createdAt ? formatDate(currentUser.createdAt) : '—'}
                </div>
              </FieldBox>
              <FieldBox label="Last Sign-in">
                <div className="h-9 flex items-center px-3 border rounded-md bg-gray-50 text-sm text-gray-700">
                  {currentUser?.lastLogin ? format(new Date(currentUser.lastLogin), 'MMM dd, yyyy HH:mm') : '—'}
                </div>
              </FieldBox>
            </div>

            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleSaveAccount}>
                <Save className="h-4 w-4 mr-2" />
                Save Account
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* Password tab */}
          <TabsContent value="password" className="space-y-4 pt-4 pb-2">
            <FieldBox label="Current Password" required icon={Lock}>
              <div className="flex gap-2">
                <Input
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <Button
                  variant="outline"
                  size="icon"
                  type="button"
                  onClick={() => setShowCurrent((s) => !s)}
                  aria-label={showCurrent ? 'Hide current password' : 'Show current password'}
                >
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </FieldBox>

            <FieldBox label="New Password" required icon={KeyRound}>
              <div className="flex gap-2">
                <Input
                  type={showNew ? 'text' : 'password'}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                />
                <Button
                  variant="outline"
                  size="icon"
                  type="button"
                  onClick={() => setShowNew((s) => !s)}
                  aria-label={showNew ? 'Hide new password' : 'Show new password'}
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {newPw.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={`h-1.5 flex-1 rounded-full ${
                          i < pwStrength.score ? pwStrength.barColor : 'bg-gray-200'
                        }`}
                      />
                    ))}
                    <span className={`text-xs font-medium ml-2 ${pwStrength.textColor}`}>
                      {pwStrength.label}
                    </span>
                  </div>
                  <ul className="text-[11px] space-y-0.5">
                    {pwStrength.checks.map((c) => (
                      <li key={c.label} className={`flex items-center gap-1.5 ${c.ok ? 'text-green-700' : 'text-gray-500'}`}>
                        {c.ok ? <CheckCircle className="h-3 w-3" /> : <span className="h-3 w-3 rounded-full border border-gray-300" />}
                        {c.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </FieldBox>

            <FieldBox label="Confirm New Password" required>
              <Input
                type={showNew ? 'text' : 'password'}
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="Type it again"
                autoComplete="new-password"
              />
              {confirmPw.length > 0 && newPw !== confirmPw && (
                <p className="text-xs text-red-700 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Passwords don't match
                </p>
              )}
            </FieldBox>

            <div className="flex items-start gap-2 p-3 rounded-md bg-blue-50 border border-blue-200 text-sm text-blue-900">
              <Shield className="h-4 w-4 mt-0.5 shrink-0 text-blue-700" />
              <p>After changing your password, other devices will stay signed in but require the new password next time they refresh the session.</p>
            </div>

            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleChangePassword} disabled={!canChangePassword}>
                <KeyRound className="h-4 w-4 mr-2" />
                Change Password
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* Attachments tab — only when the account is linked to an
              employee. Lets the user upload personal docs (ID copies,
              certificates, etc.) and pull existing ones back down. */}
          {showAttachments && (
            <TabsContent value="attachments" className="space-y-4 pt-4 pb-2">
              <div className="p-4 rounded-md border-2 border-dashed border-gray-300 space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-[180px] space-y-1.5">
                    <Label className="text-xs text-gray-600">Document type</Label>
                    <select
                      value={attachUploadType}
                      onChange={e => setAttachUploadType(e.target.value as documentsApi.EmployeeDocumentType)}
                      className="w-full h-9 px-3 border rounded-md text-sm bg-white"
                    >
                      {DOC_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1 min-w-[200px] space-y-1.5">
                    <Label htmlFor="profile-attach-file" className="text-xs text-gray-600">
                      Pick file{attachUploading && <span className="text-amber-600 ml-2">uploading…</span>}
                    </Label>
                    <Input
                      id="profile-attach-file"
                      type="file"
                      multiple
                      disabled={attachUploading}
                      onChange={e => {
                        void handleAttachUpload(e.target.files);
                        // Allow re-uploading the same file later by
                        // clearing the input value after the request
                        // kicks off.
                        e.currentTarget.value = '';
                      }}
                      className="h-9"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-gray-500 flex items-center gap-1.5">
                  <Upload className="h-3 w-3" />
                  Files are stored against your employee record and visible to your HR admin.
                </p>
              </div>

              {attachLoading && attachments.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">Loading attachments…</p>
              ) : attachments.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  No attachments yet. Upload your first file above.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {attachments.map(doc => {
                    const family = familyOf(extOf(doc.name), doc.mimeType);
                    const chipLabel = chipLabelOf(doc.name);
                    return (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between px-3 py-2 rounded-md border bg-white"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`shrink-0 inline-flex items-center justify-center min-w-[2.25rem] h-7 px-1.5 rounded border text-[10px] font-semibold tracking-wide uppercase ${EXT_CHIP_CLASS[family]}`}
                          title={doc.mimeType}
                        >
                          {chipLabel}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm truncate" title={doc.name}>{doc.name}</p>
                          <p className="text-[11px] text-gray-500">
                            {DOC_TYPE_LABEL[doc.type] ?? doc.type}
                            <span className="mx-1.5 text-gray-300">·</span>
                            {fmtAttachSize(doc.sizeBytes)}
                            <span className="mx-1.5 text-gray-300">·</span>
                            {formatDate(doc.uploadedAt)}
                          </p>
                        </div>
                      </div>
                      <div className="inline-flex gap-1 shrink-0">
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => handleAttachDownload(doc)}
                          disabled={attachDownloadingId === doc.id}
                          title="Download"
                        >
                          <Download className="h-3.5 w-3.5 mr-1" />
                          {attachDownloadingId === doc.id ? '…' : 'Get'}
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleAttachDelete(doc)}
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
function FieldBox({
  label, children, required, icon: Icon,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-gray-600 flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
        {required && <span className="text-red-500">*</span>}
      </Label>
      <div className="space-y-1.5">
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Password strength — simple heuristic; production code should use zxcvbn.
function usePasswordStrength(pw: string) {
  const checks = [
    { label: 'At least 8 characters', ok: pw.length >= 8 },
    { label: 'Contains a number',     ok: /\d/.test(pw) },
    { label: 'Contains a symbol',     ok: /[!@#$%^&*()_\-+={}\[\]|\\:;"'<>,.?/~`]/.test(pw) },
    { label: 'Mixes upper & lower',   ok: /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
  ];
  const score = checks.filter(c => c.ok).length;
  const label = ['Very weak', 'Weak', 'Fair', 'Strong', 'Excellent'][score];
  const barColor = score <= 1 ? 'bg-red-500' : score === 2 ? 'bg-amber-500' : score === 3 ? 'bg-blue-500' : 'bg-green-500';
  const textColor = score <= 1 ? 'text-red-700' : score === 2 ? 'text-amber-700' : score === 3 ? 'text-blue-700' : 'text-green-700';
  return { score, label, barColor, textColor, checks };
}
