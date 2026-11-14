import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { TelegramService } from '../../core/services/telegram.service';
import { IconComponent } from '../../core/components/icon/icon.component';
import { JobSummary, DailyRunRecord, SourceInfo } from '../../core/models/job.model';

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [CommonModule, RouterLink, IconComponent],
  template: `
    <div class="overview-view">
      <!-- Executive Action Header -->
      <header class="action-header">
        <div class="header-main">
          <div class="title-group">
            <h1>Pipeline Overview</h1>
            <p class="subtitle">Automated discovery & precision matching for Software Engineering & Frontend roles</p>
          </div>
          <div class="header-tags">
            <span class="badge badge-blue">
              <app-icon name="briefcase" [size]="12"></app-icon>
              Angular / Frontend
            </span>
            <span class="badge badge-green">
              <app-icon name="map-pin" [size]="12"></app-icon>
              Egypt & Remote Worldwide
            </span>
            <span class="badge">
              <app-icon name="clock" [size]="12"></app-icon>
              Daily Run: 09:00 Cairo
            </span>
          </div>
        </div>

        <div class="header-actions">
          <button
            (click)="triggerRun()"
            [disabled]="isTriggering()"
            class="btn btn-primary"
            aria-label="Run discovery job search immediately"
          >
            <app-icon [name]="isTriggering() ? 'refresh' : 'play'" [size]="15" [class.spin]="isTriggering()"></app-icon>
            <span>{{ isTriggering() ? 'Running...' : 'Run Discovery' }}</span>
          </button>
        </div>
      </header>

      <!-- Key Metrics Grid -->
      <section class="metrics-grid" aria-label="Key job metrics">
        <div class="metric-card">
          <div class="metric-icon-box">
            <app-icon name="briefcase" [size]="18"></app-icon>
          </div>
          <div class="metric-body">
            <span class="metric-label">Discovered</span>
            <span class="metric-value">{{ totalJobs() }}</span>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon-box">
            <app-icon name="bookmark" [size]="18"></app-icon>
          </div>
          <div class="metric-body">
            <span class="metric-label">Saved</span>
            <span class="metric-value">{{ savedCount() }}</span>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon-box">
            <app-icon name="check-square" [size]="18"></app-icon>
          </div>
          <div class="metric-body">
            <span class="metric-label">Applied</span>
            <span class="metric-value">{{ appliedCount() }}</span>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon-box">
            <app-icon name="activity" [size]="18"></app-icon>
          </div>
          <div class="metric-body">
            <span class="metric-label">Engine Status</span>
            <span class="metric-value status-text" [class.status-active]="lastRun()?.status === 'SUCCESS'">
              {{ lastRun()?.status || 'IDLE' }}
            </span>
          </div>
        </div>
      </section>

      <!-- Split Layout: Opportunities & Sources -->
      <div class="content-grid">
        <!-- Top Matches Section -->
        <section class="panel opportunities-panel" aria-labelledby="top-jobs-title">
          <div class="panel-header">
            <div class="panel-title-wrap">
              <app-icon name="sparkles" [size]="18" class="panel-icon-accent"></app-icon>
              <h2 id="top-jobs-title">Top Matched Roles</h2>
            </div>
            <a routerLink="/jobs" class="view-all-link">
              <span>View all jobs</span>
              <app-icon name="arrow-right" [size]="14"></app-icon>
            </a>
          </div>

          <div *ngIf="topJobs().length === 0" class="empty-state">
            <app-icon name="briefcase" [size]="28" class="empty-icon"></app-icon>
            <p>No high-scoring matches discovered yet. Click Run Discovery to fetch live roles.</p>
          </div>

          <div class="jobs-list" *ngIf="topJobs().length > 0">
            <article *ngFor="let job of topJobs()" class="job-item-card">
              <div class="job-item-header">
                <div class="job-meta-top">
                  <span class="company-name">
                    <app-icon name="building" [size]="13"></app-icon>
                    {{ job.company }}
                  </span>
                  <span class="location-name">
                    <app-icon name="map-pin" [size]="13"></app-icon>
                    {{ job.raw_location || 'Remote' }}
                  </span>
                </div>
                <div class="score-badge" [class.score-high]="job.match_score >= 80">
                  {{ job.match_score }}% Match
                </div>
              </div>

              <h3 class="job-item-title">{{ job.title }}</h3>

              <div class="job-tags-row">
                <span class="badge badge-blue">{{ job.eligibility }}</span>
                <span class="badge">{{ job.seniority }}</span>
                <span class="badge">{{ job.source_name }}</span>
              </div>

              <div class="job-item-footer">
                <a
                  [href]="job.original_application_url"
                  target="_blank"
                  rel="noopener noreferrer"
                  (click)="onOpenLink($event, job.original_application_url)"
                  class="btn btn-secondary btn-sm"
                >
                  <span>Apply Link</span>
                  <app-icon name="external-link" [size]="13"></app-icon>
                </a>
              </div>
            </article>
          </div>
        </section>

        <!-- Connected Sources Section -->
        <section class="panel sources-panel" aria-labelledby="sources-title">
          <div class="panel-header">
            <div class="panel-title-wrap">
              <app-icon name="database" [size]="18" class="panel-icon-accent"></app-icon>
              <h2 id="sources-title">Source Feeds</h2>
            </div>
          </div>

          <div class="sources-list">
            <div *ngFor="let s of sources()" class="source-row">
              <div class="source-info">
                <span class="source-name">{{ s.name }}</span>
                <span class="source-attr">{{ s.attribution }}</span>
              </div>
              <div class="source-status">
                <span class="status-indicator" [class.active]="s.is_enabled">
                  {{ s.is_enabled ? 'Active' : 'Offline' }}
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  `,
  styles: [`
    .overview-view {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
      width: 100%;
    }

    /* Executive Header */
    .action-header {
      background-color: var(--color-bg-surface-glass);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 1px solid var(--color-border-default);
      border-radius: var(--radius-lg);
      padding: var(--space-5);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--space-4);
      box-shadow: var(--shadow-sm);
      transition: border-color var(--motion-fast);
    }
    .action-header:hover {
      border-color: var(--color-border-hover);
    }
    .header-main {
      display: flex;
      flex-direction: column;
      gap: var(--space-2-5);
    }
    .title-group h1 {
      font-size: var(--text-xl);
      font-weight: 700;
      color: var(--color-text-primary);
      margin-bottom: 2px;
    }
    .subtitle {
      font-size: var(--text-sm);
      color: var(--color-text-secondary);
      margin: 0;
    }
    .header-tags {
      display: flex;
      gap: var(--space-2);
      flex-wrap: wrap;
    }
    .header-actions {
      flex-shrink: 0;
    }

    /* Metrics Grid */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: var(--space-3);
      width: 100%;
    }
    .metric-card {
      background-color: var(--color-bg-surface-glass);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 1px solid var(--color-border-default);
      border-radius: var(--radius-lg);
      padding: var(--space-3-5, 14px) var(--space-4);
      display: flex;
      align-items: center;
      gap: var(--space-3);
      box-shadow: var(--shadow-xs);
      transition: border-color var(--motion-fast), box-shadow var(--motion-fast), transform var(--motion-fast);
    }
    .metric-card:hover {
      border-color: var(--color-border-hover);
      box-shadow: var(--shadow-sm);
      transform: translateY(-1px);
    }
    .metric-icon-box {
      width: 38px;
      height: 38px;
      border-radius: var(--radius-md);
      background-color: var(--color-bg-surface-elevated-glass);
      border: 1px solid var(--color-border-subtle);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-brand-accent);
      flex-shrink: 0;
    }
    .metric-body {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .metric-label {
      font-size: var(--text-xs);
      color: var(--color-text-muted);
      font-weight: 500;
      line-height: 1.2;
    }
    .metric-value {
      font-size: var(--text-xl);
      font-weight: 700;
      color: var(--color-text-primary);
      letter-spacing: -0.02em;
    }
    .status-text {
      font-size: var(--text-sm);
      font-family: var(--font-mono);
      color: var(--color-text-secondary);
    }
    .status-active {
      color: var(--color-success-text);
    }

    /* Content Grid */
    .content-grid {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: var(--space-4);
      width: 100%;
    }

    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-3-5);
      border-bottom: 1px solid var(--color-border-subtle);
      padding-bottom: var(--space-2-5);
    }
    .panel-title-wrap {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .panel-title-wrap h2 {
      font-size: var(--text-base);
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0;
    }
    .panel-icon-accent {
      color: var(--color-brand-accent);
    }
    .view-all-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: var(--text-xs);
      color: var(--color-brand-accent);
      font-weight: 600;
    }
    .view-all-link:hover {
      color: var(--color-brand-primary-hover);
    }

    .empty-state {
      padding: var(--space-8) var(--space-4);
      text-align: center;
      color: var(--color-text-muted);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2);
    }
    .empty-icon {
      color: var(--color-text-muted);
      opacity: 0.5;
    }

    /* Job Item Card */
    .jobs-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .job-item-card {
      background-color: var(--color-bg-surface-elevated-glass);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-2-5);
      transition: border-color var(--motion-fast), box-shadow var(--motion-fast), transform var(--motion-fast);
    }
    .job-item-card:hover {
      border-color: var(--color-border-hover);
      box-shadow: var(--shadow-sm);
      transform: translateY(-1px);
    }
    .job-item-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--space-2);
    }
    .job-meta-top {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
    }
    .company-name, .location-name {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .score-badge {
      font-size: var(--text-xs);
      font-weight: 700;
      font-family: var(--font-mono);
      padding: 2px 8px;
      border-radius: var(--radius-pill);
      background-color: var(--color-brand-subtle);
      color: var(--color-brand-accent);
      border: 1px solid var(--color-brand-border);
    }
    .score-high {
      background-color: var(--color-success-bg);
      color: var(--color-success-text);
      border-color: var(--color-success-border);
    }
    .job-item-title {
      font-size: var(--text-base);
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0;
    }
    .job-tags-row {
      display: flex;
      gap: var(--space-1-5);
      flex-wrap: wrap;
    }
    .job-item-footer {
      display: flex;
      justify-content: flex-end;
      margin-top: var(--space-1);
    }

    /* Sources List */
    .sources-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-2-5);
    }
    .source-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--space-2-5) var(--space-3);
      background-color: var(--color-bg-surface-elevated);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md);
    }
    .source-info {
      display: flex;
      flex-direction: column;
    }
    .source-name {
      font-size: var(--text-sm);
      font-weight: 600;
      color: var(--color-text-primary);
    }
    .source-attr {
      font-size: var(--text-2xs);
      color: var(--color-text-muted);
    }
    .status-indicator {
      font-size: var(--text-2xs);
      font-weight: 600;
      padding: 2px 8px;
      border-radius: var(--radius-pill);
      background: rgba(148, 163, 184, 0.1);
      color: var(--color-text-muted);
    }
    .status-indicator.active {
      background: var(--color-success-bg);
      color: var(--color-success-text);
      border: 1px solid var(--color-success-border);
    }

    .spin {
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* Responsive Mobile */
    @media (max-width: 768px) {
      .action-header {
        flex-direction: column;
        align-items: stretch;
        padding: var(--space-3-5);
        gap: var(--space-3);
      }
      .header-actions .btn {
        width: 100%;
      }
      .metrics-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: var(--space-2);
      }
      .metric-card {
        padding: var(--space-2-5) var(--space-3);
        gap: var(--space-2);
      }
      .metric-icon-box {
        width: 32px;
        height: 32px;
      }
      .metric-value {
        font-size: var(--text-lg);
      }
      .content-grid {
        grid-template-columns: 1fr;
        gap: var(--space-3);
      }
      .job-item-footer .btn {
        width: 100%;
      }
    }
  `],
})
export class OverviewComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly telegram = inject(TelegramService);

  totalJobs = signal<number>(0);
  savedCount = signal<number>(0);
  appliedCount = signal<number>(0);
  lastRun = signal<DailyRunRecord | null>(null);
  topJobs = signal<JobSummary[]>([]);
  sources = signal<SourceInfo[]>([]);
  isTriggering = signal<boolean>(false);

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.api.getJobs({ limit: 5, min_score: 70 }).subscribe({
      next: (res) => {
        this.totalJobs.set(res.total);
        this.topJobs.set(res.items);
      },
    });

    this.api.getTrackedJobs().subscribe({
      next: (items) => {
        this.savedCount.set(items.filter((i) => i.status === 'SAVED').length);
        this.appliedCount.set(items.filter((i) => i.status === 'APPLIED').length);
      },
    });

    this.api.getSources().subscribe({
      next: (s) => this.sources.set(s),
    });

    this.api.getRuns().subscribe({
      next: (runs) => {
        if (runs.length > 0) {
          this.lastRun.set(runs[0]);
        }
      },
    });
  }

  triggerRun(): void {
    if (this.isTriggering()) return;
    this.telegram.haptic('medium');
    this.isTriggering.set(true);

    this.api.triggerRun().subscribe({
      next: () => {
        this.telegram.haptic('success');
        setTimeout(() => {
          this.isTriggering.set(false);
          this.loadData();
        }, 1500);
      },
      error: () => {
        this.telegram.haptic('error');
        this.isTriggering.set(false);
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
