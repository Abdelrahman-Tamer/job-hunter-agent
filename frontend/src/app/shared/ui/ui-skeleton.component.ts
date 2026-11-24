import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'ui-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="skeleton-wrapper">
      <div
        *ngFor="let item of items"
        class="ui-skeleton shimmer-active"
        [style.width]="width"
        [style.height]="height"
        [attr.data-rounded]="rounded"
      ></div>
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
      background-color: var(--bg-surface-2);
      border: 1px solid var(--border-subtle);
    }

    .ui-skeleton[data-rounded="xs"] { border-radius: var(--radius-xs); }
    .ui-skeleton[data-rounded="sm"] { border-radius: var(--radius-sm); }
    .ui-skeleton[data-rounded="md"] { border-radius: var(--radius-md); }
    .ui-skeleton[data-rounded="lg"] { border-radius: var(--radius-lg); }
    .ui-skeleton[data-rounded="full"] { border-radius: var(--radius-full); }
  `],
})
export class UiSkeletonComponent {
  @Input() width: string = '100%';
  @Input() height: string = '1rem';
  @Input() rounded: 'xs' | 'sm' | 'md' | 'lg' | 'full' = 'sm';
  @Input() set count(val: number) {
    this.items = Array.from({ length: Math.max(1, val) });
  }

  items = [1];
}
