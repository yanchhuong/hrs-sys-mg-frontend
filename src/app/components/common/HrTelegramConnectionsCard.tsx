/**
 * HrTelegramConnectionsCard — who is connected to the HR bot, and a
 * way to connect whoever isn't.
 *
 * v-hr-bot-settings. The Employees roster and User Management each
 * carry this state for the rows they already list, which was fine
 * while the bot was an employee thing. Since v-hr-bot-users one bot
 * serves both, and an admin with no employee record is reachable only
 * from the user side — so there was no single place to see who the
 * company had actually connected. This is that place.
 *
 * Rows come pre-joined from GET /hr-telegram/connections, one per
 * person: somebody who is both a user and an employee appears once,
 * keyed on the user, which is the id a link for them is written
 * against. {@link HrTelegramLinkCell} does the share / unlink, the
 * same component the two rosters use, so the three surfaces behave
 * identically.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { Users, Search, RefreshCw, Loader2 } from 'lucide-react';
import { TableRowsSkeleton } from './LoadingSkeletons';
import { HrTelegramLinkCell } from './HrTelegramLinkCell';
import * as hrBotApi from '../../api/hrTelegramBots';

type Filter = 'all' | 'connected' | 'not-connected';

interface Props {
  /** Null while no bot is registered — sharing links is impossible
   *  until one is, so the card says so instead of offering buttons
   *  that fail. */
  bot: hrBotApi.HrTelegramBot | null;
  /** False parks the load; a tab that isn't mounted shouldn't fetch. */
  active?: boolean;
  canShare?: boolean;
  canUnlink?: boolean;
}

export function HrTelegramConnectionsCard({
  bot, active = true, canShare = true, canUnlink = true,
}: Props) {
  const [rows, setRows] = useState<hrBotApi.HrTelegramConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await hrBotApi.listConnections());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load Telegram connections');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (active) void load(); }, [active, load]);

  const connectedCount = rows.filter(r => r.link).length;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(r => {
      if (filter === 'connected' && !r.link) return false;
      if (filter === 'not-connected' && r.link) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q)
        || (r.subtitle ?? '').toLowerCase().includes(q)
        || (r.link?.telegramUsername ?? '').toLowerCase().includes(q);
    });
  }, [rows, query, filter]);

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: `All (${rows.length})` },
    { key: 'connected', label: `Connected (${connectedCount})` },
    { key: 'not-connected', label: `Not connected (${rows.length - connectedCount})` },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Users className="h-4 w-4 text-sky-600" />
          Connections
          <span className="text-xs font-normal text-gray-500">
            employees and system users share one bot
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!bot && (
          <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-[11px] text-amber-800 leading-snug">
            Register the bot above first — connect links are minted from its token.
          </div>
        )}
        {bot && !bot.enabled && (
          <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-[11px] text-amber-800 leading-snug">
            The bot is disabled, so new links won't be generated and messages won't be delivered.
            Existing connections are kept.
          </div>
        )}

        {/* One horizontal line that scrolls rather than stacking —
            the filter-row pattern the list pages use. */}
        <div className="flex items-center gap-2 overflow-x-auto hover-scroll-x">
          <div className="relative shrink-0">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search name or @handle"
              className="h-8 w-56 pl-7 text-sm"
            />
          </div>
          {filters.map(f => (
            <Button
              key={f.key}
              size="sm"
              variant={filter === f.key ? 'default' : 'outline'}
              className="h-8 shrink-0 text-xs"
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 shrink-0 text-gray-500"
            onClick={() => void load()}
            disabled={loading}
            title="Reload"
          >
            {loading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>

        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-28">Kind</TableHead>
                <TableHead className="w-56">Telegram</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && rows.length === 0 ? (
                <TableRowsSkeleton rows={4} columns={3} />
              ) : shown.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-sm text-gray-500 py-6">
                    {rows.length === 0
                      ? 'Nobody to connect yet — add a user or an employee first.'
                      : 'No match.'}
                  </TableCell>
                </TableRow>
              ) : shown.map(r => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="text-sm font-medium">{r.name}</div>
                    {r.subtitle && (
                      <div className="text-[11px] text-gray-500 tabular-nums">{r.subtitle}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={r.kind === 'user'
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : 'bg-slate-50 text-slate-600 border-slate-200'}>
                      {r.kind === 'user' ? 'User' : 'Employee'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <HrTelegramLinkCell
                      name={r.name}
                      noun={r.kind}
                      linked={r.link}
                      canShare={canShare && !!bot?.enabled}
                      canUnlink={canUnlink}
                      onChanged={() => void load()}
                      generate={() => r.userId
                        ? hrBotApi.generateUserLink(r.userId)
                        : hrBotApi.generateLink(r.employeeId!)}
                      unlink={() => r.userId
                        ? hrBotApi.unlinkUser(r.userId)
                        : hrBotApi.unlinkEmployee(r.employeeId!)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
