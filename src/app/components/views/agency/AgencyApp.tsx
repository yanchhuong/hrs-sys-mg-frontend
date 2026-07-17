import { useMemo, useState } from 'react';
import { Building2, LogOut, LayoutDashboard, Loader2, CheckSquare, Wallet, FileSpreadsheet, Settings as SettingsIcon, ChevronRight, ChevronDown, Users, UserRound, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useAgencyClient } from '../../../context/AgencyClientContext';
import { Button } from '../../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { AgencyDashboardPage } from './AgencyDashboardPage';
import { AgencyTasksPage } from './AgencyTasksPage';
import { AgencySaleExpensePage } from './AgencySaleExpensePage';
import { AgencyTaxDeclarationsPage } from './AgencyTaxDeclarationsPage';
import { AgencySettingsProfilePage } from './AgencySettingsProfilePage';
import { AgencySettingsUsersPage } from './AgencySettingsUsersPage';
import { AgencySettingsClientsPage } from './AgencySettingsClientsPage';
import { AgencyNotificationsBell } from './AgencyNotificationsBell';

type Section =
  | 'dashboard' | 'tasks' | 'sale-expense' | 'declarations'
  | 'settings-profile' | 'settings-users' | 'settings-clients';

interface NavLeaf {
  key: Section;
  label: string;
  icon: React.ReactNode;
  /** True → the item requires a picked client. */
  requiresClient: boolean;
}

const TOP_NAV: NavLeaf[] = [
  { key: 'dashboard',    label: 'Dashboard',        icon: <LayoutDashboard className="h-4 w-4" />, requiresClient: false },
  { key: 'tasks',        label: 'Tasks',            icon: <CheckSquare className="h-4 w-4" />,     requiresClient: false },
  { key: 'sale-expense', label: 'Journals',         icon: <Wallet className="h-4 w-4" />,          requiresClient: false },
  { key: 'declarations', label: 'Tax Declarations', icon: <FileSpreadsheet className="h-4 w-4" />, requiresClient: false },
];

const SETTINGS_CHILDREN: NavLeaf[] = [
  { key: 'settings-profile', label: 'Company Profile', icon: <Building2 className="h-3.5 w-3.5" />, requiresClient: false },
  { key: 'settings-users',   label: 'Users',           icon: <UserRound className="h-3.5 w-3.5" />, requiresClient: false },
  { key: 'settings-clients', label: 'Clients',         icon: <Users className="h-3.5 w-3.5" />,     requiresClient: false },
];

const SETTINGS_KEYS = new Set<Section>(SETTINGS_CHILDREN.map(c => c.key));

/**
 * v-agency-fe-1 — bare agency workspace shell.
 *
 * Ships in FE turn #1 as: sidebar, client picker in the header,
 * Portfolio page fully wired to /agency/me. Cases / Tax /
 * Deliverables / Anomalies pages are stubbed with "coming in the
 * next turn" placeholders — the shape is here so FE turns #2–#5
 * only need to fill in the panes.
 */
