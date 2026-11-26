import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  numberAttribute,
} from '@angular/core';

export type SkeletonRounded = 'xs' | 'sm' | 'md' | 'lg' | 'full';

@Component({
  selector: 'ui-skeleton',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="skeleton-wrapper" aria-hidden="true">
      @for (item of items(); track item) {
        <div
          class="ui-skeleton shimmer-active"
          [style.width]="width()"
          [style.height]="height()"
          [attr.data-rounded]="rounded()"
        ></div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
    }

    .skeleton-wrapper {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      width: 100%;
    }

    .ui-skeleton {
      display: block;
      background-color: var(--surface-subtle);
      border: 1px solid var(--border-hairline);
    }

    .ui-skeleton[data-rounded="xs"] { border-radius: var(--radius-xs); }
    .ui-skeleton[data-rounded="sm"] { border-radius: var(--radius-sm); }
    .ui-skeleton[data-rounded="md"] { border-radius: var(--radius-md); }
    .ui-skeleton[data-rounded="lg"] { border-radius: var(--radius-lg); }
    .ui-skeleton[data-rounded="full"] { border-radius: var(--radius-full); }
  `],
})
export class UiSkeletonComponent {
  readonly width = input<string>('100%');
  readonly height = input<string>('1rem');
  readonly rounded = input<SkeletonRounded>('sm');
  readonly count = input<number, number | string>(1, {
    transform: (val) => numberAttribute(val, 1),
  });

  readonly items = computed(() =>
    Array.from({ length: Math.max(1, Math.floor(this.count())) }, (_, idx) => idx)
  );
}
