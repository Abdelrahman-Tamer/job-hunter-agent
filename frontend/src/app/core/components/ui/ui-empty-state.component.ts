import {
  ChangeDetectionStrategy,
  Component,
  input,
  numberAttribute,
} from '@angular/core';
import { IconComponent, IconName } from '../icon/icon.component';
import { UiArchitecturalMotifComponent } from './ui-architectural-motif.component';

@Component({
  selector: 'ui-empty-state',
  standalone: true,
  imports: [IconComponent, UiArchitecturalMotifComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty-state-container">
      <ui-architectural-motif variant="empty" />

      <div class="empty-content">
        @if (icon(); as iconName) {
          <div class="empty-icon-wrap" aria-hidden="true">
            <app-icon [name]="iconName" [size]="iconSize()" />
            <span class="empty-corner-node"></span>
          </div>
        } @else {
          <div class="empty-illustration" aria-hidden="true">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <rect
                x="6"
                y="10"
                width="26"
                height="26"
                rx="6"
                stroke="currentColor"
                stroke-width="1.35"
                stroke-opacity="0.35"
              />
              <rect
                x="16"
                y="14"
                width="26"
                height="24"
                rx="6"
                class="illustration-front-plane"
                stroke="currentColor"
                stroke-width="1.35"
              />
              <line x1="22" y1="23" x2="36" y2="23" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" />
              <line x1="22" y1="28.5" x2="31" y2="28.5" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-opacity="0.55" />
              <circle cx="38" cy="14" r="3" fill="var(--accent-copper)" />
            </svg>
          </div>
        }

        <h3 class="empty-title">{{ title() }}</h3>
        @if (subtitle(); as sub) {
          <p class="empty-subtitle">{{ sub }}</p>
        }

        <div class="empty-action">
          <ng-content select="[action]" />
          <ng-content />
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
    }

    .empty-state-container {
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: var(--space-8) var(--space-5);
      background-color: var(--surface-elevated);
      border: 1px dashed var(--border-strong);
      box-shadow: var(--border-specular-sm);
      border-radius: var(--radius-lg);
      margin: var(--space-4) 0;
    }

    .empty-content {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      max-width: 420px;
    }

    .empty-icon-wrap {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      border-radius: var(--radius-md);
      background-color: var(--surface-subtle);
      border: 1px solid var(--border-hairline);
      box-shadow: var(--border-specular-sm), var(--shadow-xs);
      color: var(--ink-secondary);
      margin-bottom: var(--space-4);
    }

    .empty-corner-node {
      position: absolute;
      top: -3px;
      right: -3px;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background-color: var(--accent-copper);
      border: 1.5px solid var(--surface-elevated);
    }

    .empty-illustration {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--ink-secondary);
      margin-bottom: var(--space-3);
    }

    .illustration-front-plane {
      fill: var(--surface-elevated);
    }

    .empty-title {
      font-family: var(--font-display);
      font-size: var(--text-md);
      font-weight: 600;
      letter-spacing: var(--tracking-tight);
      color: var(--ink-primary);
      margin-bottom: var(--space-1-5);
    }

    .empty-subtitle {
      font-size: var(--text-sm);
      color: var(--ink-secondary);
      max-width: 380px;
      line-height: 1.55;
    }

    .empty-action {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      margin-top: var(--space-4);
    }

    .empty-action:empty {
      display: none;
    }
  `],
})
export class UiEmptyStateComponent {
  readonly icon = input<IconName | undefined>(undefined);
  readonly iconSize = input<number, number | string>(22, {
    transform: (val) => numberAttribute(val, 22),
  });
  readonly title = input.required<string>();
  readonly subtitle = input<string | undefined>(undefined);
}