export function AgencyApp() {
  const { currentUser, logout } = useAuth();
  const { portfolio, activeClientId, setActiveClient, loading } = useAgencyClient();
  const [section, setSection] = useState<Section>('dashboard');
  // Settings group expands when a settings-* section is active, or
  // when the user has clicked the parent to open it. Collapses when
  // the user clicks the parent again while collapsed-eligible.
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);

  const inSettings = SETTINGS_KEYS.has(section);
  const settingsExpanded = settingsOpen || inSettings;

  const agencyName = currentUser?.name || currentUser?.email || 'Agency';
  const activeClient = useMemo(
    () => portfolio.find(c => c.tenantId === activeClientId) ?? null,
    [portfolio, activeClientId],
  );
  const activePickTitle = activeClient?.tenantName ?? '';
  const isReadOnly = activeClient?.status === 'disconnect_pending';

  return (
    <div className="flex h-screen bg-gray-50">
      {/* ---- Sidebar ---- */}
      <aside className="w-48 bg-white border-r flex flex-col">
        <div className="px-4 py-4 border-b flex items-center gap-2">
          <Building2 className="h-5 w-5 text-blue-600" />
          <div className="min-w-0">
            <div className="text-xs text-gray-500">Agency workspace</div>
            <div className="text-sm font-semibold truncate">{agencyName}</div>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {TOP_NAV.map(item => {
            const disabled = item.requiresClient && !activeClientId;
            const active = section === item.key;
            return (
              <button
                key={item.key}
                type="button"
                disabled={disabled}
                onClick={() => setSection(item.key)}
                title={disabled ? 'Pick a client first' : undefined}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition ${
                  active ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                {item.icon}
                <span className="flex-1">{item.label}</span>
              </button>
            );
          })}

          {/* Settings — parent button toggles the submenu. Clicking
              a child auto-expands + selects. */}
          <button
            type="button"
            onClick={() => {
              if (inSettings) {
                // Currently inside settings — parent click just
                // collapses the submenu (keeps the active page).
                setSettingsOpen(prev => !prev);
              } else if (settingsOpen) {
                setSettingsOpen(false);
              } else {
                setSettingsOpen(true);
                setSection('settings-profile');
              }
            }}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition ${
              inSettings ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
            }`}
            aria-expanded={settingsExpanded}
          >
            <SettingsIcon className="h-4 w-4" />
            <span className="flex-1">Settings</span>
            {settingsExpanded
              ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
              : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
          </button>
          {settingsExpanded && (
            <div className="pl-4 space-y-0.5">
              {SETTINGS_CHILDREN.map(child => {
                const active = section === child.key;
                return (
                  <button
                    key={child.key}
                    type="button"
                    onClick={() => setSection(child.key)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-left transition ${
                      active ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {child.icon}
                    <span className="flex-1">{child.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </nav>
        <div className="p-2 border-t">
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={logout}>
            <LogOut className="h-4 w-4 mr-2" />
            Log out
          </Button>
        </div>
      </aside>

      {/* ---- Main pane ---- */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* v-agency-header-body-align — the header's inner row
            fills the same width as {@code <main>} minus its p-6
            padding, so the notification bell + client picker land
            at exactly the same right edge as every agency page's
            body content. Border/background stay full-width. */}
        <header className="h-14 border-b bg-white shrink-0 px-6">
          <div className="h-full flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-gray-500">
              {section === 'dashboard' ? 'Agency dashboard'
                : inSettings ? 'Agency settings'
                : activePickTitle
                  ? `Working on: ${activePickTitle}`
                  : 'Pick a client Company to continue'}
            </div>
          </div>

          {/* Client picker — hidden on Dashboard + Settings pages
              (agency-scope surfaces, not client-scoped). */}
          {section !== 'dashboard' && !inSettings && (
            <div className="flex items-center gap-2">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
              ) : (
                <Select
                  value={activeClientId ?? ''}
                  onValueChange={v => {
                    setActiveClient(v || null);
                  }}
                >
                  <SelectTrigger className="h-8 w-64 text-sm">
                    <SelectValue placeholder="Pick a client…" />
                  </SelectTrigger>
                  <SelectContent>
                    {portfolio.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-gray-500">
                        No clients assigned yet.
                      </div>
                    ) : (
                      portfolio.map(c => (
                        <SelectItem key={c.tenantId} value={c.tenantId}>
                          {c.tenantName ?? c.tenantSlug ?? c.tenantId}
                          {c.scope !== 'full' && (
                            <span className="text-[10px] text-gray-500 ml-1">
                              ({c.scope})
                            </span>
                          )}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Top-bar notification bell — replaces the former
              Notifications sidebar entry. Bell polls its own
              unread count every 60s while the tab is visible. */}
          <AgencyNotificationsBell />
          </div>
        </header>

        {/* v-tenant-request-disconnect — read-only banner when the
            picked client has asked to end the engagement. Any write
            attempt on that tenant's workspace 403s through the
            server-side AgencyEngagementGate; this banner tells the
            user *why* before they hit that error. */}
        {isReadOnly && !inSettings && (
          <div className="bg-amber-100 border-b border-amber-300 text-amber-900 px-6 py-2 text-xs flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              <b>{activePickTitle}</b> has requested to end the engagement — the
              workspace is <b>read-only</b> until a Partner accepts the
              disconnect from <b>Settings ▸ Clients</b>.
            </span>
          </div>
        )}

        <main className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 p-6">
          {section === 'dashboard' && <AgencyDashboardPage />}
          {section === 'tasks' && <AgencyTasksPage />}
          {section === 'sale-expense' && <AgencySaleExpensePage />}
          {section === 'declarations' && <AgencyTaxDeclarationsPage />}
          {section === 'settings-profile' && <AgencySettingsProfilePage />}
          {section === 'settings-users'   && <AgencySettingsUsersPage />}
          {section === 'settings-clients' && <AgencySettingsClientsPage />}
        </main>
      </div>
    </div>
  );
}

