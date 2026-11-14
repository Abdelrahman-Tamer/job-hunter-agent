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
            <div class="agent-tag">
              <span class="pulse-beacon"></span>
              <span>Autonomous Job Engine</span>
            </div>
            <h1>Pipeline Overview</h1>
            <p class="subtitle">Precision job discovery and scoring for Software Engineering & Frontend roles</p>
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
            class="btn btn-primary run-btn"
            aria-label="Run discovery job search immediately"
          >
            <app-icon [name]="isTriggering() ? 'refresh' : 'play'" [size]="15" [class.spin]="isTriggering()"></app-icon>
            <span>{{ isTriggering() ? 'Scanning Feeds...' : 'Run Discovery Now' }}</span>
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
            <div class="metric-label-row">
              <span class="metric-label">Discovered</span>
              <span class="metric-micro-tag">Total</span>
            </div>
            <span class="metric-value">{{ totalJobs() }}</span>
            <span class="metric-hint">Across verified feeds</span>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon-box">
            <app-icon name="bookmark" [size]="18"></app-icon>
          </div>
          <div class="metric-body">
            <div class="metric-label-row">
              <span class="metric-label">Saved</span>
              <span class="metric-micro-tag">Curated</span>
            </div>
            <span class="metric-value">{{ savedCount() }}</span>
            <span class="metric-hint">Ready for review</span>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon-box">
            <app-icon name="check-square" [size]="18"></app-icon>
          </div>
          <div class="metric-body">
            <div class="metric-label-row">
              <span class="metric-label">Applied</span>
              <span class="metric-micro-tag">Active</span>
            </div>
            <span class="metric-value">{{ appliedCount() }}</span>
            <span class="metric-hint">In active pipeline</span>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon-box icon-engine">
            <app-icon name="activity" [size]="18"></app-icon>
          </div>
          <div class="metric-body">
            <div class="metric-label-row">
              <span class="metric-label">Engine Status</span>
              <span class="engine-live-dot"></span>
            </div>
            <span class="metric-value status-text">
              {{ lastRun()?.status || 'READY' }}
            </span>
            <span class="metric-hint">Next 09:00 Cairo</span>
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
              <h2 id="top-jobs-title">Top Matched Opportunities</h2>
            </div>
            <a routerLink="/jobs" class="view-all-link">
              <span>View all {{ totalJobs() }} jobs</span>
              <app-icon name="arrow-right" [size]="13"></app-icon>
            </a>
          </div>

          <div *ngIf="topJobs().length === 0" class="empty-state">
            <app-icon name="briefcase" [size]="32" class="empty-icon"></app-icon>
            <p>Scanning active opportunities across all verified sources...</p>
          </div>

          <div class="jobs-list" *ngIf="topJobs().length > 0">
            <article *ngFor="let job of topJobs()" class="job-item-card">
              <div class="job-item-header">
                <div class="company-row">
                  <span class="company-avatar">{{ job.company.charAt(0) }}</span>
                  <div class="company-text">
                    <span class="company-name">{{ job.company }}</span>
                    <span class="location-name">
                      <app-icon name="map-pin" [size]="11"></app-icon>
                      {{ job.raw_location || 'Remote Worldwide' }}
                    </span>
                  </div>
                </div>

                <div class="score-pill" [class.score-high]="job.match_score >= 70">
                  <app-icon name="sparkles" [size]="12"></app-icon>
                  <span>{{ job.match_score }}% Match</span>
                </div>
              </div>

              <h3 class="job-item-title">{{ job.title }}</h3>

              <div class="job-tags-row">
                <span
                  class="badge"
                  [class.badge-green]="job.eligibility === 'EGYPT_ELIGIBLE' || job.eligibility === 'REMOTE_WORLDWIDE'"
                  [class.badge-blue]="job.eligibility === 'REMOTE_REGION_POSSIBLE'"
                >
                  {{ job.eligibility }}
                </span>
                <span class="badge">{{ job.workplace_type }}</span>
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
                  <app-icon name="external-link" [size]="12"></app-icon>
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
              <h2 id="sources-title">Monitored Feeds</h2>
            </div>
            <span class="source-count-badge">{{ sources().length }} Active</span>
          </div>

          <div class="sources-list">
            <div *ngFor="let s of sources()" class="source-row">
              <div class="source-icon-box">
                <app-icon name="globe" [size]="15"></app-icon>
              </div>
              <div class="source-info">
                <span class="source-name">{{ s.name }}</span>
                <span class="source-attr">{{ s.attribution }}</span>
              </div>
              <div class="source-status">
                <span class="status-indicator" [class.active]="s.is_enabled">
                  <span class="indicator-dot"></span>
                  {{ s.is_enabled ? 'Live' : 'Paused' }}
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
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
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
    .agent-tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: var(--text-2xs);
      font-family: var(--font-mono);
      font-weight: 600;
      color: var(--color-brand-accent);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .pulse-beacon {
      width: 6px;
      height: 6px;
      border-radius: var(--radius-full);
      background-color: var(--color-brand-accent);
      box-shadow: 0 0 8px var(--color-brand-accent);
    }
    .title-group h1 {
      font-size: var(--text-2xl);
      font-weight: 700;
      color: var(--color-text-primary);
      margin: 2px 0 3px 0;
      letter-spacing: -0.025em;
    }
    .subtitle {
      font-size: var(--text-sm);
      color: var(--color-text-secondary);
      margin: 0;
      max-width: 650px;
    }
    .header-tags {
      display: flex;
      gap: var(--space-2);
      flex-wrap: wrap;
      margin-top: 2px;
    }
    .header-actions {
      flex-shrink: 0;
    }
    .run-btn {
      padding: 10px 20px;
      font-size: var(--text-sm);
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
      padding: var(--space-4);
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
      box-shadow: var(--shadow-sm);
      transition: border-color var(--motion-fast), box-shadow var(--motion-fast), transform var(--motion-fast);
    }
    .metric-card:hover {
      border-color: var(--color-border-hover);
      box-shadow: var(--shadow-md);
      transform: translateY(-2px);
    }
    .metric-icon-box {
      width: 40px;
      height: 40px;
      border-radius: var(--radius-md);
      background-color: var(--color-bg-surface-elevated-glass);
      border: 1px solid var(--color-border-subtle);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-brand-accent);
      flex-shrink: 0;
    }
    .icon-engine {
      color: var(--color-success-text);
    }
    .metric-body {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
    }
    .metric-label-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }
    .metric-label {
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
      font-weight: 600;
      line-height: 1.2;
    }
    .metric-micro-tag {
      font-size: 10px;
      font-family: var(--font-mono);
      color: var(--color-text-muted);
      background: var(--color-bg-surface-elevated);
      padding: 1px 5px;
      border-radius: 4px;
    }
    .metric-value {
      font-size: 1.6rem;
      font-weight: 700;
      color: var(--color-text-primary);
      letter-spacing: -0.03em;
      margin: 4px 0 2px 0;
      font-variant-numeric: tabular-nums;
    }
    .metric-hint {
      font-size: var(--text-2xs);
      color: var(--color-text-muted);
    }
    .status-text {
      font-size: var(--text-base);
      font-family: var(--font-mono);
      font-weight: 700;
      color: var(--color-success-text);
    }
    .engine-live-dot {
      width: 6px;
      height: 6px;
      border-radius: var(--radius-full);
      background-color: var(--color-success);
      box-shadow: 0 0 6px var(--color-success);
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
      margin-bottom: var(--space-4);
      border-bottom: 1px solid var(--color-border-subtle);
      padding-bottom: var(--space-3);
    }
    .panel-title-wrap {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .panel-title-wrap h2 {
      font-size: var(--text-base);
      font-weight: 700;
      color: var(--color-text-primary);
      margin: 0;
      letter-spacing: -0.015em;
    }
    .panel-icon-accent {
      color: var(--color-brand-accent);
    }
    .view-all-link {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: var(--text-xs);
      color: var(--color-brand-accent);
      font-weight: 600;
      transition: color var(--motion-fast);
    }
    .view-all-link:hover {
      color: var(--color-brand-primary-hover);
    }

    .source-count-badge {
      font-size: var(--text-2xs);
      font-family: var(--font-mono);
      font-weight: 600;
      color: var(--color-success-text);
      background: var(--color-success-bg);
      border: 1px solid var(--color-success-border);
      padding: 2px 7px;
      border-radius: var(--radius-pill);
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
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-2-5);
      box-shadow: var(--shadow-xs);
      transition: border-color var(--motion-fast), box-shadow var(--motion-fast), transform var(--motion-fast);
    }
    .job-item-card:hover {
      border-color: var(--color-border-hover);
      box-shadow: var(--shadow-sm);
      transform: translateY(-1.5px);
    }
    .job-item-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--space-2);
    }
    .company-row {
      display: flex;
      align-items: center;
      gap: var(--space-2-5);
    }
    .company-text {
      display: flex;
      flex-direction: column;
      line-height: 1.25;
    }
    .company-name {
      font-size: var(--text-xs);
      font-weight: 700;
      color: var(--color-text-primary);
    }
    .location-name {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-size: var(--text-2xs);
      color: var(--color-text-muted);
    }
    .score-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: var(--text-xs);
      font-weight: 700;
      font-family: var(--font-mono);
      padding: 3px 9px;
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
      line-height: 1.35;
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
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-3-5);
      background-color: var(--color-bg-surface-elevated-glass);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md);
      transition: border-color var(--motion-fast);
    }
    .source-row:hover {
      border-color: var(--color-border-hover);
    }
    .source-icon-box {
      width: 32px;
      height: 32px;
      border-radius: var(--radius-sm);
      background: var(--color-bg-surface-muted);
      border: 1px solid var(--color-border-subtle);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-brand-accent);
      flex-shrink: 0;
    }
    .source-info {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }
    .source-name {
      font-size: var(--text-sm);
      font-weight: 600;
      color: var(--color-text-primary);
    }
    .source-attr {
      font-size: var(--text-2xs);
      color: var(--color-text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .status-indicator {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: var(--text-2xs);
      font-weight: 600;
      padding: 3px 8px;
      border-radius: var(--radius-pill);
      background: rgba(148, 163, 184, 0.1);
      color: var(--color-text-muted);
    }
    .status-indicator.active {
      background: var(--color-success-bg);
      color: var(--color-success-text);
      border: 1px solid var(--color-success-border);
    }
    .indicator-dot {
      width: 5px;
      height: 5px;
      border-radius: var(--radius-full);
      background-color: currentColor;
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
        padding: var(--space-4);
        gap: var(--space-3);
      }
      .header-actions .btn {
        width: 100%;
      }
      .metrics-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: var(--space-2-5);
      }
      .metric-card {
        padding: var(--space-3);
        gap: var(--space-2-5);
      }
      .metric-icon-box {
        width: 34px;
        height: 34px;
      }
      .metric-value {
        font-size: var(--text-xl);
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
    this.api.getJobs({ limit: 5, min_score: 60 }).subscribe({
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
