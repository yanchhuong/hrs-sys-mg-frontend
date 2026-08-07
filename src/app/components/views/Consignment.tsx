import { Handshake, Info } from 'lucide-react';
import { Card, CardContent } from '../ui/card';

/**
 * V308 — Consignment module placeholder. Phase 1 registers the
 * module in the sidebar + module catalog + permission matrix so
 * admins can toggle it on/off and grant permissions immediately;
 * the actual CRUD surface (list / add / receive-goods / settlement)
 * lands in Phase 2 per the operator's architecture doc.
 *
 * <p>Kept minimal on purpose — a real "coming soon" screen tells
 * the user the module is real (they see the menu leaf) without
 * pretending it works. The bullet list mirrors the doc's
 * responsibilities so an admin browsing the sidebar knows what
 * this module will do when it ships.</p>
 */
export function Consignment(): JSX.Element {
  return (
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="bg-amber-50 p-2 rounded-md">
          <Handshake className="h-5 w-5 text-amber-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Consignment</h1>
          <p className="text-sm text-gray-500">
            Supplier-owned goods you hold + sell + settle
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="py-8">
          <div className="flex items-start gap-3 mb-6">
            <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-sm text-gray-700">
              <p className="font-medium mb-1">Module registered — CRUD screens land in the next phase.</p>
              <p className="text-gray-600">
                The Consignment module is live in the permission matrix + tenant module catalog,
                so you can grant / revoke access per role today. The workflow below is what
                Phase 2 will add on this page.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Mirrors the responsibilities table in the architecture
                doc so admins reading this page can see the full
                shape of what's coming. */}
            <BulletCard
              title="Consignment"
              points={[
                'Track supplier ownership + agreement terms',
                'Draft → Active → Partially Settled → Settled → Closed',
                'Warehouse + commission structure per consignment',
              ]}
            />
            <BulletCard
              title="Movement Integration"
              points={[
                'Receive Goods → CONSIGNMENT_IN (+)',
                'POS / Invoice sale → CONSIGNMENT_SALE (−)',
                'Return to supplier → CONSIGNMENT_RETURN (−)',
                'One movement ledger — no parallel stock system',
              ]}
            />
            <BulletCard
              title="Adjustment"
              points={[
                'Physical count corrections against supplier stock',
                'Emits an ADJUSTMENT movement with owner = supplier',
                'Separate document type from Consignment',
              ]}
            />
            <BulletCard
              title="Settlement"
              points={[
                'Period-based supplier payout (weekly / monthly)',
                'Gross sales − commission − deductions = net owed',
                'Links back to a Payment on the Cashflow module',
              ]}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BulletCard({ title, points }: { title: string; points: string[] }) {
  return (
    <div className="rounded-md border bg-gray-50 p-3">
      <div className="text-sm font-semibold text-gray-800 mb-2">{title}</div>
      <ul className="text-xs text-gray-600 space-y-1">
        {points.map((p, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="text-gray-400 shrink-0">·</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
