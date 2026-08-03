import { writable } from "svelte/store";

export type ToastVariant = "info" | "success" | "error";

export interface ToastAction {
  label: string;
  onClick: () => void | Promise<void>;
  dismissOnClick?: boolean;
}

export interface ToastLink {
  label: string;
  href: string;
  onClick?: () => void | Promise<void>;
}

export interface Toast {
  id: number;
  title: string;
  description?: string;
  descriptionFromEnd?: boolean;
  variant: ToastVariant;
  action?: ToastAction;
  link?: ToastLink;
  durationMs: number;
}

export interface ShowToastOptions {
  title: string;
  description?: string;
  descriptionFromEnd?: boolean;
  variant?: ToastVariant;
  action?: ToastAction;
  link?: ToastLink;
  durationMs?: number;
}

export const toasts = writable<Toast[]>([]);

let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export function showToast(opts: ShowToastOptions): number {
  const id = nextId++;
  const toast: Toast = {
    id,
    title: opts.title,
    description: opts.description,
    descriptionFromEnd: opts.descriptionFromEnd,
    variant: opts.variant ?? "info",
    action: opts.action,
    link: opts.link,
    durationMs: opts.durationMs ?? 6000,
  };
  toasts.update((list) => [...list, toast]);
  if (toast.durationMs > 0) {
    const handle = setTimeout(() => dismissToast(id), toast.durationMs);
    timers.set(id, handle);
  }
  return id;
}

export function dismissToast(id: number): void {
  const handle = timers.get(id);
  if (handle) {
    clearTimeout(handle);
    timers.delete(id);
  }
  toasts.update((list) => list.filter((t) => t.id !== id));
}

/** Update an existing visible toast, for example to reflect download progress. */
export function updateToast(id: number, patch: Partial<Omit<Toast, "id">>): void {
  toasts.update((list) => list.map((toast) => (toast.id === id ? { ...toast, ...patch } : toast)));
}
