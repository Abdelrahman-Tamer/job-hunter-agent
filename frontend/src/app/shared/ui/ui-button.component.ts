import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

@Component({
  selector: 'ui-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      [type]="type"
      class="ui-btn"
      [attr.data-variant]="variant"
      [attr.data-size]="size"
      [disabled]="disabled || loading"
      [attr.aria-label]="ariaLabel || null"
      (click)="onClick($event)"
    >
      <span *ngIf="loading" class="btn-spinner" aria-hidden="true"></span>
      <span class="btn-content" [class.loading-fade]="loading">
        <ng-content></ng-content>
      </span>
    </button>
  `,
  styles: [`
    :host {
      display: inline-flex;
      vertical-align: middle;
    }

    .ui-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      font-family: var(--font-sans);
      font-weight: 500;
      border-radius: var(--radius-sm);
      border: 1px solid transparent;
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
      text-decoration: none;
      transition: all var(--motion-fast);
      position: relative;
    }

    /* Sizes */
    .ui-btn[data-size="sm"] {
      padding: var(--space-1) var(--space-2-5);
      font-size: var(--text-xs);
      border-radius: var(--radius-xs);
      height: 28px;
    }

    .ui-btn[data-size="md"] {
      padding: var(--space-2) var(--space-3);
      font-size: var(--text-sm);
      height: 36px;
    }

    /* Variants */
    .ui-btn[data-variant="primary"] {
      background-color: var(--brand-primary);
      color: #ffffff;
      border-color: var(--brand-primary);
    }

    .ui-btn[data-variant="primary"]:hover:not(:disabled) {
      background-color: var(--brand-primary-hover);
      border-color: var(--brand-primary-hover);
      box-shadow: var(--shadow-glow-brand);
    }

    .ui-btn[data-variant="secondary"] {
      background-color: var(--bg-surface-2);
      color: var(--text-primary);
      border-color: var(--border-default);
    }

    .ui-btn[data-variant="secondary"]:hover:not(:disabled) {
      background-color: var(--bg-surface-3);
      border-color: var(--border-strong);
    }

    .ui-btn[data-variant="ghost"] {
      background-color: transparent;
      color: var(--text-secondary);
      border-color: transparent;
    }

    .ui-btn[data-variant="ghost"]:hover:not(:disabled) {
      background-color: var(--bg-surface-hover);
      color: var(--text-primary);
    }

    .ui-btn[data-variant="danger"] {
      background-color: var(--rose-bg);
      color: var(--rose-400);
      border-color: var(--rose-border);
    }

    .ui-btn[data-variant="danger"]:hover:not(:disabled) {
      background-color: rgba(244, 63, 94, 0.2);
    }

    .ui-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
      pointer-events: none;
    }

    .btn-content {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
    }

    .btn-content.loading-fade {
      opacity: 0;
    }

    /* Spinner */
    .btn-spinner {
      position: absolute;
      width: 14px;
      height: 14px;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      animation: spin 0.65s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `],
})
export class UiButtonComponent {
  @Input() variant: ButtonVariant = 'secondary';
  @Input() size: ButtonSize = 'md';
  @Input() loading: boolean = false;
  @Input() disabled: boolean = false;
  @Input() type: 'button' | 'submit' = 'button';
  @Input() ariaLabel?: string;

  @Output() clicked = new EventEmitter<MouseEvent>();

  onClick(event: MouseEvent): void {
    if (!this.disabled && !this.loading) {
      this.clicked.emit(event);
    }
  }
}
