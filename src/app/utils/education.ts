/**
 * Highest level of education reached, for the Employee record.
 *
 * Stored as a semantic key and shown as the abbreviation HR uses, so
 * the two can move independently: "BA" could become "Bachelor" and
 * "DH" could become "PhD" by editing a label here, with nothing in
 * the database to migrate.
 *
 * Null is not a sixth level. It means nobody has recorded one, which
 * is a different statement from "below diploma" — a column full of
 * under_diploma for staff who were simply never asked would be worse
 * than a column full of blanks.
 *
 * The order is lowest to highest, which is the order the pickers show
 * and the order a report would sort by, so it is kept here rather
 * than left to whatever each caller happens to type.
 */

export type EducationLevel =
  | 'under_diploma'
  | 'diploma'
  | 'bachelor'
  | 'master'
  | 'doctorate';

export const EDUCATION_OPTIONS: { value: EducationLevel; label: string }[] = [
  { value: 'under_diploma', label: 'Under Diploma' },
  { value: 'diploma',       label: 'Diploma' },
  { value: 'bachelor',      label: 'BA' },
  { value: 'master',        label: 'MA' },
  { value: 'doctorate',     label: 'DH' },
];

/** What to show for a stored value, including one the UI does not
 *  know — an older or newer key renders as itself rather than
 *  disappearing, so a wrong value is visible instead of silent. */
export function educationLabel(
  value: EducationLevel | string | null | undefined,
  empty = '—',
): string {
  if (!value) return empty;
  return EDUCATION_OPTIONS.find(o => o.value === value)?.label ?? value;
}
