import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
} from '@angular/core';

export type BadgeTone = 'neutral' | 'copper' | 'emerald' | 'amber' | 'crimson' | 'glass';
export type BadgeVariant = 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'social';
export type BadgeSize = 'sm' | 'md';

const LEGACY_VARIANT_TONE_MAP: Record<BadgeVariant, BadgeTone> = {
  default: 'neutral',
  brand: 'copper',
  success: 'emerald',
  warning: 'amber',
  danger: 'crimson',
  social: 'glass',
};

@Component({
  selector: 'ui-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="ui-badge"
      [attr.data-tone]="resolvedTone()"
      [attr.data-size]="size()"
      [class.is-mono]="mono()"
    >
      @if (dot()) {
        <span class="badge-dot" aria-hidden="true"></span>
      }
      <span class="badge-content">
        <ng-content />
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
      gap: 5px;
      font-family: var(--font-sans);
      font-weight: 500;
      border-radius: var(--radius-full);
      border: 1px solid transparent;
      line-height: 1.1;
      white-space: nowrap;
      user-select: none;
      transition:
        background-color var(--dur-fast) var(--ease-spring),
        border-color var(--dur-fast) var(--ease-spring),
        color var(--dur-fast) var(--ease-spring);
    }

    .ui-badge.is-mono {
      font-family: var(--font-mono);
      font-variant-numeric: tabular-nums;
    }

    /* Sizes */
    .ui-badge[data-size="sm"] {
      padding: 3px 8px;
      font-size: var(--text-xs);
      letter-spacing: 0.01em;
    }

    .ui-badge[data-size="md"] {
      padding: 4px 10px;
      font-size: var(--text-sm);
      letter-spacing: 0;
    }

    /* Tones */
    .ui-badge[data-tone="neutral"] {
      background-color: var(--surface-subtle);
      color: var(--ink-secondary);
      border-color: var(--border-hairline);
    }

    .ui-badge[data-tone="copper"] {
      background-color: var(--accent-copper-soft);
      color: var(--accent-copper-text);
      border-color: var(--border-copper);
    }

    .ui-badge[data-tone="emerald"] {
      background-color: var(--semantic-emerald-soft);
      color: var(--semantic-emerald-text);
      border-color: var(--semantic-emerald-border);
    }

    .ui-badge[data-tone="amber"] {
      background-color: var(--semantic-amber-soft);
      color: var(--semantic-amber-text);
      border-color: var(--semantic-amber-border);
    }

    .ui-badge[data-tone="crimson"] {
      background-color: var(--semantic-crimson-soft);
      color: var(--semantic-crimson-text);
      border-color: var(--semantic-crimson-border);
    }

    .ui-badge[data-tone="glass"] {
      background-color: var(--surface-subtle);
      color: var(--semantic-steel-text);
      border-color: var(--border-hairline);
      box-shadow: var(--border-specular-sm);
    }

    /* Live Indicator Dot */
    .badge-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background-color: currentColor;
      flex-shrink: 0;
    }

    .badge-content {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
  `],
})
export class UiBadgeComponent {
  readonly tone = input<BadgeTone | undefined>(undefined);
  readonly variant = input<BadgeVariant>('default');
  readonly size = input<BadgeSize>('sm');
  readonly mono = input(false, { transform: booleanAttribute });
  readonly dot = input(false, { transform: booleanAttribute });

  readonly resolvedTone = computed<BadgeTone>(
    () => this.tone() ?? LEGACY_VARIANT_TONE_MAP[this.variant()] ?? 'neutral'
  );
}
