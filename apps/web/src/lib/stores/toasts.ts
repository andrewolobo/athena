/**
 * Lightweight transient-toast store.
 *
 * Used by the Insight Builder pin / delete flows; can be reused
 * elsewhere by importing `pushToast`. Mounted once via Toaster.svelte
 * in the dashboard layout.
 *
 * Auto-dismiss is timer-based at push time. Users can also dismiss
 * manually via the close button rendered by the host component.
 */

import { writable } from "svelte/store";

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

export const toasts = writable<Toast[]>([]);
let nextId = 1;

/** Push a transient toast onto the stack. Returns the toast id so the
 *  caller can dismiss it programmatically before the timer fires. */
export function pushToast(
  type: ToastType,
  message: string,
  durationMs = 3500,
): number {
  const id = nextId++;
  toasts.update((current) => [...current, { id, type, message }]);
  setTimeout(() => dismissToast(id), durationMs);
  return id;
}

export function dismissToast(id: number): void {
  toasts.update((current) => current.filter((t) => t.id !== id));
}
