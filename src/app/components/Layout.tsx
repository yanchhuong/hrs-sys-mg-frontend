import { ReactNode, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import { Avatar, AvatarFallback } from './ui/avatar';
import { UserProfileDialog } from './common/UserProfileDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  LayoutDashboard,
  Users,
  Clock,
  TimerIcon,
  DollarSign,
  FileText,
  Settings,
  AlertCircle,
  Minus,
  TrendingUp,
  LogOut,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  BarChart3,
  UserCog,
} from 'lucide-react';
import { Badge } from './ui/badge';

interface LayoutProps {
  children: ReactNode;
  currentView: string;
  onViewChange: (view: string) => void;
}

export function Layout({ children, currentView, onViewChange }: LayoutProps) {
  const { currentUser, currentEmployee, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const isSettingsSubView = ['settings', 'user-management', 'attendance-settings', 'deps-group'].includes(currentView);
  const [settingsExpanded, setSettingsExpanded] = useState(isSettingsSubView);

  const menuItems = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard, roles: ['admin', 'manager', 'employee'] },
    { id: 'employees', label: 'Employee', icon: Users, roles: ['admin', 'manager'] },
    { id: 'attendance', label: 'Attendance', icon: Clock, roles: ['admin', 'manager', 'employee'] },
    { id: 'exception', label: 'Exception', icon: AlertCircle, roles: ['admin', 'manager'] },
    { id: 'overtime', label: 'Overtime', icon: TimerIcon, roles: ['admin', 'manager', 'employee'] },
    { id: 'deduction', label: 'Deduction', icon: Minus, roles: ['admin'] },
    { id: 'increase', label: 'Increase', icon: TrendingUp, roles: ['admin'] },
    { id: 'payroll', label: 'Payroll', icon: DollarSign, roles: ['admin', 'manager', 'employee'] },
    { id: 'reports', label: 'Reports', icon: BarChart3, roles: ['admin', 'manager'] },
  ];

  const settingsSubMenuItems = [
    { id: 'settings', label: 'General Settings', icon: Settings },
    { id: 'attendance-settings', label: 'Attendance Settings', icon: Clock },
    { id: 'deps-group', label: 'Deps/Group', icon: Users },
    { id: 'user-management', label: 'User Management', icon: Users },
  ];

  const filteredMenuItems = menuItems.filter(item =>
    currentUser && item.roles.includes(currentUser.role)
  );

  const handleMenuClick = (itemId: string) => {
    onViewChange(itemId);
    setSidebarOpen(false);
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-100 text-red-800 hover:bg-red-100';
      case 'manager':
        return 'bg-blue-100 text-blue-800 hover:bg-blue-100';
      default:
        return 'bg-green-100 text-green-800 hover:bg-green-100';
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar - Full Height */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-30 w-64 bg-white border-r transform transition-transform duration-200 ease-in-out overflow-y-auto flex flex-col
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="flex items-center gap-2 px-4 h-16 border-b shrink-0">
          <div className="p-2 bg-blue-600 rounded-lg">
            <LayoutDashboard className="h-5 w-5 text-white" />
          </div>
          <span className="font-semibold text-lg">HRMS</span>
        </div>
        <nav className="p-4 space-y-1 flex-1 overflow-y-auto">
          {filteredMenuItems.map((item) => {
            const Icon = item.icon;
            return (
              <Button
                key={item.id}
                variant={currentView === item.id ? 'secondary' : 'ghost'}
                className="w-full justify-start"
                onClick={() => handleMenuClick(item.id)}
              >
                <Icon className="mr-2 h-4 w-4" />
                {item.label}
              </Button>
            );
          })}

          {/* Settings Menu with Submenu */}
          {currentUser?.role === 'admin' && (
            <div>
              <Button
                variant={settingsExpanded || ['settings', 'contracts', 'attendance-settings', 'deps-group'].includes(currentView) ? 'secondary' : 'ghost'}
                className="w-full justify-start"
                onClick={() => setSettingsExpanded(!settingsExpanded)}
              >
                <Settings className="mr-2 h-4 w-4" />
                Setting
                {settingsExpanded ? (
                  <ChevronDown className="ml-auto h-4 w-4" />
                ) : (
                  <ChevronRight className="ml-auto h-4 w-4" />
                )}
              </Button>

              {settingsExpanded && (
                <div className="ml-4 mt-1 space-y-1">
                  {settingsSubMenuItems.map((subItem) => {
                    const SubIcon = subItem.icon;
                    return (
                      <Button
                        key={subItem.id}
                        variant={currentView === subItem.id ? 'secondary' : 'ghost'}
                        className="w-full justify-start text-sm"
                        size="sm"
                        onClick={() => handleMenuClick(subItem.id)}
                      >
                        <SubIcon className="mr-2 h-3 w-3" />
                        {subItem.label}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </nav>
      </aside>

      {/* Right side: Top nav + Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navigation */}
        <div className="bg-white border-b shrink-0">
          <div className="flex items-center justify-between px-4 h-16">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </div>

            <div className="flex items-center gap-4">
              <Badge variant="secondary" className={getRoleBadgeColor(currentUser?.role || '')}>
                {currentUser?.role.toUpperCase()}
              </Badge>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                    <Avatar>
                      <AvatarFallback>
                        {currentEmployee?.name.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm">{currentEmployee?.name}</p>
                      <p className="text-xs text-gray-500">{currentEmployee?.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setProfileOpen(true)}>
                    <UserCog className="mr-2 h-4 w-4" />
                    <span>Your Profile</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <main className="flex-1 p-6 lg:p-8 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <UserProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </div>
  );
}