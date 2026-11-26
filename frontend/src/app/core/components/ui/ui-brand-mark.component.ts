import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  input,
  numberAttribute,
} from '@angular/core';

@Component({
  selector: 'ui-brand-mark',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      class="brand-mark-svg"
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 36 36"
      fill="none"
      [attr.role]="ariaLabel() ? 'img' : null"
      [attr.aria-label]="ariaLabel() || null"
      [attr.aria-hidden]="ariaLabel() ? null : 'true'"
    >
      <!-- Outer Architectural Frame -->
      <rect
        x="2"
        y="2"
        width="32"
        height="32"
        rx="8.5"
        class="mark-frame-fill"
      />
      <rect
        x="2"
        y="2"
        width="32"
        height="32"
        rx="8.5"
        stroke-width="1.25"
        class="mark-frame-stroke"
      />

      <!-- Interlocking Structural Calipers / Aperture -->
      <path
        d="M11 23V13.5C11 12.1193 12.1193 11 13.5 11H20.5"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="mark-ink"
      />
      <path
        d="M25 13V22.5C25 23.8807 23.8807 25 22.5 25H15.5"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="mark-ink-muted"
      />

      <!-- Precision Central Datum Axis -->
      <line
        x1="15.5"
        y1="18"
        x2="20.5"
        y2="18"
        stroke-width="1.6"
        stroke-linecap="round"
        class="mark-ink"
      />

      <!-- Signature Warm Copper Signal Node -->
      @if (showNode()) {
        <circle
          cx="25"
          cy="11"
          r="4.25"
          class="mark-node-halo"
        />
        <circle
          cx="25"
          cy="11"
          r="2.4"
          class="mark-node-core"
        />
      }
    </svg>
  `,
  styles: [`
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 0;
      flex-shrink: 0;
    }

    .brand-mark-svg {
      display: block;
    }

    .mark-frame-fill {
      fill: var(--surface-elevated);
    }

    .mark-frame-stroke {
      stroke: var(--border-strong);
    }

    .mark-ink {
      stroke: var(--ink-primary);
    }

    .mark-ink-muted {
      stroke: var(--ink-secondary);
    }

    .mark-node-halo {
      fill: var(--accent-copper);
      opacity: 0.22;
    }

    .mark-node-core {
      fill: var(--accent-copper);
    }
  `],
})
export class UiBrandMarkComponent {
  readonly size = input<number, number | string>(32, {
    transform: (val) => numberAttribute(val, 32),
  });
  readonly showNode = input(true, { transform: booleanAttribute });
  readonly ariaLabel = input<string | undefined>(undefined);
}
