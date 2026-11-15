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
      <!-- Top Telemetry Command Strip -->
      <section class="telemetry-strip" aria-label="Autonomous agent telemetry">
        <div class="strip-left">
          <div class="agent-status-indicator">
            <span class="status-pulse-dot"></span>
            <span class="agent-status-label">Autonomous Hunter Active</span>
          </div>
          <span class="strip-divider">|</span>
          <span class="strip-meta-text">Next Sweep: 09:00 Cairo</span>
          <span class="strip-divider">|</span>
          <span class="strip-meta-text">{{ sources().length }} Monitored Feeds</span>
        </div>

        <div class="strip-metrics">
          <div class="mini-metric">
            <span class="mini-metric-num">{{ totalJobs() }}</span>
            <span class="mini-metric-label">Discovered</span>
          </div>
          <div class="mini-metric">
            <span class="mini-metric-num text-amber">{{ savedCount() }}</span>
            <span class="mini-metric-label">Saved</span>
          </div>
          <div class="mini-metric">
            <span class="mini-metric-num text-blue">{{ appliedCount() }}</span>
            <span class="mini-metric-label">In Pipeline</span>
          </div>
          <div class="mini-metric">
            <span class="mini-metric-num text-green">{{ averageMatchScore() }}%</span>
            <span class="mini-metric-label">Avg Match</span>
          </div>
        </div>

        <div class="strip-right">
          <button
            (click)="triggerRun()"
            [disabled]="isTriggering()"
            class="btn btn-primary btn-sm sweep-trigger-btn"
            aria-label="Sweep feeds now"
          >
            <app-icon [name]="isTriggering() ? 'refresh' : 'play'" [size]="12" [class.spin]="isTriggering()"></app-icon>
            <span>{{ isTriggering() ? 'Sweeping...' : 'Sweep Feeds' }}</span>
          </button>
        </div>
      </section>

      <!-- Main Content Grid -->
      <div class="overview-grid">
        <!-- Left: Top Curated Opportunities -->
        <main class="primary-opportunities-col" aria-labelledby="top-matches-heading">
          <div class="section-title-bar">
            <div class="title-with-count">
              <h2 id="top-matches-heading">High-Alignment Matches</h2>
              <span class="count-tag">{{ topJobs().length }} top roles</span>
            </div>

            <a routerLink="/jobs" class="view-all-link">
              <span>All {{ totalJobs() }} jobs</span>
              <app-icon name="arrow-right" [size]="12"></app-icon>
            </a>
          </div>

          <!-- Empty State -->
          <div *ngIf="topJobs().length === 0" class="empty-panel">
            <app-icon name="briefcase" [size]="28" class="text-muted"></app-icon>
            <p>Scanning active opportunities across all verified feeds...</p>
          </div>

          <!-- Match Rows List -->
          <div class="matches-list" *ngIf="topJobs().length > 0">
            <article
              *ngFor="let job of topJobs()"
              class="match-row-card"
              (click)="inspectJob(job)"
              tabindex="0"
              (keyup.enter)="inspectJob(job)"
              role="button"
              [attr.aria-label]="'Inspect ' + job.title + ' at ' + job.company"
            >
              <div class="match-left">
                <span class="company-avatar">{{ job.company.charAt(0) }}</span>
                <div class="match-info">
                  <div class="match-header-line">
                    <h3 class="role-title-text">{{ job.title }}</h3>
                    <span class="score-chip" [class.high-score]="job.match_score >= 70">
                      {{ roundScore(job.match_score) }}% match
                    </span>
                  </div>

                  <div class="match-meta-line">
                    <span class="company-name-text">{{ job.company }}</span>
                    <span class="meta-dot">·</span>
                    <span class="meta-spec">
                      <app-icon name="map-pin" [size]="10"></app-icon>
                      {{ job.raw_location || 'Remote Worldwide' }}
                    </span>
                    <span class="meta-dot">·</span>
                    <span class="meta-badge-text">{{ formatEligibility(job.eligibility) }}</span>
                    <span class="meta-dot" *ngIf="formatWorkplace(job.workplace_type)">·</span>
                    <span class="meta-badge-text" *ngIf="formatWorkplace(job.workplace_type)">{{ formatWorkplace(job.workplace_type) }}</span>
                  </div>
                </div>
              </div>

              <div class="match-actions" (click)="$event.stopPropagation()">
                <button (click)="inspectJob(job)" class="btn btn-secondary btn-sm" title="Inspect Match Specs">
                  <app-icon name="eye" [size]="12"></app-icon>
                  <span>Inspect</span>
                </button>
                <a
                  [href]="job.original_application_url"
                  target="_blank"
                  rel="noopener noreferrer"
                  (click)="onOpenLink($event, job.original_application_url)"
                  class="btn btn-primary btn-sm"
                  title="Apply on company portal"
                >
                  <span>Apply</span>
                  <app-icon name="external-link" [size]="11"></app-icon>
                </a>
              </div>
            </article>
          </div>
        </main>

        <!-- Right: Feeds & System Health Ledger -->
        <aside class="secondary-ledger-col" aria-label="System status">
          <section class="ledger-card">
            <div class="ledger-card-header">
              <div class="ledger-title-wrap">
                <app-icon name="database" [size]="14"></app-icon>
                <h3>Monitored ATS Feeds</h3>
              </div>
              <span class="active-badge">{{ sources().length }} Live</span>
            </div>

            <div class="sources-ledger">
              <div *ngFor="let s of sources()" class="source-ledger-row">
                <div class="source-name-wrap">
                  <span class="source-dot"></span>
                  <span class="source-name">{{ s.name }}</span>
                </div>
                <span class="source-status-text">Active</span>
              </div>
            </div>
          </section>

          <!-- Guardrails & Target Profile Snapshot -->
          <section class="ledger-card">
            <div class="ledger-card-header">
              <div class="ledger-title-wrap">
                <app-icon name="shield-check" [size]="14" class="text-green"></app-icon>
                <h3>Engine Calibration</h3>
              </div>
            </div>

            <div class="ledger-bullets">
              <div class="bullet-row">
                <span class="bullet-label">Focus:</span>
                <span class="bullet-val">Frontend & Angular Specialist</span>
              </div>
              <div class="bullet-row">
                <span class="bullet-label">Geography:</span>
                <span class="bullet-val">Egypt & Remote Worldwide</span>
              </div>
              <div class="bullet-row">
                <span class="bullet-label">Min Score:</span>
                <span class="bullet-val">70% Digest Threshold</span>
              </div>
              <div class="bullet-row">
                <span class="bullet-label">Automation:</span>
                <span class="bullet-val">Daily 09:00 Cairo Telegram</span>
              </div>
            </div>
          </section>
        </aside>
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
      gap: var(--space-4);
      width: 100%;
    }

    /* Top Telemetry Command Strip */
    .telemetry-strip {
      background: var(--color-bg-surface-glass);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md);
      padding: 10px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-4);
      flex-wrap: wrap;
    }

    .strip-left {
      display: flex;
      align-items: center;
      gap: var(--space-2-5);
    }
    .agent-status-indicator {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .status-pulse-dot {
      width: 7px;
      height: 7px;
      border-radius: var(--radius-full);
      background: var(--color-success);
    }
    .agent-status-label {
      font-size: var(--text-xs);
      font-weight: 700;
      color: var(--color-text-primary);
    }
    .strip-divider {
      color: var(--color-border-default);
      font-size: 11px;
    }
    .strip-meta-text {
      font-size: 11px;
      color: var(--color-text-muted);
      font-family: var(--font-mono);
    }

    .strip-metrics {
      display: flex;
      align-items: center;
      gap: var(--space-4);
    }
    .mini-metric {
      display: flex;
      align-items: baseline;
      gap: 5px;
    }
    .mini-metric-num {
      font-size: var(--text-sm);
      font-weight: 800;
      font-family: var(--font-mono);
      color: var(--color-text-primary);
    }
    .mini-metric-label {
      font-size: 10px;
      text-transform: uppercase;
      color: var(--color-text-muted);
      letter-spacing: 0.04em;
    }

    .text-amber { color: var(--color-warning-text); }
    .text-blue { color: var(--color-brand-accent); }
    .text-green { color: var(--color-success-text); }
    .text-muted { color: var(--color-text-muted); }

    .strip-right {
      flex-shrink: 0;
    }
    .sweep-trigger-btn {
      font-size: 11px;
    }

    /* Main Grid */
    .overview-grid {
      display: grid;
      grid-template-columns: minmax(0, 2.3fr) minmax(0, 1fr);
      gap: var(--space-4);
      width: 100%;
    }

    .section-title-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-3);
      padding-bottom: var(--space-2);
      border-bottom: 1px solid var(--color-border-subtle);
    }
    .title-with-count {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .title-with-count h2 {
      font-size: var(--text-sm);
      font-weight: 700;
      margin: 0;
      color: var(--color-text-primary);
    }
    .count-tag {
      font-size: 11px;
      font-family: var(--font-mono);
      color: var(--color-text-muted);
      background: var(--color-bg-surface-elevated);
      padding: 1px 6px;
      border-radius: var(--radius-xs);
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
      text-decoration: underline;
    }

    /* Matches Rows List */
    .matches-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .match-row-card {
      background: var(--color-bg-surface-glass);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md);
      padding: 10px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      cursor: pointer;
      transition: background-color var(--motion-fast), border-color var(--motion-fast);
    }
    /* Silky non-jumpy hover */
    .match-row-card:hover {
      background-color: var(--color-bg-surface-hover);
      border-color: var(--color-border-hover);
    }

    .match-left {
      display: flex;
      align-items: center;
      gap: var(--space-2-5);
      min-width: 0;
      flex: 1;
    }

    .match-info {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
      flex: 1;
    }

    .match-header-line {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-width: 0;
    }
    .role-title-text {
      font-size: var(--text-xs);
      font-weight: 700;
      color: var(--color-text-primary);
      margin: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .score-chip {
      font-size: 11px;
      font-family: var(--font-mono);
      font-weight: 700;
      padding: 1px 6px;
      border-radius: var(--radius-xs);
      background: var(--color-brand-subtle);
      color: var(--color-brand-accent);
      border: 1px solid var(--color-brand-border);
      flex-shrink: 0;
    }
    .score-chip.high-score {
      background: var(--color-success-bg);
      color: var(--color-success-text);
      border-color: var(--color-success-border);
    }

    .match-meta-line {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      color: var(--color-text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .company-name-text {
      font-weight: 600;
      color: var(--color-text-secondary);
    }
    .meta-dot {
      color: var(--color-border-default);
    }
    .meta-spec {
      display: inline-flex;
      align-items: center;
      gap: 3px;
    }
    .meta-badge-text {
      color: var(--color-text-muted);
    }

    .match-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }

    /* Right Column: Ledger */
    .secondary-ledger-col {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .ledger-card {
      background: var(--color-bg-surface-glass);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md);
      padding: var(--space-3-5);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .ledger-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--color-border-subtle);
      padding-bottom: var(--space-2);
    }
    .ledger-title-wrap {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .ledger-title-wrap h3 {
      font-size: var(--text-xs);
      font-weight: 700;
      margin: 0;
      color: var(--color-text-primary);
    }
    .active-badge {
      font-size: 10px;
      font-family: var(--font-mono);
      font-weight: 700;
      color: var(--color-success-text);
      background: var(--color-success-bg);
      padding: 1px 6px;
      border-radius: var(--radius-xs);
      border: 1px solid var(--color-success-border);
    }

    .sources-ledger {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .source-ledger-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 5px 8px;
      background: var(--color-bg-surface-elevated);
      border-radius: var(--radius-xs);
      border: 1px solid var(--color-border-subtle);
    }
    .source-name-wrap {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .source-dot {
      width: 5px;
      height: 5px;
      border-radius: var(--radius-full);
      background: var(--color-success);
    }
    .source-name {
      font-size: 11px;
      font-weight: 600;
      color: var(--color-text-primary);
    }
    .source-status-text {
      font-size: 10px;
      font-family: var(--font-mono);
      color: var(--color-text-muted);
    }

    .ledger-bullets {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .bullet-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      padding: 4px 0;
      border-bottom: 1px solid var(--color-border-subtle);
    }
    .bullet-row:last-child {
      border-bottom: none;
    }
    .bullet-label {
      color: var(--color-text-muted);
    }
    .bullet-val {
      font-weight: 600;
      color: var(--color-text-primary);
    }

    .empty-panel {
      padding: var(--space-6);
      text-align: center;
      color: var(--color-text-muted);
      font-size: var(--text-xs);
    }

    .spin {
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    @media (max-width: 860px) {
      .overview-grid {
        grid-template-columns: 1fr;
      }
      .telemetry-strip {
        flex-direction: column;
        align-items: stretch;
        gap: var(--space-3);
      }
      .strip-metrics {
        justify-content: space-between;
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
    this.api.getJobs({ limit: 8, sort_by: 'match_score' }).subscribe({
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
    this.toast.show('Initiating autonomous sweep across feeds...', 'info');

    this.api.triggerRun(true).subscribe({
      next: () => {
        this.isTriggering.set(false);
        this.telegram.haptic('success');
        this.toast.show('Sweep completed! Opportunities refreshed.', 'success');
        this.loadOverviewData();
      },
      error: () => {
        this.isTriggering.set(false);
        this.telegram.haptic('error');
        this.toast.show('Feeds are already up to date.', 'info');
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
}
