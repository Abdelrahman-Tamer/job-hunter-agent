import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  input,
} from '@angular/core';

export type CardVariant = 'glass' | 'elevated' | 'subtle';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

@Component({
  selector: 'ui-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-variant]': 'variant()',
    '[attr.data-padding]': 'padding()',
    '[class.is-interactive]': 'interactive()',
  },
  template: `<ng-content />`,
  styles: [`
    :host {
      display: block;
      position: relative;
      border-radius: var(--radius-lg);
      border: 1px solid var(--border-hairline);
      transition:
        transform var(--dur-base) var(--ease-spring),
        border-color var(--dur-fast) var(--ease-spring),
        box-shadow var(--dur-base) var(--ease-spring),
        background-color var(--dur-fast) var(--ease-spring);
    }

    :host([data-variant="elevated"]) {
      background-color: var(--surface-elevated);
      box-shadow: var(--border-specular), var(--shadow-sm);
    }

    :host([data-variant="glass"]) {
      background-color: var(--surface-glass);
      backdrop-filter: var(--blur-glass);
      -webkit-backdrop-filter: var(--blur-glass);
      box-shadow: var(--border-specular), var(--shadow-sm);
    }

    :host([data-variant="subtle"]) {
      background-color: var(--surface-subtle);
      box-shadow: var(--border-specular-sm);
    }

    :host([data-padding="none"]) { padding: 0; }
    :host([data-padding="sm"]) { padding: var(--space-3); }
    :host([data-padding="md"]) { padding: var(--space-5); }
    :host([data-padding="lg"]) { padding: var(--space-6); }

    :host(.is-interactive) {
      cursor: pointer;
    }

    :host(.is-interactive:hover) {
      transform: translateY(-2px);
      border-color: var(--border-strong);
      box-shadow: var(--border-specular-hover), var(--shadow-md);
    }

    :host(.is-interactive:active) {
      transform: translateY(0) scale(0.995);
    }
  `],
})
export class UiCardComponent {
  readonly variant = input<CardVariant>('elevated');
  readonly padding = input<CardPadding>('md');
  readonly interactive = input(false, { transform: booleanAttribute });
}
