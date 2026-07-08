import { Customers } from './Customers';

/**
 * Patients — Hospital-branded view over the same {@code customers}
 * table (v-hospital-patients-view). Per [[erp-core-engine-vision]]
 * Patient = Customer with a filtered UI lens, no separate table.
 *
 * <p>This is a one-line wrapper — the underlying {@link Customers}
 * component swaps its top-level labels (page title, buttons, dialog
 * title, tooltips, toasts) when {@code presentAs='patient'}. Data,
 * form fields, permissions, backend endpoints — all identical.</p>
 *
 * <p>Both this leaf AND the Customers leaf can be visible on a
 * multi-Base tenant (POS + Hospital); each acts as a different UI
 * lens over the same data. A pure-Hospital tenant sees only
 * Patients under Healthcare; a pure-POS tenant sees only Customers
 * under Sale.</p>
 */
export function Patients() {
  return <Customers presentAs="patient" />;
}
