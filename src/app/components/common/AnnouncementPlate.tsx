/**
 * KOSIGN Internal Bulletin — announcement plate (V147).
 *
 * <p>Renders the same skeleton the {@code announcement-plates.html}
 * template uses: left rail (glyph + code + footnum), brand row,
 * kicker, bilingual title block, bilingual lede, 3-column facts row,
 * signature + stamp footer. Used by:
 * <ul>
 *   <li>New Announcement form — as a live preview alongside the
 *       editable fields (also the source for html2canvas capture).</li>
 *   <li>Detail dialog — when {@code richTemplate=true}.</li>
 * </ul>
 *
 * <p>Visuals are encoded inline rather than reading CSS vars, so an
 * html2canvas snapshot of this component renders correctly without
 * the surrounding stylesheet context.
 */

import { forwardRef } from 'react';
import type { AnnouncementType, FactRow } from '../../api/announcements';

export interface PlateProps {
  type: AnnouncementType;
  /** Per-tenant per-year bulletin number ("2026·07"). Still passed
   *  through so the foot-of-rail sequence stays meaningful, but the
   *  header strip's right-hand label now reads as a publish date
   *  instead of "No. YYYY·NN" — more readable to recipients who
   *  don't track the internal numbering. */
  bulletinNo?: string | null;
  /** Publish date as a Date or ISO/string; rendered DD-MM-YYYY in
   *  the header strip. Defaults to today when the form previews a
   *  not-yet-saved row. */
  publishDate?: Date | string | null;
  /** Tenant's company / brand name shown as the first half of the
   *  header strip ("Demo Company · HOLIDAY"). Falls back to a
   *  neutral label when blank so a not-yet-loaded value doesn't
   *  collapse the row. */
  companyName?: string | null;
  titleEn: string;
  titleKm?: string | null;
  bodyEn: string;
  bodyKm?: string | null;
  facts?: FactRow[];
  signature?: string | null;
  stamp?: string | null;
}

/** Human-readable type label rendered next to the company name in
 *  the header strip. Matches the rail's CODE so a reader sees the
 *  same tag in both spots. */
const TYPE_LABEL: Record<AnnouncementType, string> = {
  HOLIDAY: 'HOLIDAY',
  EVENTS:  'EVENT',
  NEWS:    'NEWS',
  OTHERS:  'NOTICE',
};

/** Type → accent colour + rail glyph + footnum prefix. */
const TYPE_SKIN: Record<AnnouncementType, { accent: string; glyph: string; code: string; footnum: string }> = {
  HOLIDAY: { accent: '#C4452C', glyph: '※', code: 'HOLIDAY', footnum: 'HOL' },
  EVENTS:  { accent: '#1F4D8A', glyph: '◆', code: 'EVENT',   footnum: 'EVT' },
  NEWS:    { accent: '#2C7A4B', glyph: '●', code: 'NEWS',    footnum: 'NWS' },
  OTHERS:  { accent: '#4A4E57', glyph: '※', code: 'NOTICE',  footnum: 'NTC' },
};

const INK_2 = '#4A4E57';
const RULE  = '#D9D6CE';
const MUTED = '#8A8B8F';
const PAPER = '#FFFFFF';
const KHMER_STACK = "'Noto Sans Khmer', 'Battambang', 'Khmer OS', system-ui, sans-serif";
const SANS_STACK  = "'Inter', system-ui, sans-serif";
const MONO_STACK  = "'JetBrains Mono', ui-monospace, monospace";

