import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Loader2, Building2, Mail, Phone } from 'lucide-react';
import * as agencyApi from '../../../api/agency';
import * as tasksApi from '../../../api/agencyTasks';
import type { AgencyMeResponse } from '../../../api/agency';
import { PageTitleTooltip } from './PageTitleTooltip';

/**
 * v-agency-settings-subpages — Settings ▸ Company profile. Agency's
 * own name / slug / status / contact info. Read-only for MVP; the
 * write surface stays on Super Admin.
 */
export function AgencySettingsProfilePage() {
  const [me, setMe] = useState<AgencyMeResponse | null>(null);
  const [membersCount, setMembersCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      agencyApi.me().catch(() => null),
      tasksApi.members.list().then(list => list.length).catch(() => 0),
    ]).then(([m, n]) => {
      setMe(m);
      setMembersCount(n);
    }).finally(() => setLoading(false));
  }, []);

  const agency = me?.agency;

  if (loading && !me) {
    return (
      <div className=" flex items-center justify-center py-24 text-sm text-gray-500 gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading profile…
      </div>
    );
  }

  return (
    <div className=" space-y-4">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Building2 className="h-5 w-5 text-blue-600" />
          Company profile
          <PageTitleTooltip label="About Company profile">
            The agency's own profile — name, slug, contact info, engagement
            status. Super Admin holds the write surface today; edit landing
            here is a follow-up.
          </PageTitleTooltip>
        </h1>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-blue-600" />
            Agency profile
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {!agency ? (
            <p className="text-xs text-gray-500">Could not load agency profile.</p>
          ) : (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              <ProfileRow label="Name" value={agency.name} />
              <ProfileRow label="Slug" value={agency.slug} mono />
              <ProfileRow label="Status" value={
                <Badge variant="outline" className="text-[10px] capitalize">{agency.status}</Badge>
              } />
              <ProfileRow label="Members" value={<span className="tabular-nums">{membersCount}</span>} />
              <ProfileRow label="Contact email" value={
                agency.contactEmail
                  ? <a href={`mailto:${agency.contactEmail}`} className="text-blue-600 hover:underline inline-flex items-center gap-1">
                      <Mail className="h-3 w-3" /> {agency.contactEmail}
                    </a>
                  : <span className="text-gray-400 italic">Not set</span>
              } />
              <ProfileRow label="Contact phone" value={
                agency.contactPhone
                  ? <span className="inline-flex items-center gap-1 tabular-nums">
                      <Phone className="h-3 w-3 text-gray-400" /> {agency.contactPhone}
                    </span>
                  : <span className="text-gray-400 italic">Not set</span>
              } />
            </dl>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProfileRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] uppercase text-gray-500 font-medium">{label}</dt>
      <dd className={`mt-0.5 text-sm text-gray-900 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}
