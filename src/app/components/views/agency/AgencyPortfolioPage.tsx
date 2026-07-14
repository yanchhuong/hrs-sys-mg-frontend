import { Building2, ChevronRight, Loader2, Star } from 'lucide-react';
import { useAgencyClient } from '../../../context/AgencyClientContext';
import { Card, CardContent } from '../../ui/card';
import { Badge } from '../../ui/badge';

interface Props {
  /** Click handler wired by the shell — auto-advances the user to
   *  a client-scoped section (Cases) after they pick. */
  onSelectClient: (tenantId: string) => void;
}

/**
 * First page an agency user lands on. Grid of client cards from
 * /api/v1/agency/me → portfolio[]. Clicking a card sets the active
 * client (X-Client-Tenant) and advances to Cases.
 */
export function AgencyPortfolioPage({ onSelectClient }: Props) {
  const { portfolio, loading, activeClientId } = useAgencyClient();

  if (loading && portfolio.length === 0) {
    return (
      <div className="max-w-3xl mx-auto flex items-center justify-center py-24 text-sm text-gray-500 gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading your portfolio…
      </div>
    );
  }

  if (portfolio.length === 0) {
    return (
      <Card className="max-w-lg mx-auto">
        <CardContent className="py-12 text-center space-y-2">
          <Building2 className="h-10 w-10 mx-auto text-gray-300" />
          <div className="text-base font-medium">No clients assigned yet</div>
          <p className="text-sm text-gray-500">
            Ask your platform admin to engage your agency with a Company via
            <code className="mx-1">Super Admin → Agencies → Assignments</code>.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Client portfolio</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {portfolio.length} active engagement{portfolio.length === 1 ? '' : 's'}. Click a
          client to start working on their books, cases, tax calendar and deliverables.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {portfolio.map(client => {
          const isActive = client.tenantId === activeClientId;
          return (
            <button
              key={client.tenantId}
              type="button"
              onClick={() => onSelectClient(client.tenantId)}
              className={`text-left rounded-lg border transition group ${
                isActive
                  ? 'border-blue-400 shadow-sm bg-blue-50/40'
                  : 'border-gray-200 hover:border-gray-300 hover:shadow-sm bg-white'
              }`}
            >
              <div className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">
                      {client.tenantName ?? client.tenantSlug ?? client.tenantId}
                    </div>
                    {client.tenantSlug && (
                      <div className="text-[11px] text-gray-500 truncate">{client.tenantSlug}</div>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 shrink-0" />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {client.isPrimary && (
                    <Badge className="border-amber-200 bg-amber-50 text-amber-700 border text-[10px] px-1.5 py-0">
                      <Star className="h-2.5 w-2.5 mr-0.5" /> Primary
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {client.scope}
                  </Badge>
                  {isActive && (
                    <Badge className="border-blue-300 bg-blue-100 text-blue-700 border text-[10px] px-1.5 py-0">
                      Active
                    </Badge>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