export const AnnouncementPlate = forwardRef<HTMLDivElement, PlateProps>(function AnnouncementPlate(
  {
    type, bulletinNo, publishDate, companyName,
    titleEn, titleKm,
    bodyEn, bodyKm, facts, signature, stamp,
  },
  ref,
) {
  const skin = TYPE_SKIN[type] ?? TYPE_SKIN.OTHERS;
  // Parse the foot-number from the bulletin "2026·07" → "07".
  // Fallback to "00" so the rail always has a value.
  const footSeq = bulletinNo?.split('·')[1] ?? '00';

  return (
    <div
      ref={ref}
      style={{
        display: 'grid',
        gridTemplateColumns: '88px 1fr',
        background: PAPER,
        border: `1px solid ${RULE}`,
        borderRadius: 4,
        fontFamily: SANS_STACK,
        color: '#14161A',
        overflow: 'hidden',
        // The plate has a fixed maxWidth so a wide container doesn't
        // stretch the lede past readability. Caller can override via
        // a wrapper if they really want full-width.
        maxWidth: 760,
      }}
    >
      {/* Left rail */}
      <aside
        style={{
          background: skin.accent,
          color: '#FFF',
          padding: '20px 12px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          alignItems: 'center',
          minHeight: 240,
        }}
      >
        <div style={{ fontFamily: MONO_STACK, fontSize: 32, lineHeight: 1, opacity: 0.9 }}>
          {skin.glyph}
        </div>
        <div style={{
          fontFamily: MONO_STACK, fontSize: 11, letterSpacing: 2,
          writingMode: 'vertical-rl', transform: 'rotate(180deg)',
          opacity: 0.85,
        }}>
          {skin.code}
        </div>
        <div style={{ fontFamily: MONO_STACK, fontSize: 10, opacity: 0.7 }}>
          {footSeq} / {skin.footnum}
        </div>
      </aside>

      {/* Body */}
      <div style={{ padding: '20px 24px' }}>
        {/* Brand + bulletin-no row. Format: "{Company Name} · {TYPE}"
            on the left, bulletin number on the right. Company name
            falls back to "Internal Bulletin" when the tenant hasn't
            filled in Settings → Company yet so the row never
            collapses. */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          paddingBottom: 10, borderBottom: `1px solid ${RULE}`, marginBottom: 12,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {(companyName && companyName.trim()) || 'Internal Bulletin'}
            <span style={{ color: skin.accent, padding: '0 6px' }}>·</span>
            <span style={{
              fontFamily: MONO_STACK, fontSize: 11, letterSpacing: 1.5,
              color: skin.accent, fontWeight: 600,
            }}>
              {TYPE_LABEL[type] ?? TYPE_LABEL.OTHERS}
            </span>
          </div>
          <div style={{ fontFamily: MONO_STACK, fontSize: 11, color: MUTED }}>
            {formatDDMMYYYY(publishDate)}
          </div>
        </div>

        {/* Title block */}
        <div style={{ marginBottom: 16 }}>
          {titleKm && (
            <h2 style={{
              fontFamily: KHMER_STACK, fontSize: 26, fontWeight: 700,
              lineHeight: 1.35, margin: 0, color: '#14161A',
            }}>
              {titleKm}
            </h2>
          )}
          <h3 style={{
            fontSize: 18, fontWeight: 600,
            lineHeight: 1.3, margin: titleKm ? '6px 0 0' : 0, color: INK_2,
          }}>
            {titleEn}
          </h3>
        </div>

        {/* Lede — bilingual two-column */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: bodyKm ? '1fr 1fr' : '1fr',
          gap: 18, marginBottom: 16,
        }}>
          {bodyKm && (
            <div>
              <div style={{
                fontFamily: MONO_STACK, fontSize: 10, color: MUTED,
                textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4,
              }}>
                សារខ្មែរ
              </div>
              <p style={{
                fontFamily: KHMER_STACK, fontSize: 13, lineHeight: 1.7,
                margin: 0, color: '#14161A', whiteSpace: 'pre-wrap',
              }}>
                {bodyKm}
              </p>
            </div>
          )}
          <div>
            {bodyKm && (
              <div style={{
                fontFamily: MONO_STACK, fontSize: 10, color: MUTED,
                textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4,
              }}>
                English Notice
              </div>
            )}
            <p style={{
              fontSize: 13, lineHeight: 1.55, margin: 0,
              color: INK_2, whiteSpace: 'pre-wrap',
            }}>
              {bodyEn}
            </p>
          </div>
        </div>

        {/* Facts strip — fixed 3 columns. Empty rows still occupy
            space so the grid stays balanced. */}
        {facts && facts.some(f => f.label || f.valueEn || f.valueKm) && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12, paddingTop: 12, borderTop: `1px solid ${RULE}`,
            marginBottom: 14,
          }}>
            {facts.slice(0, 3).map((f, i) => (
              <div key={i} style={{
                paddingRight: i < 2 ? 12 : 0,
                borderRight: i < 2 ? `1px solid ${RULE}` : 'none',
              }}>
                <div style={{
                  fontFamily: MONO_STACK, fontSize: 10, color: MUTED,
                  textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 3,
                }}>
                  {f.label || ' '}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#14161A' }}>
                  {f.valueEn || ' '}
                </div>
                {f.valueKm && (
                  <div style={{
                    fontFamily: KHMER_STACK, fontSize: 12, color: INK_2, marginTop: 2,
                  }}>
                    {f.valueKm}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Footer — signature + stamp */}
        {(signature || stamp) && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            paddingTop: 10, borderTop: `1px solid ${RULE}`,
          }}>
            <div style={{ fontSize: 11, color: INK_2, whiteSpace: 'pre-line' }}>
              {signature}
            </div>
            {stamp && (
              <div style={{
                fontFamily: MONO_STACK, fontSize: 10, letterSpacing: 2,
                textTransform: 'uppercase',
                color: skin.accent, border: `1.5px solid ${skin.accent}`,
                padding: '4px 10px', borderRadius: 2,
              }}>
                {stamp}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

/** Format a Date / ISO string as DD-MM-YYYY for the header strip.
 *  Falls back to today when the caller hasn't supplied a value (the
 *  composer's live preview, before the row is saved). Returns an
 *  empty string when the input parses to an invalid date so the
 *  header row doesn't render the literal "NaN-NaN-NaN". */
function formatDDMMYYYY(value: Date | string | null | undefined): string {
  const d = value == null ? new Date() : (value instanceof Date ? value : new Date(value));
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}
