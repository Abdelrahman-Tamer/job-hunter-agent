import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { TelegramService } from '../../core/services/telegram.service';
import { IconComponent } from '../../core/components/icon/icon.component';
import { ApplicationStatus, TrackedJobItem } from '../../core/models/job.model';

interface StatusTab {
  status: string;
  label: string;
}

@Component({
  selector: 'app-tracker',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IconComponent],
  template: `
    <div class="tracker-view">
      <!-- Header -->
      <header class="tracker-header">
        <div>
          <div class="pipeline-tag">
            <span class="pipeline-pulse"></span>
            <span>Personal ATS Pipeline</span>
          </div>
          <h1>Application Pipeline</h1>
          <p class="subtitle">Track and organize your active job applications stage by stage</p>
        </div>
      </header>

      <!-- Horizontal Tabs -->
      <nav class="status-tabs-container" aria-label="Application stages">
        <div class="tabs-scroll">
          <button
            *ngFor="let tab of tabs"
            (click)="selectTab(tab.status)"
            [class.active]="selectedStatus() === tab.status"
            class="tab-btn"
          >
            <span>{{ tab.label }}</span>
            <span class="tab-count" *ngIf="getCountForStatus(tab.status) as c">{{ c }}</span>
          </button>
        </div>
      </nav>

      <!-- Tracked Jobs List -->
      <section class="tracked-list" aria-label="Tracked applications">
        <div *ngIf="filteredItems().length === 0" class="empty-state card">
          <app-icon name="bookmark" [size]="36" class="empty-icon"></app-icon>
          <h3>No opportunities in this stage</h3>
          <p>Bookmark or mark roles as applied from the Jobs feed to organize them here.</p>
          <a routerLink="/jobs" class="btn btn-primary btn-sm">
            <span>Discover Jobs</span>
            <app-icon name="arrow-right" [size]="14"></app-icon>
          </a>
        </div>

        <div class="items-grid" *ngIf="filteredItems().length > 0">
          <article *ngFor="let item of filteredItems()" class="tracked-card">
            <div class="item-main">
              <div class="item-meta-top">
                <div class="company-row">
                  <span class="company-avatar">{{ item.company.charAt(0) }}</span>
                  <span class="company-name">{{ item.company }}</span>
                </div>
                <span class="match-score">
                  <app-icon name="sparkles" [size]="12"></app-icon>
                  {{ item.match_score }}%
                </span>
              </div>

              <h3 class="item-title">{{ item.title }}</h3>

              <div class="meta-bottom-row">
                <span class="status-stage-pill" [attr.data-status]="item.status">
                  <span class="stage-dot"></span>
                  {{ item.status }}
                </span>
                <span class="date-text" *ngIf="item.applied_at">
                  <app-icon name="calendar" [size]="12"></app-icon>
                  Applied: {{ item.applied_at | date:'mediumDate' }}
                </span>
              </div>
            </div>

            <div class="item-controls">
              <div class="status-select-wrap">
                <select
                  [ngModel]="item.status"
                  (ngModelChange)="onStatusChange(item.job_id, $event)"
                  class="form-select status-select"
                  aria-label="Change status"
                >
                  <option value="DISCOVERED">Discovered</option>
                  <option value="SAVED">Saved</option>
                  <option value="INTERESTED">Interested</option>
                  <option value="APPLIED">Applied</option>
                  <option value="INTERVIEW">Interview</option>
                  <option value="OFFER">Offer</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>

              <a
                *ngIf="item.original_application_url"
                [href]="item.original_application_url"
                target="_blank"
                rel="noopener noreferrer"
                (click)="onOpenLink($event, item.original_application_url)"
                class="btn btn-secondary btn-sm"
              >
                <span>View Link</span>
                <app-icon name="external-link" [size]="12"></app-icon>
              </a>
            </div>
          </article>
        </div>
      </section>
    </div>
  `,
  styles: [`
    .tracker-view {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      width: 100%;
    }

    .pipeline-tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: var(--text-2xs);
      font-family: var(--font-mono);
      font-weight: 600;
      color: var(--color-brand-accent);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 3px;
    }
    .pipeline-pulse {
      width: 6px;
      height: 6px;
      border-radius: var(--radius-full);
      background-color: var(--color-brand-accent);
      box-shadow: 0 0 8px var(--color-brand-accent);
    }

    .tracker-header h1 {
      font-size: var(--text-2xl);
      margin-bottom: 2px;
      letter-spacing: -0.025em;
    }
    .subtitle {
      font-size: var(--text-sm);
      color: var(--color-text-secondary);
      margin: 0;
    }

    /* Tabs */
    .status-tabs-container {
      width: 100%;
      border-bottom: 1px solid var(--color-border-subtle);
      padding-bottom: 2px;
    }
    .tabs-scroll {
      display: flex;
      gap: var(--space-2);
      overflow-x: auto;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
      padding-bottom: 6px;
    }
    .tabs-scroll::-webkit-scrollbar {
      display: none;
    }

    .tab-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: var(--radius-pill);
      border: 1px solid var(--color-border-subtle);
      background: var(--color-bg-surface-elevated-glass);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      color: var(--color-text-secondary);
      font-size: var(--text-xs);
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: all var(--motion-fast);
    }
    .tab-btn:hover {
      color: var(--color-text-primary);
      border-color: var(--color-border-hover);
      background: var(--color-bg-surface-muted);
    }
    .tab-btn.active {
      color: #ffffff;
      background: var(--color-brand-primary);
      border-color: transparent;
      box-shadow: 0 1px 6px rgba(37, 99, 235, 0.35);
    }
    .tab-count {
      background: rgba(255, 255, 255, 0.18);
      padding: 1px 6px;
      border-radius: var(--radius-pill);
      font-size: var(--text-2xs);
      font-family: var(--font-mono);
      font-weight: 700;
    }

    /* Items Grid */
    .items-grid {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .tracked-card {
      background-color: var(--color-bg-surface-glass);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 1px solid var(--color-border-default);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--space-4);
      box-shadow: var(--shadow-sm);
      transition: border-color var(--motion-fast), box-shadow var(--motion-fast), transform var(--motion-fast);
    }
    .tracked-card:hover {
      border-color: var(--color-border-hover);
      box-shadow: var(--shadow-md);
      transform: translateY(-1.5px);
    }
    .item-main {
      display: flex;
      flex-direction: column;
      gap: var(--space-1-5);
      flex: 1;
      min-width: 0;
    }
    .item-meta-top {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
    }
    .company-row {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
    }
    .company-name {
      font-weight: 700;
      color: var(--color-text-primary);
    }
    .match-score {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-family: var(--font-mono);
      font-weight: 700;
      color: var(--color-brand-accent);
      font-size: var(--text-xs);
    }
    .item-title {
      font-size: var(--text-base);
      font-weight: 700;
      color: var(--color-text-primary);
      margin: 0;
      line-height: 1.35;
      letter-spacing: -0.015em;
    }
    .meta-bottom-row {
      display: flex;
      align-items: center;
      gap: var(--space-2-5);
      margin-top: 2px;
    }
    .status-stage-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 2px 7px;
      border-radius: var(--radius-pill);
      font-size: var(--text-2xs);
      font-weight: 600;
      font-family: var(--font-mono);
      background: var(--color-bg-surface-elevated);
      color: var(--color-text-secondary);
      border: 1px solid var(--color-border-subtle);
    }
    .stage-dot {
      width: 5px;
      height: 5px;
      border-radius: var(--radius-full);
      background-color: currentColor;
    }
    .status-stage-pill[data-status="SAVED"] { color: var(--color-warning-text); background: var(--color-warning-bg); border-color: var(--color-warning-border); }
    .status-stage-pill[data-status="APPLIED"] { color: var(--color-brand-accent); background: var(--color-brand-subtle); border-color: var(--color-brand-border); }
    .status-stage-pill[data-status="INTERVIEW"] { color: #a855f7; background: rgba(168, 85, 247, 0.12); border-color: rgba(168, 85, 247, 0.3); }
    .status-stage-pill[data-status="OFFER"] { color: var(--color-success-text); background: var(--color-success-bg); border-color: var(--color-success-border); }
    .status-stage-pill[data-status="REJECTED"] { color: var(--color-error-text); background: var(--color-error-bg); border-color: var(--color-error-border); }

    .date-text {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: var(--text-2xs);
      color: var(--color-text-muted);
    }

    .item-controls {
      display: flex;
      align-items: center;
      gap: var(--space-2-5);
      flex-shrink: 0;
    }
    .status-select {
      width: 130px;
      padding: 6px 10px;
      font-size: var(--text-xs);
      font-weight: 600;
    }

    .empty-state {
      padding: var(--space-10) var(--space-4);
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2-5);
    }
    .empty-icon {
      color: var(--color-text-muted);
      opacity: 0.5;
    }

    @media (max-width: 768px) {
      .tracked-card {
        flex-direction: column;
        align-items: flex-start;
        gap: var(--space-3);
      }
      .item-controls {
        width: 100%;
        justify-content: space-between;
      }
      .status-select {
        flex: 1;
      }
    }
  `],
})
export class TrackerComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly telegram = inject(TelegramService);

  readonly tabs: StatusTab[] = [
    { status: 'ALL', label: 'All Stages' },
    { status: 'SAVED', label: 'Saved' },
    { status: 'APPLIED', label: 'Applied' },
    { status: 'INTERVIEW', label: 'Interview' },
    { status: 'OFFER', label: 'Offer' },
    { status: 'REJECTED', label: 'Rejected' },
  ];

  selectedStatus = signal<string>('ALL');
  trackedItems = signal<TrackedJobItem[]>([]);

  ngOnInit(): void {
    this.loadTrackedJobs();
  }

  loadTrackedJobs(): void {
    this.api.getTrackedJobs().subscribe({
      next: (items) => this.trackedItems.set(items),
    });
  }

  selectTab(status: string): void {
    this.telegram.haptic('selection');
    this.selectedStatus.set(status);
  }

  filteredItems(): TrackedJobItem[] {
    const s = this.selectedStatus();
    if (s === 'ALL') return this.trackedItems();
    return this.trackedItems().filter((item) => item.status === s);
  }

  getCountForStatus(status: string): number {
    if (status === 'ALL') return this.trackedItems().length;
    return this.trackedItems().filter((item) => item.status === status).length;
  }

  onStatusChange(jobId: number, newStatus: ApplicationStatus): void {
    this.telegram.haptic('selection');
    this.api.updateJobStatus(jobId, newStatus).subscribe({
      next: () => {
        this.trackedItems.update((items) =>
          items.map((i) => (i.job_id === jobId ? { ...i, status: newStatus } : i))
        );
      },
    });
  }

  onOpenLink(event: MouseEvent, url: string): void {
    if (this.telegram.isTelegram()) {
      event.preventDefault();
      this.telegram.openLink(url);
    }
  }
}
