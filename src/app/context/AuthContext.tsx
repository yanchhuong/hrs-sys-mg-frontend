import React, { createContext, useContext, useState, ReactNode } from 'react';
import { User, UserRole } from '../types/hrms';
import { mockUsers, mockEmployees } from '../data/mockData';

interface AuthContextType {
  currentUser: User | null;
  currentEmployee: ReturnType<typeof mockEmployees.find> | null;
  login: (email: string, password: string) => boolean;
  logout: () => void;
  switchRole: (role: UserRole) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const defaultAuthContext: AuthContextType = {
  currentUser: null,
  currentEmployee: null,
  login: () => false,
  logout: () => {},
  switchRole: () => {},
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const currentEmployee = currentUser
    ? mockEmployees.find(emp => emp.id === currentUser.employeeId)
    : null;

  const login = (email: string, password: string): boolean => {
    const user = mockUsers.find(u => u.email === email && u.password === password);
    if (user) {
      setCurrentUser(user);
      return true;
    }
    return false;
  };

  const logout = () => {
    setCurrentUser(null);
  };

  const switchRole = (role: UserRole) => {
    const user = mockUsers.find(u => u.role === role);
    if (user) {
      setCurrentUser(user);
    }
  };

  return (
    <AuthContext.Provider value={{ currentUser, currentEmployee, login, logout, switchRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    return defaultAuthContext;
  }
  return context;
}