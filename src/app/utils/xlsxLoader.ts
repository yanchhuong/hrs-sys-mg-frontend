/**
 * v-perf-lazy-xlsx — shared dynamic-import shim for the xlsx library.
 *
 * The library is ~600 kB gz — the heaviest single dep in the app —
 * and it's only touched from user-triggered Excel Import / Export
 * flows. Loading it on demand keeps it out of the initial bundle
 * entirely.
 *
 * The Promise is cached so 17 different utility files all racing to
 * load it (multi-file bulk parser, template renderer, exporter, etc.)
 * only kick off ONE chunk fetch. Once resolved, subsequent calls
 * return the same module namespace synchronously via the Promise's
 * resolved state.
 *
 * Usage:
 *   const XLSX = await loadXlsx();
 *   const wb = XLSX.read(...);
 *
 * Callers must be `async`. Every current site already returns a
 * Promise (Import parses a File; Export writes a workbook after a
 * button click), so the conversion is drop-in.
 */
let cached: Promise<typeof import('xlsx')> | null = null;

export function loadXlsx(): Promise<typeof import('xlsx')> {
  if (!cached) cached = import('xlsx');
  return cached;
}
