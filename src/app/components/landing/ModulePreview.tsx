import type { Lang } from '../LandingPage';
import type { Tone, TriLang } from './moduleCategories';
import type { ModulePreviewSpec, PreviewCell, PreviewTone } from './modulePreviews';

/**
 * A module card's "screenshot": a small browser window drawing the
 * screen from its spec (modulePreviews.ts) in the category's colour.
 * Decorative — the card's title and text say what it is — so it is
 * hidden from screen readers.
 */

type Accent = { solid: string; soft: string; text: string; bar: string };

/** Static class strings per category tone, so Tailwind sees them. */
const ACCENT: Record<Tone, Accent> = {
  blue:    { solid: 'bg-blue-600 text-white',    soft: 'bg-blue-50 text-blue-700',       text: 'text-blue-700',    bar: 'bg-blue-500' },
  emerald: { solid: 'bg-emerald-600 text-white', soft: 'bg-emerald-50 text-emerald-700', text: 'text-emerald-700', bar: 'bg-emerald-500' },
  amber:   { solid: 'bg-amber-500 text-white',   soft: 'bg-amber-50 text-amber-700',     text: 'text-amber-700',   bar: 'bg-amber-500' },
  indigo:  { solid: 'bg-indigo-600 text-white',  soft: 'bg-indigo-50 text-indigo-700',   text: 'text-indigo-700',  bar: 'bg-indigo-500' },
  rose:    { solid: 'bg-rose-600 text-white',    soft: 'bg-rose-50 text-rose-700',       text: 'text-rose-700',    bar: 'bg-rose-500' },
  violet:  { solid: 'bg-violet-600 text-white',  soft: 'bg-violet-50 text-violet-700',   text: 'text-violet-700',  bar: 'bg-violet-500' },
  cyan:    { solid: 'bg-cyan-600 text-white',    soft: 'bg-cyan-50 text-cyan-700',       text: 'text-cyan-700',    bar: 'bg-cyan-500' },
  slate:   { solid: 'bg-slate-700 text-white',   soft: 'bg-slate-100 text-slate-700',    text: 'text-slate-700',   bar: 'bg-slate-500' },
  teal:    { solid: 'bg-teal-600 text-white',    soft: 'bg-teal-50 text-teal-700',       text: 'text-teal-700',    bar: 'bg-teal-500' },
  fuchsia: { solid: 'bg-fuchsia-600 text-white', soft: 'bg-fuchsia-50 text-fuchsia-700', text: 'text-fuchsia-700', bar: 'bg-fuchsia-500' },
};

const CHIP: Record<PreviewTone, string> = {
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red:   'bg-red-50 text-red-700',
  blue:  'bg-blue-50 text-blue-700',
  slate: 'bg-slate-100 text-slate-600',
};

const TO: TriLang    = { en: 'To', km: 'ជូន', zh: '致' };
const TOTAL: TriLang = { en: 'Total', km: 'សរុប', zh: '合计' };

const tr = (e: TriLang, lang: Lang) => e[lang] ?? e.en;

