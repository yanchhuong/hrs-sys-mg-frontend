import { apiJson, apiVoid, Page } from './client';

export interface Employee {
  id: string;
  empNo: string;
  name: string;
  khmerName?: string | null;
  email: string;
  position: string;
  departmentId?: string | null;
  joinDate: string;
  status: 'active' | 'inactive' | string;
  contactNumber?: string | null;
  baseSalary: number;
  managerId?: string | null;
  profileImage?: string | null;
  gender?: 'male' | 'female' | 'other' | string | null;
  dateOfBirth?: string | null;
  placeOfBirth?: string | null;
  currentAddress?: string | null;
  nffNo?: string | null;
  tid?: string | null;
  contractExpireDate?: string | null;
}

export type CreateEmployeeRequest = Omit<Employee, 'id' | 'status' | 'profileImage'> & {
  status?: string;
};

export interface ListParams {
  q?: string;
  departmentId?: string;
  status?: string;
  page?: number;
  size?: number;
}

export async function list(params: ListParams = {}): Promise<Page<Employee>> {
  return apiJson<Page<Employee>>('/api/v1/employees', { query: { ...params } });
}

export async function get(id: string): Promise<Employee> {
  return apiJson<Employee>(`/api/v1/employees/${id}`);
}

export async function me(): Promise<Employee> {
  return apiJson<Employee>('/api/v1/employees/me');
}

export async function create(req: CreateEmployeeRequest): Promise<Employee> {
  return apiJson<Employee>('/api/v1/employees', { method: 'POST', json: req });
}

export async function update(id: string, req: CreateEmployeeRequest): Promise<Employee> {
  return apiJson<Employee>(`/api/v1/employees/${id}`, { method: 'PUT', json: req });
}

export async function updateMe(req: Partial<CreateEmployeeRequest>): Promise<Employee> {
  return apiJson<Employee>('/api/v1/employees/me', { method: 'PATCH', json: req });
}

export async function remove(id: string): Promise<void> {
  return apiVoid(`/api/v1/employees/${id}`, { method: 'DELETE' });
}
