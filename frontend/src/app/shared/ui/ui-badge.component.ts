import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type BadgeVariant = 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'social';
export type BadgeSize = 'sm' | 'md';

@Component({
  selector: 'ui-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span
      class="ui-badge"
      [attr.data-variant]="variant"
      [attr.data-size]="size"
    >
      <span *ngIf="dot" class="badge-dot" aria-hidden="true"></span>
      <span class="badge-content">
        <ng-content></ng-content>
      </span>
    </span>
  `,
  styles: [`
    :host {
      display: inline-flex;
      vertical-align: middle;
    }

    .ui-badge {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      font-family: var(--font-mono);
      font-weight: 500;
      border-radius: var(--radius-xs);
      border: 1px solid transparent;
      line-height: 1;
      white-space: nowrap;
      user-select: none;
      transition: all var(--motion-fast);
    }

    /* Sizes */
    .ui-badge[data-size="sm"] {
      padding: 2px 6px;
      font-size: var(--text-2xs);
      letter-spacing: 0.02em;
    }

    .ui-badge[data-size="md"] {
      padding: 3px 8px;
      font-size: var(--text-xs);
      letter-spacing: 0.01em;
    }

    /* Variants */
    .ui-badge[data-variant="default"] {
      background-color: var(--bg-surface-2);
      color: var(--text-secondary);
      border-color: var(--border-subtle);
    }

    .ui-badge[data-variant="brand"] {
      background-color: var(--brand-bg-subtle);
      color: var(--brand-accent);
      border-color: var(--brand-border-subtle);
    }

    .ui-badge[data-variant="success"] {
      background-color: var(--emerald-bg);
      color: var(--emerald-400);
      border-color: var(--emerald-border);
    }

    .ui-badge[data-variant="warning"] {
      background-color: var(--amber-bg);
      color: var(--amber-400);
      border-color: var(--amber-border);
    }

    .ui-badge[data-variant="danger"] {
      background-color: var(--rose-bg);
      color: var(--rose-400);
      border-color: var(--rose-border);
    }

    .ui-badge[data-variant="social"] {
      background-color: var(--sky-bg);
      color: var(--sky-400);
      border-color: var(--sky-border);
    }

    /* Dot */
    .badge-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background-color: currentColor;
      flex-shrink: 0;
    }

    .badge-content {
      display: inline-flex;
      align-items: center;
      gap: 3px;
    }
  `],
})
export class UiBadgeComponent {
  @Input() variant: BadgeVariant = 'default';
  @Input() size: BadgeSize = 'sm';
  @Input() dot: boolean = false;
}
