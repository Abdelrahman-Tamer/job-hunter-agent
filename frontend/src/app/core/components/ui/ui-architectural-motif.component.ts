import {
  ChangeDetectionStrategy,
  Component,
  input,
} from '@angular/core';

export type MotifVariant = 'header' | 'empty' | 'card';

let nextMotifInstanceId = 0;

@Component({
  selector: 'ui-architectural-motif',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[attr.data-variant]': 'variant()',
  },
  template: `
    @switch (variant()) {
      @case ('header') {
        <svg class="motif-svg" viewBox="0 0 640 160" preserveAspectRatio="xMaxYMid slice" fill="none">
          <defs>
            <pattern [attr.id]="patternId" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" stroke="currentColor" stroke-width="0.75" />
            </pattern>
            <linearGradient [attr.id]="gradId" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#ffffff" stop-opacity="0.08" />
              <stop offset="55%" stop-color="#ffffff" stop-opacity="0.85" />
              <stop offset="100%" stop-color="#ffffff" stop-opacity="0.15" />
            </linearGradient>
            <mask [attr.id]="maskId">
              <rect width="640" height="160" [attr.fill]="'url(#' + gradId + ')'" />
            </mask>
          </defs>
          <g [attr.mask]="'url(#' + maskId + ')'">
            <rect width="640" height="160" [attr.fill]="'url(#' + patternId + ')'" />
            <line x1="360" y1="160" x2="520" y2="0" stroke="currentColor" stroke-width="0.9" />
            <line x1="480" y1="160" x2="640" y2="0" stroke="var(--accent-copper)" stroke-width="1" stroke-opacity="0.85" />
            <path d="M444 64h8M448 60v8" stroke="currentColor" stroke-width="1" />
            <path d="M540 96h8M544 92v8" stroke="var(--accent-copper)" stroke-width="1" />
          </g>
        </svg>
      }
      @case ('empty') {
        <svg class="motif-svg" viewBox="0 0 360 220" preserveAspectRatio="xMidYMid slice" fill="none">
          <defs>
            <pattern [attr.id]="patternId" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" stroke="currentColor" stroke-width="0.7" />
            </pattern>
            <radialGradient [attr.id]="gradId" cx="50%" cy="46%" r="54%">
              <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95" />
              <stop offset="70%" stop-color="#ffffff" stop-opacity="0.35" />
              <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
            </radialGradient>
            <mask [attr.id]="maskId">
              <rect width="360" height="220" [attr.fill]="'url(#' + gradId + ')'" />
            </mask>
          </defs>
          <g [attr.mask]="'url(#' + maskId + ')'">
            <rect width="360" height="220" [attr.fill]="'url(#' + patternId + ')'" />
            <rect x="114" y="44" width="132" height="132" rx="16" stroke="currentColor" stroke-width="0.9" />
            <line x1="88" y1="196" x2="272" y2="12" stroke="currentColor" stroke-width="0.8" stroke-dasharray="3 4" />
            <circle cx="246" cy="44" r="2.25" fill="var(--accent-copper)" />
          </g>
        </svg>
      }
      @case ('card') {
        <svg class="motif-svg" viewBox="0 0 280 140" preserveAspectRatio="xMaxYMin slice" fill="none">
          <defs>
            <pattern [attr.id]="patternId" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" stroke="currentColor" stroke-width="0.75" />
            </pattern>
            <radialGradient [attr.id]="gradId" cx="88%" cy="14%" r="72%">
              <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95" />
              <stop offset="65%" stop-color="#ffffff" stop-opacity="0.25" />
              <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
            </radialGradient>
            <mask [attr.id]="maskId">
              <rect width="280" height="140" [attr.fill]="'url(#' + gradId + ')'" />
            </mask>
          </defs>
          <g [attr.mask]="'url(#' + maskId + ')'">
            <rect width="280" height="140" [attr.fill]="'url(#' + patternId + ')'" />
            <line x1="168" y1="140" x2="280" y2="28" stroke="var(--accent-copper)" stroke-width="0.9" />
            <path d="M236 24h8M240 20v8" stroke="currentColor" stroke-width="1" />
          </g>
        </svg>
      }
    }
  `,
  styles: [`
    :host {
      position: absolute;
      inset: 0;
      pointer-events: none;
      overflow: hidden;
      user-select: none;
      z-index: 0;
      color: var(--ink-primary);
    }

    .motif-svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    :host([data-variant="header"]) .motif-svg {
      opacity: 0.1;
    }

    :host([data-variant="empty"]) .motif-svg {
      opacity: 0.09;
    }

    :host([data-variant="card"]) .motif-svg {
      opacity: 0.07;
    }
  `],
})
export class UiArchitecturalMotifComponent {
  readonly variant = input<MotifVariant>('header');

  private readonly instanceId = nextMotifInstanceId++;
  readonly patternId = `studio-motif-grid-${this.instanceId}`;
  readonly gradId = `studio-motif-grad-${this.instanceId}`;
  readonly maskId = `studio-motif-mask-${this.instanceId}`;
}
