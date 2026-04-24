import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, UserRole } from '../types/hrms';
import { mockUsers, mockEmployees } from '../data/mockData';
import * as authApi from '../api/auth';
import { USE_MOCKS } from '../api/client';

export interface LoginResult {
  success: boolean;
  error?: string;
}

interface AuthContextType {
  currentUser: User | null;
  currentEmployee: ReturnType<typeof mockEmployees.find> | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => void;
  switchRole: (role: UserRole) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const defaultAuthContext: AuthContextType = {
  currentUser: null,
  currentEmployee: null,
  loading: false,
  login: async () => ({ success: false }),
  logout: () => {},
  switchRole: () => {},
};

/** Translate the API's AuthUser into the frontend's User shape. */
function fromApi(apiUser: authApi.AuthUser): User {
  return {
    id: apiUser.id,
    email: apiUser.email,
    password: '',
    role: apiUser.role as UserRole,
    employeeId: apiUser.employeeId ?? '',
    createdAt: new Date().toISOString(),
    isActive: true,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Rehydrate from the JWT cached by authApi — keeps sessions across reloads.
  useEffect(() => {
    if (USE_MOCKS) {
      setLoading(false);
      return;
    }
    const cached = authApi.cachedUser();
    if (cached && authApi.isAuthenticated()) {
      setCurrentUser(fromApi(cached));
    }
    setLoading(false);
  }, []);

  const currentEmployee = currentUser
    ? mockEmployees.find(emp => emp.id === currentUser.employeeId) ?? null
    : null;

  const login = async (email: string, password: string): Promise<LoginResult> => {
    if (USE_MOCKS) {
      const user = mockUsers.find(u => u.email === email && u.password === password);
      if (user) {
        setCurrentUser(user);
        return { success: true };
      }
      return { success: false, error: 'Invalid credentials' };
    }
    try {
      const apiUser = await authApi.login({ email, password });
      setCurrentUser(fromApi(apiUser));
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Login failed' };
    }
  };

  const logout = () => {
    setCurrentUser(null);
    authApi.logout();
  };

  // Dev-only role toggle — only meaningful against the mock user list.
  const switchRole = (role: UserRole) => {
    if (!USE_MOCKS) return;
    const user = mockUsers.find(u => u.role === role);
    if (user) setCurrentUser(user);
  };

  return (
    <AuthContext.Provider value={{ currentUser, currentEmployee, loading, login, logout, switchRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) return defaultAuthContext;
  return context;
}
