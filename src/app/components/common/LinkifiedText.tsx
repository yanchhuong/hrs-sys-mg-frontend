import React from 'react';

/**
 * v-linkified-notes — render a free-text string with URLs, tel: links,
 * and phone numbers turned into clickable anchors.
 *
 * <p>Used by places that display operator- or customer-typed notes
 * (invoice notes, bill notes, public-invoice view, POS receipt).
 * Print templates should keep the plain string — anchors don't
 * render as clickable on paper and the underline visual is
 * distracting.</p>
 *
 * <p>Detected patterns:</p>
 * <ul>
 *   <li><b>URLs</b>: {@code https?://…} — opens in a new tab.
 *       Includes Google Maps deep links, `goo.gl/maps`, tenant
 *       shop links, tracking URLs.</li>
 *   <li><b>Phone numbers</b>: 6+ digits following the ☎ / phone
 *       glyph OR standalone `+855…` / `0xx xxx xxx` runs. Renders
 *       as `tel:` so the OS opens the dial pad.</li>
 * </ul>
 *
 * <p>Anchors carry {@code target="_blank" rel="noopener noreferrer"}
 * so a hostile link can't reference {@code window.opener}. The
 * surrounding {@code whitespace-pre-wrap} on the caller side
 * preserves newlines the operator entered — this component only
 * touches inline runs.</p>
 */

// ORDER MATTERS: URLs first (they may contain digits that would
// otherwise be swallowed by the phone matcher), then tel: schemes,
// then bare phone runs. Split-on-match preserves the surrounding
// text so the output alternates plain / link / plain / link / …
const URL_RE   = /(https?:\/\/[^\s]+)/gi;
const TEL_RE   = /(tel:[+0-9-]{6,})/gi;
// Phone: at least 6 digits after +country or a leading 0. Allow
// spaces / parens / dashes inside. Stops at any non-phone char.
const PHONE_RE = /(\+?\d[\d\s().-]{5,}\d)/g;

type Segment = { kind: 'text' | 'url' | 'tel'; value: string };

function tokenize(input: string): Segment[] {
  const segments: Segment[] = [{ kind: 'text', value: input }];
  const pass = (re: RegExp, kind: 'url' | 'tel') => {
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg.kind !== 'text') continue;
      const parts: Segment[] = [];
      let last = 0;
      for (const m of seg.value.matchAll(re)) {
        const start = m.index ?? 0;
        if (start > last) parts.push({ kind: 'text', value: seg.value.slice(last, start) });
        parts.push({ kind, value: m[0] });
        last = start + m[0].length;
      }
      if (last < seg.value.length) parts.push({ kind: 'text', value: seg.value.slice(last) });
      if (parts.length) {
        segments.splice(i, 1, ...parts);
        i += parts.length - 1;
      }
    }
  };
  pass(URL_RE, 'url');
  pass(TEL_RE, 'tel');
  // Phone pass — reuse the same tel bucket. `PHONE_RE` runs on
  // remaining text segments so URL bodies (which contain digits)
  // don't get mangled.
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.kind !== 'text') continue;
    const parts: Segment[] = [];
    let last = 0;
    for (const m of seg.value.matchAll(PHONE_RE)) {
      const start = m.index ?? 0;
      const digits = m[0].replace(/[^\d+]/g, '');
      if (digits.replace(/^\+/, '').length < 6) continue;
      if (start > last) parts.push({ kind: 'text', value: seg.value.slice(last, start) });
      parts.push({ kind: 'tel', value: m[0] });
      last = start + m[0].length;
    }
    if (last < seg.value.length) parts.push({ kind: 'text', value: seg.value.slice(last) });
    if (parts.length) {
      segments.splice(i, 1, ...parts);
      i += parts.length - 1;
    }
  }
  return segments;
}

interface Props {
  text: string;
  className?: string;
}

export function LinkifiedText({ text, className }: Props): JSX.Element {
  const segments = tokenize(text);
  return (
    <span className={className}>
      {segments.map((seg, i) => {
        if (seg.kind === 'url') {
          return (
            <a
              key={i}
              href={seg.value}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700 underline break-all"
            >
              {seg.value}
            </a>
          );
        }
        if (seg.kind === 'tel') {
          const href = seg.value.startsWith('tel:')
            ? seg.value
            : `tel:${seg.value.replace(/[^\d+]/g, '')}`;
          return (
            <a
              key={i}
              href={href}
              className="text-blue-600 hover:text-blue-700 underline"
            >
              {seg.value.replace(/^tel:/, '')}
            </a>
          );
        }
        return <React.Fragment key={i}>{seg.value}</React.Fragment>;
      })}
    </span>
  );
}
