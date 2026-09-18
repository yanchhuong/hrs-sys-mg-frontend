/**
 * v-id-type-single-source (V352) — the one place that knows how an
 * employee's ID document type is represented.
 *
 * `nationalityType` ('national_id' | 'passport') is the SOURCE OF TRUTH.
 * `tidType` ('TID' | 'PA') is a derived shorthand stored alongside it.
 * Every writer must send both, derived through {@link tidTypeFor} — the
 * UI used to expose them as two independent selects, which let HR save a
 * row claiming "National ID" and "PA" at the same time.
 *
 * NOTE on the column's history: V301 introduced `tid_type` meaning
 * something else — 'PA' = personal account, 'TID' = tax id, a document
 * family for the NUMBER, orthogonal to nationality. V352 reinterprets
 * those two values as passport / national ID. That is safe only because
 * no row ever used the original meaning (census 2026-09-18: 244 of 246
 * rows have both columns NULL; the two that are set already agree with
 * the new reading). A `tid_type = 'PA'` row whose nationality is not
 * passport is V301-era data — resolve it by hand, do not assume passport.
 */

export type NationalityType = 'national_id' | 'passport';
export type TidType = 'PA' | 'TID';

/** Options for every ID-type picker in the app, in display order. */
export const ID_TYPE_OPTIONS: ReadonlyArray<{ value: NationalityType; label: string }> = [
  { value: 'national_id', label: 'National ID' },
  { value: 'passport', label: 'Passport' },
];

/**
 * The stored shorthand for a nationality type. Unset reads as
 * national_id / 'TID', matching the label the UI used before V300.
 */
export const tidTypeFor = (n: NationalityType | undefined | null): TidType =>
  n === 'passport' ? 'PA' : 'TID';

/** Human label for a nationality type. Unset reads as National ID. */
export const idTypeLabel = (n: NationalityType | undefined | null): string =>
  n === 'passport' ? 'Passport' : 'National ID';

/**
 * A visa expiry date is only meaningful on a passport row (V300). Use
 * this wherever a payload is built so a stale date can't survive a
 * switch back to National ID, and so an orphan date never reaches the
 * column for the next writer to trip over.
 */
export const visaExpireFor = (
  n: NationalityType | undefined | null,
  date: string | undefined | null,
): string | null => (n === 'passport' ? (date ?? null) : null);

/**
 * Parse an ID Type cell from an uploaded spreadsheet.
 *
 * Returns `undefined` for a blank cell, which means LEAVE UNSET — not
 * national_id. This deliberately differs from the details drawer, where
 * the select shows "National ID" as its default and a human is looking
 * at it before saving. An import has no such confirmation, so defaulting
 * would stamp a document type onto every row of a file that never had
 * the column, and on a re-import would silently convert passport holders
 * whose type simply wasn't exported.
 *
 * Returns `null` for a non-blank cell that matches nothing, so callers
 * can raise a row error rather than guess.
 *
 * 'PA' and 'TID' are accepted because that is what the pre-V352 UI put
 * on screen, so hand-maintained rosters and older exports carry them.
 */
export function parseIdTypeCell(raw: unknown): NationalityType | undefined | null {
  if (raw == null) return undefined;
  const v = String(raw).trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (!v) return undefined;
  if (v === 'passport' || v === 'pa') return 'passport';
  if (v === 'nationalid' || v === 'national' || v === 'tid' || v === 'id') return 'national_id';
  return null;
}

/** The value written to an exported ID Type cell. Blank when unset, so
 *  a round-trip through Excel doesn't invent a type. See
 *  {@link parseIdTypeCell}. */
export const formatIdTypeCell = (n: NationalityType | undefined | null): string =>
  n ? idTypeLabel(n) : '';
