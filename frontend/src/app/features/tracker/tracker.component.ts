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
          <h1>Application Pipeline</h1>
          <p class="subtitle">Track and organize your personal job applications stage by stage</p>
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
          <app-icon name="bookmark" [size]="32" class="empty-icon"></app-icon>
          <h3>No jobs in this stage</h3>
          <p>Save or mark jobs as applied from the Job Feed to track them here.</p>
          <a routerLink="/jobs" class="btn btn-secondary btn-sm">
            <span>Browse Jobs</span>
            <app-icon name="arrow-right" [size]="14"></app-icon>
          </a>
        </div>

        <div class="items-grid" *ngIf="filteredItems().length > 0">
          <article *ngFor="let item of filteredItems()" class="tracked-card">
            <div class="item-main">
              <div class="item-meta-top">
                <span class="company-name">
                  <app-icon name="building" [size]="13"></app-icon>
                  {{ item.company }}
                </span>
                <span class="match-score">
                  <app-icon name="sparkles" [size]="12"></app-icon>
                  {{ item.match_score }}%
                </span>
              </div>

              <h3 class="item-title">{{ item.title }}</h3>

              <div class="date-row" *ngIf="item.applied_at">
                <span class="date-text">
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
                <span>Open Link</span>
                <app-icon name="external-link" [size]="13"></app-icon>
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

    .tracker-header h1 {
      font-size: var(--text-xl);
      margin-bottom: 2px;
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
      background: var(--color-bg-surface);
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
    }
    .tab-btn.active {
      color: #ffffff;
      background: var(--color-brand-primary);
      border-color: transparent;
    }
    .tab-count {
      background: rgba(255, 255, 255, 0.15);
      padding: 1px 6px;
      border-radius: var(--radius-pill);
      font-size: var(--text-2xs);
      font-family: var(--font-mono);
    }

    /* Items Grid */
    .items-grid {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .tracked-card {
      background-color: var(--color-bg-surface);
      border: 1px solid var(--color-border-default);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--space-4);
      box-shadow: var(--shadow-xs);
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
    .company-name {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .match-score {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-family: var(--font-mono);
      font-weight: 700;
      color: var(--color-brand-accent);
    }
    .item-title {
      font-size: var(--text-base);
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0;
    }
    .date-row {
      font-size: var(--text-2xs);
      color: var(--color-text-muted);
    }
    .date-text {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .item-controls {
      display: flex;
      align-items: center;
      gap: var(--space-2-5);
      flex-shrink: 0;
    }
    .status-select {
      min-width: 140px;
      font-size: var(--text-xs);
      padding: 6px 28px 6px 10px;
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
      opacity: 0.4;
    }

    /* Mobile / Telegram Mini App */
    @media (max-width: 768px) {
      .tracked-card {
        flex-direction: column;
        align-items: stretch;
        gap: var(--space-3);
        padding: var(--space-3-5);
      }
      .item-controls {
        display: grid;
        grid-template-columns: 1fr 1fr;
        width: 100%;
      }
      .status-select {
        min-width: 0;
        width: 100%;
      }
      .item-controls .btn {
        width: 100%;
      }
    }
  `],
})
export class TrackerComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly telegram = inject(TelegramService);

  allItems = signal<TrackedJobItem[]>([]);
  selectedStatus = signal<string>('ALL');

  readonly tabs: StatusTab[] = [
    { status: 'ALL', label: 'All' },
    { status: 'SAVED', label: 'Saved' },
    { status: 'APPLIED', label: 'Applied' },
    { status: 'INTERVIEW', label: 'Interview' },
    { status: 'OFFER', label: 'Offer' },
    { status: 'REJECTED', label: 'Rejected' },
  ];

  ngOnInit(): void {
    this.loadTracked();
  }

  loadTracked(): void {
    this.api.getTrackedJobs().subscribe({
      next: (items) => this.allItems.set(items),
    });
  }

  selectTab(status: string): void {
    this.telegram.haptic('selection');
    this.selectedStatus.set(status);
  }

  filteredItems(): TrackedJobItem[] {
    const s = this.selectedStatus();
    if (s === 'ALL') return this.allItems();
    return this.allItems().filter((item) => item.status === s);
  }

  getCountForStatus(status: string): number {
    if (status === 'ALL') return this.allItems().length;
    return this.allItems().filter((item) => item.status === status).length;
  }

  onStatusChange(jobId: number, newStatus: ApplicationStatus): void {
    this.telegram.haptic('selection');
    this.api.updateJobStatus(jobId, newStatus).subscribe({
      next: () => {
        this.telegram.haptic('success');
        this.loadTracked();
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
