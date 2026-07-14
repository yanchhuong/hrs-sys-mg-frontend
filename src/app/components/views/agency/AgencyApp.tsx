import { useMemo, useState } from 'react';
import { Building2, LogOut, LayoutDashboard, Users, Briefcase, Calendar, FileText, ShieldAlert, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../context/AuthContext';
import { useAgencyClient } from '../../../context/AgencyClientContext';
import { Button } from '../../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { AgencyDashboardPage } from './AgencyDashboardPage';
import { AgencyPortfolioPage } from './AgencyPortfolioPage';
import { AgencyCasesPage } from './AgencyCasesPage';
import { AgencyTaxCalendarPage } from './AgencyTaxCalendarPage';
import { AgencyDeliverablesPage } from './AgencyDeliverablesPage';
import { AgencyAnomaliesPage } from './AgencyAnomaliesPage';

type Section = 'dashboard' | 'portfolio' | 'cases' | 'tax' | 'deliverables' | 'anomalies';

interface NavItem {
  key: Section;
  label: string;
  icon: React.ReactNode;
  /** True → the item requires a picked client. Portfolio doesn't. */
  requiresClient: boolean;
}

const NAV: NavItem[] = [
  { key: 'dashboard',    label: 'Dashboard',    icon: <LayoutDashboard className="h-4 w-4" />, requiresClient: false },
  { key: 'portfolio',    label: 'Portfolio',    icon: <Users className="h-4 w-4" />,           requiresClient: false },
  { key: 'cases',        label: 'Cases',        icon: <Briefcase className="h-4 w-4" />,       requiresClient: false },
  { key: 'tax',          label: 'Tax Calendar', icon: <Calendar className="h-4 w-4" />,        requiresClient: true },
  { key: 'deliverables', label: 'Deliverables', icon: <FileText className="h-4 w-4" />,        requiresClient: false },
  { key: 'anomalies',    label: 'Anomalies',    icon: <ShieldAlert className="h-4 w-4" />,     requiresClient: true },
];

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

  const agencyName = currentUser?.name || currentUser?.email || 'Agency';
  const activePickTitle = useMemo(
    () => portfolio.find(c => c.tenantId === activeClientId)?.tenantName ?? '',
    [portfolio, activeClientId],
  );

  return (
    <div className="flex h-screen bg-gray-50">
      {/* ---- Sidebar ---- */}
      <aside className="w-56 bg-white border-r flex flex-col">
        <div className="px-4 py-4 border-b flex items-center gap-2">
          <Building2 className="h-5 w-5 text-blue-600" />
          <div className="min-w-0">
            <div className="text-xs text-gray-500">Agency workspace</div>
            <div className="text-sm font-semibold truncate">{agencyName}</div>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {NAV.map(item => {
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
                {item.label}
              </button>
            );
          })}
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
        <header className="h-14 border-b bg-white flex items-center justify-between px-4 shrink-0">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-gray-500">
              {section === 'dashboard' ? 'Agency dashboard'
                : section === 'portfolio' ? 'Portfolio overview'
                : activePickTitle
                  ? `Working on: ${activePickTitle}`
                  : 'Pick a client Company to continue'}
            </div>
          </div>

          {/* Client picker — hidden on Dashboard + Portfolio
              (Portfolio IS the picker, Dashboard aggregates
              portfolio-wide); visible on every scoped page. */}
          {section !== 'portfolio' && section !== 'dashboard' && (
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
        </header>

        <main className="flex-1 overflow-auto p-6">
          {section === 'dashboard' && <AgencyDashboardPage />}
          {section === 'portfolio' && (
            <AgencyPortfolioPage onSelectClient={id => {
              setActiveClient(id);
              // Auto-advance to Cases when a client is picked from
              // the Portfolio grid — matches the natural workflow.
              setSection('cases');
              toast.success('Client selected — you\'re now working on their data');
            }} />
          )}
          {section === 'cases' && <AgencyCasesPage />}
          {section === 'tax' && <AgencyTaxCalendarPage />}
          {section === 'deliverables' && <AgencyDeliverablesPage />}
          {section === 'anomalies' && <AgencyAnomaliesPage />}
        </main>
      </div>
    </div>
  );
}