export function ModulePreview({ spec, tone, lang }: {
  spec: ModulePreviewSpec; tone: Tone; lang: Lang;
}) {
  const a = ACCENT[tone];
  return (
    <div aria-hidden className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm select-none">
      <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-3 py-2">
        <span className="h-2 w-2 shrink-0 rounded-full bg-red-400" />
        <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
        <span className="ml-2 min-w-0 flex-1 truncate rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-400">
          hr-share.com/{spec.path}
        </span>
      </div>
      {/* A fixed height, so the cards in a row line up. A list runs on
          past it and fades out like a page that scrolls; a document or
          the pay screen fits whole, so it gets no fade over its foot. */}
      {/* content-visibility: the browser skips drawing a preview that is
          off screen. Its height is fixed, so nothing shifts when it draws. */}
      <div className="relative h-52 overflow-hidden p-3 text-[11px] leading-snug text-slate-700 [content-visibility:auto] [contain-intrinsic-size:auto_208px]">
        {spec.kind === 'table' && <TableBody spec={spec} lang={lang} a={a} />}
        {spec.kind === 'doc' && <DocBody spec={spec} lang={lang} a={a} />}
        {spec.kind === 'tiles' && <TilesBody spec={spec} lang={lang} a={a} />}
        {spec.kind === 'payment' && <PaymentBody spec={spec} lang={lang} />}
        {(spec.kind === 'table' || spec.kind === 'tiles') && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-white to-transparent" />
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── table ───────────────────────── */

function TableBody({ spec, lang, a }: {
  spec: Extract<ModulePreviewSpec, { kind: 'table' }>; lang: Lang; a: Accent;
}) {
  const hide = (i: number) => (spec.columns[i]?.hideOnSmall ? 'hidden sm:table-cell' : '');
  const align = (i: number) => (spec.columns[i]?.align === 'right' ? 'text-right' : 'text-left');
  return (
    <>
      <Toolbar tabs={spec.tabs} action={spec.action} lang={lang} a={a} />
      <table className="mt-2 w-full table-fixed border-collapse">
        <thead>
          <tr className="text-[9px] uppercase tracking-wide text-slate-400">
            {spec.columns.map((c, i) => (
              <th key={i} className={`py-1 pr-1 font-semibold ${align(i)} ${c.width ?? ''} ${hide(i)}`}>
                <span className="block truncate">{tr(c.label, lang)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {spec.rows.map((row, r) => (
            <tr key={r} className="border-t border-slate-100">
              {row.map((cell, i) => (
                <td key={i} className={`py-1.5 pr-1 align-middle ${align(i)} ${hide(i)}`}>
                  <Cell cell={cell} lang={lang} a={a} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Cell({ cell, lang, a }: { cell: PreviewCell; lang: Lang; a: Accent }) {
  if (typeof cell === 'string') return <span className="block truncate text-slate-500">{cell}</span>;
  if ('num' in cell) return <span className="block truncate font-semibold tabular-nums text-slate-900">{cell.num}</span>;
  if ('chip' in cell) return <Chip label={tr(cell.chip, lang)} tone={cell.tone} />;
  if ('progress' in cell) {
    return (
      <div className="pr-2">
        <div className="h-1.5 rounded-full bg-slate-100">
          <div className={`h-1.5 rounded-full ${a.bar}`} style={{ width: `${cell.progress}%` }} />
        </div>
        {cell.label && <span className="mt-0.5 block truncate text-[9px] tabular-nums text-slate-400">{cell.label}</span>}
      </div>
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {cell.avatar && (
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[8px] font-bold ${a.soft}`}>
          {cell.avatar}
        </span>
      )}
      <div className="min-w-0">
        <span className="block truncate font-medium text-slate-900">{cell.main}</span>
        {cell.sub && <span className="block truncate text-[9px] text-slate-400">{cell.sub}</span>}
      </div>
    </div>
  );
}

function Chip({ label, tone }: { label: string; tone: PreviewTone }) {
  return (
    <span className={`inline-block max-w-full truncate rounded-full px-1.5 py-0.5 align-middle text-[9px] font-semibold ${CHIP[tone]}`}>
      {label}
    </span>
  );
}

function Toolbar({ tabs, action, lang, a, title }: {
  tabs?: TriLang[]; action?: TriLang; lang: Lang; a: Accent; title?: TriLang;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1">
        {title && <span className="truncate pr-1 text-xs font-semibold text-slate-900">{tr(title, lang)}</span>}
        {(tabs ?? []).map((tab, i) => (
          <span key={i} className={`truncate rounded-full px-2 py-0.5 text-[10px] font-medium ${i === 0 ? a.soft : 'text-slate-500'}`}>
            {tr(tab, lang)}
          </span>
        ))}
      </div>
      {action && (
        <span className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold ${a.solid}`}>+ {tr(action, lang)}</span>
      )}
    </div>
  );
}

/* ───────────────────────── document ───────────────────────── */

function DocBody({ spec, lang, a }: {
  spec: Extract<ModulePreviewSpec, { kind: 'doc' }>; lang: Lang; a: Accent;
}) {
  return (
    <div className="mx-auto max-w-[360px] rounded-md border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`truncate text-xs font-bold tracking-wide ${a.text}`}>{tr(spec.heading, lang)}</p>
          <p className="truncate text-[9px] text-slate-400">{spec.docNo} · {tr(spec.meta, lang)}</p>
        </div>
        {spec.badge && <Chip label={tr(spec.badge.label, lang)} tone={spec.badge.tone} />}
      </div>
      <p className="mt-1.5 truncate text-[10px]">
        <span className="text-slate-400">{tr(TO, lang)} </span>
        <span className="font-medium text-slate-900">{spec.party}</span>
      </p>
      <div className="mt-1.5 border-t border-slate-100">
        {spec.lines.map((l, i) => (
          <div key={i} className="flex items-center gap-2 border-b border-slate-50 py-1">
            <span className="min-w-0 flex-1 truncate">{l.name}</span>
            <span className="w-6 shrink-0 text-right tabular-nums text-slate-400">{l.qty}</span>
            <span className="w-16 shrink-0 text-right font-medium tabular-nums text-slate-900">{l.amount}</span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="truncate text-[10px] text-slate-500">{tr(spec.totalLabel ?? TOTAL, lang)}</span>
        <span className="shrink-0 text-sm font-bold tabular-nums text-slate-900">{spec.total}</span>
      </div>
      {spec.footer && (
        <div className={`mt-2 truncate rounded-md py-1 text-center text-[10px] font-semibold ${a.solid}`}>
          {tr(spec.footer, lang)}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── item tiles ───────────────────────── */

function TilesBody({ spec, lang, a }: {
  spec: Extract<ModulePreviewSpec, { kind: 'tiles' }>; lang: Lang; a: Accent;
}) {
  return (
    <>
      <Toolbar title={spec.title} action={spec.action} lang={lang} a={a} />
      {spec.chips && (
        <div className="mt-1.5 flex gap-1 overflow-hidden">
          {spec.chips.map((c, i) => (
            <span key={i} className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] ${i === 0 ? `border-transparent ${a.soft}` : 'border-slate-200 text-slate-500'}`}>
              {tr(c, lang)}
            </span>
          ))}
        </div>
      )}
      <div className="mt-2 grid grid-cols-3 gap-2">
        {spec.tiles.map((t, i) => (
          <div key={i} className="overflow-hidden rounded-lg border border-slate-100">
            <div className={`flex h-10 items-center justify-center bg-gradient-to-br ${t.color} text-sm font-bold text-white/90`}>
              {t.name.charAt(0)}
            </div>
            <div className="px-1.5 py-1">
              <p className="truncate text-[10px] font-medium text-slate-900">{t.name}</p>
              <div className="flex items-center justify-between gap-1">
                <span className="truncate text-[9px] text-slate-400">{t.sku}</span>
                <span className={`text-[9px] font-semibold tabular-nums ${t.low ? 'text-red-600' : 'text-slate-600'}`}>{t.qty}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ───────────────────────── KHQR payment ───────────────────────── */

function PaymentBody({ spec, lang }: {
  spec: Extract<ModulePreviewSpec, { kind: 'payment' }>; lang: Lang;
}) {
  return (
    <div className="flex gap-3">
      <div className="w-28 shrink-0 overflow-hidden rounded-lg border border-slate-200 shadow-sm">
        <div className="bg-red-600 py-1 text-center text-[10px] font-bold tracking-wider text-white">KHQR</div>
        <div className="px-2 py-1.5 text-center">
          <p className="truncate text-[9px] text-slate-400">{spec.merchant}</p>
          <p className="text-sm font-bold tabular-nums text-slate-900">{spec.amount}</p>
          <QrGlyph />
          <p className="mt-1 text-[8px] leading-tight text-slate-400">{tr(spec.scanLabel, lang)}</p>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] font-semibold text-slate-900">{tr(spec.listTitle, lang)}</p>
        {spec.methods.map((m, i) => (
          <div key={i} className="flex items-center gap-2 border-b border-slate-100 py-1.5">
            <Chip label={tr(m.label, lang)} tone={m.tone} />
            <span className="min-w-0 flex-1 truncate text-[9px] text-slate-400">{m.ref}</span>
            <span className="shrink-0 font-semibold tabular-nums text-slate-900">{m.amount}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A made-up QR pattern: the three corner finder squares a reader
 *  expects, and a fixed scatter of modules between them. It encodes
 *  nothing. Built once. */
const QR_SIZE = 25;
const QR_PATH = (() => {
  let seed = 20261106;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const corners = [[0, 0], [QR_SIZE - 7, 0], [0, QR_SIZE - 7]];
  const inFinderZone = (x: number, y: number) =>
    (x < 8 && y < 8) || (x >= QR_SIZE - 8 && y < 8) || (x < 8 && y >= QR_SIZE - 8);
  let d = '';
  for (const [ox, oy] of corners) {
    for (let j = 0; j < 7; j++) {
      for (let i = 0; i < 7; i++) {
        const ring = i === 0 || i === 6 || j === 0 || j === 6;
        const core = i >= 2 && i <= 4 && j >= 2 && j <= 4;
        if (ring || core) d += `M${ox + i} ${oy + j}h1v1h-1z`;
      }
    }
  }
  for (let y = 0; y < QR_SIZE; y++) {
    for (let x = 0; x < QR_SIZE; x++) {
      if (!inFinderZone(x, y) && rnd() > 0.52) d += `M${x} ${y}h1v1h-1z`;
    }
  }
  return d;
})();

function QrGlyph() {
  return (
    <svg viewBox={`-1 -1 ${QR_SIZE + 2} ${QR_SIZE + 2}`} className="mx-auto mt-1 h-16 w-16" shapeRendering="crispEdges">
      <rect x={-1} y={-1} width={QR_SIZE + 2} height={QR_SIZE + 2} fill="white" />
      <path d={QR_PATH} fill="#0f172a" />
    </svg>
  );
}
