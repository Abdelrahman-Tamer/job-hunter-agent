import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  input,
  output,
} from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
export type ButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'ui-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      [type]="type()"
      class="ui-btn"
      [attr.data-variant]="variant()"
      [attr.data-size]="size()"
      [disabled]="disabled() || loading()"
      [attr.aria-busy]="loading() || null"
      [attr.aria-label]="ariaLabel() || null"
      (click)="onClick($event)"
    >
      @if (loading()) {
        <span class="btn-spinner" aria-hidden="true"></span>
      }
      <span class="btn-content" [class.loading-fade]="loading()">
        <ng-content />
      </span>
    </button>
  `,
  styles: [`
    :host {
      display: inline-flex;
      vertical-align: middle;
    }

    .ui-btn {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      font-family: var(--font-sans);
      font-weight: 500;
      letter-spacing: var(--tracking-normal);
      border-radius: var(--radius-sm);
      border: 1px solid transparent;
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
      text-decoration: none;
      outline: none;
      transition:
        background-color var(--dur-fast) var(--ease-spring),
        border-color var(--dur-fast) var(--ease-spring),
        color var(--dur-fast) var(--ease-spring),
        box-shadow var(--dur-fast) var(--ease-spring),
        transform var(--dur-fast) var(--ease-spring);
    }

    .ui-btn:focus-visible {
      outline: 2px solid var(--accent-copper);
      outline-offset: 2px;
    }

    .ui-btn:active:not(:disabled) {
      transform: scale(0.985);
    }

    /* Sizes */
    .ui-btn[data-size="sm"] {
      height: 28px;
      padding: var(--space-1) var(--space-2-5);
      font-size: var(--text-xs);
      border-radius: var(--radius-xs);
    }

    .ui-btn[data-size="md"] {
      height: 36px;
      padding: var(--space-2) var(--space-3-5);
      font-size: var(--text-sm);
    }

    .ui-btn[data-size="lg"] {
      height: 42px;
      padding: var(--space-2-5) var(--space-5);
      font-size: var(--text-base);
      border-radius: var(--radius-md);
    }

    /* Primary — Warm Copper with Subtle Top Specular Highlight */
    .ui-btn[data-variant="primary"] {
      background-color: var(--accent-copper);
      color: #FFFFFF;
      font-weight: 600;
      border-color: var(--accent-copper);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22), var(--shadow-xs);
    }

    .ui-btn[data-variant="primary"]:hover:not(:disabled) {
      background-color: var(--accent-copper-hover);
      border-color: var(--accent-copper-hover);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2), var(--shadow-copper);
    }

    .ui-btn[data-variant="primary"]:active:not(:disabled) {
      background-color: var(--accent-copper-active);
      border-color: var(--accent-copper-active);
    }

    /* Secondary — Frosted Glass Hairline */
    .ui-btn[data-variant="secondary"] {
      background-color: var(--surface-glass);
      backdrop-filter: var(--blur-glass);
      -webkit-backdrop-filter: var(--blur-glass);
      color: var(--ink-primary);
      border-color: var(--border-hairline);
      box-shadow: var(--border-specular-sm), var(--shadow-xs);
    }

    .ui-btn[data-variant="secondary"]:hover:not(:disabled) {
      background-color: var(--surface-elevated);
      border-color: var(--border-strong);
      box-shadow: var(--border-specular-hover), var(--shadow-sm);
    }

    /* Subtle — Soft Tonal Fill */
    .ui-btn[data-variant="subtle"] {
      background-color: var(--surface-subtle);
      color: var(--ink-primary);
      border-color: var(--border-hairline);
    }

    .ui-btn[data-variant="subtle"]:hover:not(:disabled) {
      background-color: var(--surface-muted);
      border-color: var(--border-strong);
    }

    /* Ghost — Quiet Architectural Action */
    .ui-btn[data-variant="ghost"] {
      background-color: transparent;
      color: var(--ink-secondary);
      border-color: transparent;
    }

    .ui-btn[data-variant="ghost"]:hover:not(:disabled) {
      background-color: var(--surface-hover);
      color: var(--ink-primary);
    }

    /* Danger — Semantic Crimson */
    .ui-btn[data-variant="danger"] {
      background-color: var(--semantic-crimson-soft);
      color: var(--semantic-crimson-text);
      border-color: var(--semantic-crimson-border);
    }

    .ui-btn[data-variant="danger"]:hover:not(:disabled) {
      background-color: rgba(220, 38, 38, 0.2);
      border-color: var(--semantic-crimson);
    }

    .ui-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
      pointer-events: none;
      transform: none;
    }

    .btn-content {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      transition: opacity var(--dur-fast) var(--ease-spring);
    }

    .btn-content.loading-fade {
      opacity: 0;
    }

    /* Smooth Spinner */
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
  readonly variant = input<ButtonVariant>('secondary');
  readonly size = input<ButtonSize>('md');
  readonly loading = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly ariaLabel = input<string | undefined>(undefined);

  readonly clicked = output<MouseEvent>();

  onClick(event: MouseEvent): void {
    if (!this.disabled() && !this.loading()) {
      this.clicked.emit(event);
    }
  }
}
