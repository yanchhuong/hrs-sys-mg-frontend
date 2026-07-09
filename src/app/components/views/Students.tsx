import { Customers } from './Customers';

/**
 * Students — School-branded view over the same {@code customers}
 * table (v-school-students). Per [[erp-core-engine-vision]] Student
 * = Customer with a filtered UI lens, no separate table.
 *
 * <p>One-line wrapper — {@link Customers} swaps its top-level
 * labels (page title, buttons, dialog title, tooltips, toasts) and
 * hides business + clinical fields when {@code presentAs='student'}.
 * Instead it surfaces the school-only trio: Student No, Guardian
 * Name / Phone / Email. Data, permissions, backend endpoints —
 * all identical to Customers / Patients.</p>
 *
 * <p>Sidebar visibility gates on the {@code enrollment} module so
 * a pure-Sale tenant never sees Students; a School-Base tenant
 * sees Students under Education without the Customer accounting
 * lens.</p>
 */
export function Students() {
  return <Customers presentAs="student" />;
}
