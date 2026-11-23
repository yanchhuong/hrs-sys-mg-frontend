/**
 * v-dialog-describedby — a dialog without a description no longer points
 * screen readers at nothing, and the console stops saying
 *   "Warning: Missing `Description` or `aria-describedby={undefined}`
 *    for {DialogContent}."
 *
 * Radix gives every Dialog / Sheet content `aria-describedby` = the id
 * its Description would have. When no Description is rendered, that id
 * matches no element: an invalid ARIA reference, which Radix reports
 * with the warning above when the dialog opens. ~150 dialogs share
 * DialogContent and many have only a title, so this is fixed once here
 * instead of adding `aria-describedby={undefined}` to each.
 *
 * How: the content's ref (attached in React's layout phase, before
 * Radix's passive-effect check reads the attribute) drops a reference
 * that resolves to nothing. A Description that appears later — after
 * data loads — puts the link back from its own ref. A dialog with a
 * Description from the start is untouched.
 */
import * as React from "react";

/** Ref for a Dialog / Sheet content node; passes the node on to `forwardedRef`. */
export function useDescribedByGuard<T extends HTMLElement>(
  forwardedRef?: React.ForwardedRef<T>,
): React.RefCallback<T> {
  return React.useCallback(
    (node: T | null) => {
      if (node) {
        const id = node.getAttribute("aria-describedby");
        if (id && !node.ownerDocument.getElementById(id)) node.removeAttribute("aria-describedby");
      }
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef],
  );
}

/** Ref for a Description: relinks its dialog when it rendered after the
 *  dialog opened (the guard above had nothing to link to then). */
export function relinkDescription(node: HTMLElement | null): void {
  if (!node?.id) return;
  const content = node.closest('[role="dialog"]');
  if (content && !content.hasAttribute("aria-describedby")) {
    content.setAttribute("aria-describedby", node.id);
  }
}
