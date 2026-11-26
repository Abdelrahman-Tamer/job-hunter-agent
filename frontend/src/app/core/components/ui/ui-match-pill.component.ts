import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  numberAttribute,
} from '@angular/core';

export type MatchTier = 'emerald' | 'copper' | 'muted';
export type MatchPillSize = 'sm' | 'md';

const MICRO_GAUGE_RADIUS = 7;
const MICRO_GAUGE_CIRCUMFERENCE = Number((2 * Math.PI * MICRO_GAUGE_RADIUS).toFixed(3));

@Component({
  selector: 'ui-match-pill',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="match-pill"
      [attr.data-tier]="tier()"
      [attr.data-size]="size()"
      role="img"
      [attr.aria-label]="ariaText()"
    >
      <svg
        class="match-gauge"
        [attr.width]="size() === 'sm' ? 15 : 18"
        [attr.height]="size() === 'sm' ? 15 : 18"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
      >
        <circle
          class="gauge-track"
          cx="10"
          cy="10"
          r="7"
          stroke-width="2"
        />
        <circle
          class="gauge-arc"
          cx="10"
          cy="10"
          r="7"
          stroke-width="2"
          stroke-linecap="round"
          transform="rotate(-90 10 10)"
          [attr.stroke-dasharray]="circumference"
          [style.stroke-dashoffset]="dashOffset()"
          [style.--ring-circumference]="circumference"
          [style.--ring-offset]="dashOffset()"
        />
      </svg>
      <span class="match-value tabular-nums">
        {{ clampedScore() }}%{{ label() ? ' ' + label() : '' }}
      </span>
    </span>
  `,
  styles: [`
    :host {
      display: inline-flex;
      vertical-align: middle;
    }

    .match-pill {
      --match-stroke: var(--ink-muted);
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border-radius: var(--radius-full);
      border: 1px solid var(--border-hairline);
      user-select: none;
      white-space: nowrap;
      line-height: 1;
      transition:
        background-color var(--dur-fast) var(--ease-spring),
        border-color var(--dur-fast) var(--ease-spring),
        color var(--dur-fast) var(--ease-spring);
    }

    .match-pill[data-size="sm"] {
      padding: 3px 8px 3px 5px;
      font-size: var(--text-xs);
    }

    .match-pill[data-size="md"] {
      padding: 4px 10px 4px 6px;
      font-size: var(--text-sm);
    }

    /* Tier Adaptation: >= 80 Emerald, 65-79 Copper, < 65 Muted */
    .match-pill[data-tier="emerald"] {
      --match-stroke: var(--semantic-emerald);
      background-color: var(--semantic-emerald-soft);
      border-color: var(--semantic-emerald-border);
      color: var(--semantic-emerald-text);
    }

    .match-pill[data-tier="copper"] {
      --match-stroke: var(--accent-copper);
      background-color: var(--accent-copper-soft);
      border-color: var(--border-copper);
      color: var(--accent-copper-text);
    }

    .match-pill[data-tier="muted"] {
      --match-stroke: var(--ink-muted);
      background-color: var(--surface-subtle);
      border-color: var(--border-hairline);
      color: var(--ink-secondary);
    }

    .match-gauge {
      display: block;
      flex-shrink: 0;
    }

    .gauge-track {
      stroke: var(--border-strong);
      opacity: 0.5;
    }

    .gauge-arc {
      stroke: var(--match-stroke);
      transition: stroke-dashoffset var(--dur-slow) var(--ease-spring);
      animation: ringDraw var(--dur-slow) var(--ease-spring) backwards;
    }

    .match-value {
      font-family: var(--font-mono);
      font-variant-numeric: tabular-nums;
      font-weight: 600;
      letter-spacing: -0.01em;
    }
  `],
})
export class UiMatchPillComponent {
  readonly score = input.required<number, number | string>({
    transform: (val) => numberAttribute(val, 0),
  });
  readonly label = input<string>('Match');
  readonly size = input<MatchPillSize>('md');

  readonly circumference = MICRO_GAUGE_CIRCUMFERENCE;

  readonly clampedScore = computed(() => {
    const rounded = Math.round(this.score());
    if (!Number.isFinite(rounded)) {
      return 0;
    }
    return Math.min(100, Math.max(0, rounded));
  });

  readonly dashOffset = computed(() =>
    Number((this.circumference * (1 - this.clampedScore() / 100)).toFixed(3))
  );

  readonly tier = computed<MatchTier>(() => {
    const value = this.clampedScore();
    if (value >= 80) {
      return 'emerald';
    }
    if (value >= 65) {
      return 'copper';
    }
    return 'muted';
  });

  readonly ariaText = computed(() => {
    const suffix = this.label().trim();
    return suffix ? `${this.clampedScore()}% ${suffix}` : `${this.clampedScore()}% match`;
  });
}
