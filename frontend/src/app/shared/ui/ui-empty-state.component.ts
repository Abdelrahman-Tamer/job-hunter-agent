import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent, IconName } from '../../core/components/icon/icon.component';

@Component({
  selector: 'ui-empty-state',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <div class="empty-state-container">
      <div class="empty-icon-wrap" *ngIf="icon">
        <app-icon [name]="icon" [size]="iconSize"></app-icon>
      </div>
      <h3 class="empty-title">{{ title }}</h3>
      <p class="empty-subtitle" *ngIf="subtitle">{{ subtitle }}</p>
      <div class="empty-action">
        <ng-content select="[action]"></ng-content>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
    }

    .empty-state-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: var(--space-8) var(--space-4);
      background-color: var(--bg-surface-1);
      border: 1px dashed var(--border-default);
      border-radius: var(--radius-lg);
      margin: var(--space-4) 0;
    }

    .empty-icon-wrap {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border-radius: var(--radius-md);
      background-color: var(--bg-surface-2);
      border: 1px solid var(--border-default);
      color: var(--text-tertiary);
      margin-bottom: var(--space-3);
    }

    .empty-title {
      font-size: var(--text-md);
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: var(--space-1);
    }

    .empty-subtitle {
      font-size: var(--text-sm);
      color: var(--text-secondary);
      max-width: 380px;
      margin-bottom: var(--space-4);
      line-height: 1.5;
    }

    .empty-action {
      display: flex;
      gap: var(--space-2);
    }
  `],
})
export class UiEmptyStateComponent {
  @Input() icon?: IconName;
  @Input() iconSize: number = 22;
  @Input({ required: true }) title!: string;
  @Input() subtitle?: string;
}
