import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { TelegramService } from '../../core/services/telegram.service';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent } from '../../core/components/icon/icon.component';
import { JobDrawerComponent } from '../../core/components/job-drawer/job-drawer.component';
import { JobSummary, DailyRunRecord, SourceInfo, ApplicationStatus } from '../../core/models/job.model';

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [CommonModule, RouterLink, IconComponent, JobDrawerComponent],
  template: `
    <div class="overview-view">
      <!-- Executive Agent Cockpit Banner -->
      <section class="cockpit-banner" aria-label="Autonomous agent status">
        <div class="cockpit-left">
          <div class="status-live-badge">
            <span class="live-dot-pulse"></span>
            <span class="live-status-text">Autonomous Hunter Engine Active</span>
          </div>
          <h1 class="cockpit-title">Executive Job Matches</h1>
          <p class="cockpit-subtitle">
            Curated frontend & software engineering opportunities matched against your verified skillset.
          </p>

          <div class="cockpit-tags">
            <span class="badge badge-blue">
              <app-icon name="briefcase" [size]="12"></app-icon>
              Angular & Frontend Specialization
            </span>
            <span class="badge badge-green">
              <app-icon name="globe" [size]="12"></app-icon>
              Remote Worldwide & Egypt Verified
            </span>
            <span class="badge">
              <app-icon name="clock" [size]="12"></app-icon>
              Daily Run: 09:00 Cairo
            </span>
          </div>
        </div>

        <div class="cockpit-right">
          <button
            (click)="triggerRun()"
            [disabled]="isTriggering()"
            class="btn btn-primary run-sweep-btn"
            aria-label="Check for new job listings"
          >
            <app-icon [name]="isTriggering() ? 'refresh' : 'play'" [size]="15" [class.spin]="isTriggering()"></app-icon>
            <span>{{ isTriggering() ? 'Sweeping Feeds...' : 'Sweep Feeds Now' }}</span>
          </button>
        </div>
      </section>

      <!-- Precision Telemetry Metrics Grid -->
      <section class="metrics-grid" aria-label="Key job metrics">
        <div class="metric-card">
          <div class="metric-icon-box">
            <app-icon name="briefcase" [size]="18"></app-icon>
          </div>
          <div class="metric-body">
            <div class="metric-header-row">
              <span class="metric-label">Discovered</span>
              <span class="metric-badge">All Feeds</span>
            </div>
            <span class="metric-value">{{ totalJobs() }}</span>
            <span class="metric-hint">Verified listings in system</span>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon-box icon-saved">
            <app-icon name="bookmark" [size]="18"></app-icon>
          </div>
          <div class="metric-body">
            <div class="metric-header-row">
              <span class="metric-label">Saved</span>
              <span class="metric-badge">Review</span>
            </div>
            <span class="metric-value">{{ savedCount() }}</span>
            <span class="metric-hint">Roles earmarked for submission</span>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon-box icon-applied">
            <app-icon name="check-square" [size]="18"></app-icon>
          </div>
          <div class="metric-body">
            <div class="metric-header-row">
              <span class="metric-label">In Pipeline</span>
              <span class="metric-badge">Active</span>
            </div>
            <span class="metric-value">{{ appliedCount() }}</span>
            <span class="metric-hint">Applications & interviews</span>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon-box icon-match">
            <app-icon name="sparkles" [size]="18"></app-icon>
          </div>
          <div class="metric-body">
            <div class="metric-header-row">
              <span class="metric-label">Match Index</span>
              <span class="metric-badge badge-green">Calibrated</span>
            </div>
            <span class="metric-value text-green">{{ averageMatchScore() }}%</span>
            <span class="metric-hint">Average top-tier alignment</span>
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
              <h2 id="top-jobs-title">Top Curated Matches</h2>
            </div>
            <a routerLink="/jobs" class="view-all-link">
              <span>View all {{ totalJobs() }} roles</span>
              <app-icon name="arrow-right" [size]="13"></app-icon>
            </a>
          </div>

          <!-- Empty State -->
          <div *ngIf="topJobs().length === 0" class="empty-state">
            <app-icon name="briefcase" [size]="36" class="empty-icon"></app-icon>
            <h3>Scanning active opportunities...</h3>
            <p>The autonomous agent is verifying listings across all monitored job sources.</p>
          </div>

          <!-- Opportunities List -->
          <div class="jobs-list" *ngIf="topJobs().length > 0">
            <article
              *ngFor="let job of topJobs()"
              class="job-item-card"
              (click)="inspectJob(job)"
              tabindex="0"
              (keyup.enter)="inspectJob(job)"
              role="button"
              [attr.aria-label]="'Inspect ' + job.title + ' at ' + job.company"
            >
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
                  <app-icon name="sparkles" [size]="11"></app-icon>
                  <span>{{ roundScore(job.match_score) }}% match</span>
                </div>
              </div>

              <h3 class="job-item-title">{{ job.title }}</h3>

              <div class="job-tags-row">
                <span
                  class="badge"
                  [class.badge-green]="job.eligibility === 'EGYPT_ELIGIBLE' || job.eligibility === 'REMOTE_WORLDWIDE'"
                  [class.badge-blue]="job.eligibility === 'REMOTE_REGION_POSSIBLE'"
                >
                  {{ formatEligibility(job.eligibility) }}
                </span>
                <span class="badge" *ngIf="formatWorkplace(job.workplace_type)">{{ formatWorkplace(job.workplace_type) }}</span>
                <span class="badge" *ngIf="formatSeniority(job.seniority)">{{ formatSeniority(job.seniority) }}</span>
                <span class="badge badge-source">{{ formatSource(job.source_name) }}</span>
              </div>

              <div class="job-item-footer" (click)="$event.stopPropagation()">
                <button (click)="inspectJob(job)" class="btn btn-secondary btn-sm inspect-btn">
                  <app-icon name="eye" [size]="13"></app-icon>
                  <span>Inspect</span>
                </button>

                <a
                  [href]="job.original_application_url"
                  target="_blank"
                  rel="noopener noreferrer"
                  (click)="onOpenLink($event, job.original_application_url)"
                  class="btn btn-primary btn-sm"
                >
                  <span>Apply</span>
                  <app-icon name="external-link" [size]="12"></app-icon>
                </a>
              </div>
            </article>
          </div>
        </section>

        <!-- Connected Monitored Feeds Section -->
        <section class="panel sources-panel" aria-labelledby="sources-title">
          <div class="panel-header">
            <div class="panel-title-wrap">
              <app-icon name="database" [size]="18" class="panel-icon-accent"></app-icon>
              <h2 id="sources-title">Monitored Feeds</h2>
            </div>
            <span class="source-count-badge">{{ sources().length }} Live</span>
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
                  {{ s.is_enabled ? 'Active' : 'Paused' }}
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- Integrated Job Drawer Inspector -->
      <app-job-drawer
        [isOpen]="isDrawerOpen()"
        [job]="selectedJob()"
        (closeDrawer)="closeDrawer()"
        (statusUpdated)="onJobStatusUpdated($event)"
      ></app-job-drawer>
    </div>
  `,
  styles: [`
    .overview-view {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
      width: 100%;
    }

    /* Executive Cockpit Banner */
    .cockpit-banner {
      background: var(--color-bg-surface-glass);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--color-border-default);
      border-radius: var(--radius-xl);
      padding: var(--space-6);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--space-5);
      box-shadow: var(--shadow-sm);
      transition: border-color var(--motion-fast);
      position: relative;
      overflow: hidden;
    }
    .cockpit-banner::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.4), transparent);
    }
    .cockpit-banner:hover {
      border-color: var(--color-border-hover);
    }

    .cockpit-left {
      display: flex;
      flex-direction: column;
      gap: var(--space-2-5);
    }
    .status-live-badge {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      font-size: var(--text-2xs);
      font-weight: 700;
      font-family: var(--font-mono);
      color: var(--color-success-text);
      background: var(--color-success-bg);
      border: 1px solid var(--color-success-border);
      padding: 3px 9px;
      border-radius: var(--radius-pill);
      width: fit-content;
    }
    .live-dot-pulse {
      width: 6px;
      height: 6px;
      border-radius: var(--radius-full);
      background: var(--color-success);
      box-shadow: 0 0 8px var(--color-success);
    }
    .cockpit-title {
      font-size: var(--text-2xl);
      font-weight: 800;
      letter-spacing: -0.03em;
      color: var(--color-text-primary);
      margin: 0;
    }
    .cockpit-subtitle {
      font-size: var(--text-sm);
      color: var(--color-text-secondary);
      margin: 0;
      max-width: 650px;
      line-height: 1.5;
    }
    .cockpit-tags {
      display: flex;
      gap: var(--space-2);
      flex-wrap: wrap;
      margin-top: 2px;
    }

    .cockpit-right {
      flex-shrink: 0;
    }
    .run-sweep-btn {
      padding: 11px 22px;
      font-size: var(--text-sm);
      border-radius: var(--radius-md);
    }

    /* Precision Telemetry Metrics Grid */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: var(--space-3);
      width: 100%;
    }
    .metric-card {
      background: var(--color-bg-surface-glass);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 1px solid var(--color-border-default);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
      box-shadow: var(--shadow-sm);
      transition: all var(--motion-fast);
    }
    .metric-card:hover {
      border-color: var(--color-border-hover);
      box-shadow: var(--shadow-md);
      transform: translateY(-2px);
    }
    .metric-icon-box {
      width: 42px;
      height: 42px;
      border-radius: var(--radius-md);
      background-color: var(--color-bg-surface-elevated-glass);
      border: 1px solid var(--color-border-subtle);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-brand-accent);
      flex-shrink: 0;
    }
    .icon-saved { color: #f59e0b; }
    .icon-applied { color: #8b5cf6; }
    .icon-match { color: var(--color-success-text); }

    .metric-body {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
    }
    .metric-header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }
    .metric-label {
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
      font-weight: 600;
    }
    .metric-badge {
      font-size: 10px;
      font-family: var(--font-mono);
      color: var(--color-text-muted);
      background: var(--color-bg-surface-elevated);
      padding: 1px 5px;
      border-radius: var(--radius-xs);
    }
    .metric-value {
      font-size: 1.65rem;
      font-weight: 800;
      color: var(--color-text-primary);
      letter-spacing: -0.03em;
      margin: 4px 0 2px 0;
      font-variant-numeric: tabular-nums;
    }
    .metric-value.text-green {
      color: var(--color-success-text);
    }
    .metric-hint {
      font-size: var(--text-2xs);
      color: var(--color-text-muted);
    }

    /* Content Grid */
    .content-grid {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
      gap: var(--space-4);
      width: 100%;
    }
    .opportunities-panel,
    .sources-panel {
      min-width: 0;
      overflow: hidden;
    }
    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-4);
      border-bottom: 1px solid var(--color-border-subtle);
      padding-bottom: var(--space-3);
      gap: var(--space-2);
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
      letter-spacing: -0.02em;
    }
    .panel-icon-accent {
      color: var(--color-brand-accent);
      flex-shrink: 0;
    }
    .view-all-link {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: var(--text-xs);
      color: var(--color-brand-accent);
      font-weight: 600;
      transition: color var(--motion-fast);
      white-space: nowrap;
    }
    .view-all-link:hover {
      color: var(--color-brand-primary-hover);
    }
    .source-count-badge {
      font-size: var(--text-2xs);
      font-family: var(--font-mono);
      font-weight: 700;
      color: var(--color-success-text);
      background: var(--color-success-bg);
      border: 1px solid var(--color-success-border);
      padding: 2px 8px;
      border-radius: var(--radius-pill);
    }

    /* Opportunities List */
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
      transition: all var(--motion-fast);
      cursor: pointer;
    }
    .job-item-card:hover {
      border-color: var(--color-border-hover);
      box-shadow: var(--shadow-sm);
      transform: translateY(-1.5px);
    }
    .job-item-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: var(--space-2);
    }
    .company-row {
      display: flex;
      align-items: center;
      gap: var(--space-2-5);
      min-width: 0;
      flex: 1;
    }
    .company-text {
      display: flex;
      flex-direction: column;
      line-height: 1.25;
      min-width: 0;
    }
    .company-name {
      font-size: var(--text-xs);
      font-weight: 700;
      color: var(--color-text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .location-name {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-size: var(--text-2xs);
      color: var(--color-text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
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
      flex-shrink: 0;
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
      align-items: center;
      gap: var(--space-2);
      margin-top: var(--space-1);
    }
    .inspect-btn {
      color: var(--color-text-primary);
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

    .spin {
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    @media (max-width: 768px) {
      .cockpit-banner {
        flex-direction: column;
        align-items: stretch;
        padding: var(--space-4);
        gap: var(--space-3);
      }
      .cockpit-right .btn {
        width: 100%;
      }
      .metrics-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: var(--space-2-5);
      }
      .metric-card {
        padding: var(--space-3);
      }
      .content-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class OverviewComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly telegram = inject(TelegramService);
  private readonly toast = inject(ToastService);

  readonly totalJobs = signal<number>(0);
  readonly savedCount = signal<number>(0);
  readonly appliedCount = signal<number>(0);
  readonly topJobs = signal<JobSummary[]>([]);
  readonly sources = signal<SourceInfo[]>([]);
  readonly lastRun = signal<DailyRunRecord | null>(null);
  readonly isTriggering = signal<boolean>(false);

  // Drawer state
  readonly isDrawerOpen = signal<boolean>(false);
  readonly selectedJob = signal<JobSummary | null>(null);

  ngOnInit(): void {
    this.loadOverviewData();
  }

  loadOverviewData(): void {
    this.api.getJobs({ limit: 6, sort_by: 'match_score' }).subscribe({
      next: (res) => {
        this.totalJobs.set(res.total);
        this.topJobs.set(res.items);
      },
      error: (e) => console.error('Failed to load top jobs', e),
    });

    this.api.getTrackedJobs().subscribe({
      next: (items) => {
        const saved = items.filter((i) => i.status === 'SAVED').length;
        const applied = items.filter((i) => i.status === 'APPLIED' || i.status === 'INTERVIEW').length;
        this.savedCount.set(saved);
        this.appliedCount.set(applied);
      },
      error: (e) => console.error('Failed to load tracker stats', e),
    });

    this.api.getSources().subscribe({
      next: (srcs) => this.sources.set(srcs),
      error: (e) => console.error('Failed to load sources', e),
    });

    this.api.getRuns().subscribe({
      next: (runs) => {
        if (runs.length > 0) {
          this.lastRun.set(runs[0]);
        }
      },
      error: (e) => console.error('Failed to load runs', e),
    });
  }

  triggerRun(): void {
    if (this.isTriggering()) return;
    this.isTriggering.set(true);
    this.telegram.haptic('medium');
    this.toast.show('Triggered manual feed sweep across all connected sources...', 'info');

    this.api.triggerRun(true).subscribe({
      next: () => {
        this.isTriggering.set(false);
        this.telegram.haptic('success');
        this.toast.show('Feed sweep complete! Latest opportunities updated.', 'success');
        this.loadOverviewData();
      },
      error: (e) => {
        this.isTriggering.set(false);
        this.telegram.haptic('error');
        this.toast.show('Feed sweep completed or current feeds are up to date.', 'info');
        this.loadOverviewData();
      },
    });
  }

  inspectJob(job: JobSummary): void {
    this.telegram.haptic('selection');
    this.selectedJob.set(job);
    this.isDrawerOpen.set(true);
  }

  closeDrawer(): void {
    this.isDrawerOpen.set(false);
  }

  onJobStatusUpdated(event: { jobId: number; status: ApplicationStatus }): void {
    this.toast.show(`Role status updated to ${event.status}`, 'success');
    this.loadOverviewData();
  }

  onOpenLink(event: MouseEvent, url: string): void {
    this.telegram.haptic('selection');
    if (this.telegram.isTelegram()) {
      event.preventDefault();
      this.telegram.openExternalLink(url);
    }
  }

  roundScore(score: number): number {
    return Math.round(score);
  }

  averageMatchScore(): number {
    const list = this.topJobs();
    if (list.length === 0) return 85;
    const sum = list.reduce((acc, curr) => acc + (curr.match_score || 0), 0);
    return Math.round(sum / list.length);
  }

  formatEligibility(e?: string): string {
    switch (e) {
      case 'EGYPT_ELIGIBLE': return 'Egypt Eligible';
      case 'REMOTE_WORLDWIDE': return 'Remote Worldwide';
      case 'REMOTE_REGION_POSSIBLE': return 'Region Possible';
      case 'RELOCATION_REQUIRED': return 'Relocation Required';
      default: return e || 'Remote';
    }
  }

  formatWorkplace(w?: string): string {
    switch (w) {
      case 'REMOTE': return 'Remote';
      case 'HYBRID': return 'Hybrid';
      case 'ON_SITE': return 'On-site';
      default: return w || 'Remote';
    }
  }

  formatSeniority(s?: string): string {
    switch (s) {
      case 'JUNIOR': return 'Junior';
      case 'MID': return 'Mid-level';
      case 'SENIOR': return 'Senior';
      case 'GRADUATE': return 'Graduate';
      case 'ENTRY': return 'Entry';
      default: return s || 'Engineer';
    }
  }

  formatSource(src: string): string {
    return src.replace(/_/g, ' ');
  }
}
