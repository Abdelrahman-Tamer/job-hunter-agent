import { Injectable, signal } from '@angular/core';

export interface ToastMessage {
  id: number;
  message: string;
  type: 'success' | 'info' | 'error' | 'warning';
}

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  readonly toasts = signal<ToastMessage[]>([]);
  private nextId = 1;

  show(message: string, type: 'success' | 'info' | 'error' | 'warning' = 'success', duration = 3500): void {
    const id = this.nextId++;
    const toast: ToastMessage = { id, message, type };
    this.toasts.update((current) => [...current, toast]);

    setTimeout(() => {
      this.dismiss(id);
    }, duration);
  }

  dismiss(id: number): void {
    this.toasts.update((current) => current.filter((t) => t.id !== id));
  }
}
