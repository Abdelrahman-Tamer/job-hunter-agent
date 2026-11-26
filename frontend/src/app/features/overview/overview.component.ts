import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { TelegramService } from '../../core/services/telegram.service';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent } from '../../core/components/icon/icon.component';
import { JobDrawerComponent } from '../../core/components/job-drawer/job-drawer.component';
import {
  UiArchitecturalMotifComponent,
  UiBadgeComponent,
  UiButtonComponent,
  UiCardComponent,
  UiEmptyStateComponent,
  UiMatchPillComponent,
  UiSkeletonComponent,
} from '../../core/components/ui';
import {
  ApplicationStatus,
  DailyRunRecord,
  JobSummary,
  SourceInfo,
  WorkplaceType,
} from '../../core/models/job.model';

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [
    RouterLink,
    IconComponent,
    JobDrawerComponent,
    UiArchitecturalMotifComponent,
    UiBadgeComponent,
    UiButtonComponent,
    UiCardComponent,
    UiEmptyStateComponent,
    UiMatchPillComponent,
    UiSkeletonComponent,
  ],
  template: `
    <div class="overview-command-center">
      <!-- Architectural Hero Header -->
      <header class="overview-hero">
        <ui-architectural-motif variant="header" />

        <div class="hero-inner">
          <div class="hero-copy">
            <div class="hero-status-row">
              <ui-badge tone="emerald" size="sm" [dot]="true">
                Cairo 09:00 Radar
              </ui-badge>
              <ui-badge tone="neutral" size="sm" [mono]="true">
                {{ sources().length }} feeds active
              </ui-badge>
            </div>
            <h1 class="hero-title">Career Intelligence</h1>
            <p class="hero-subtitle">
              Real-time overview of matched frontend roles, regional discovery, and pipeline momentum.
            </p>
          </div>

          <div class="hero-actions">
            <ui-button
              variant="primary"
              size="md"
              [loading]="isSweeping()"
              [disabled]="isSweeping()"
              ariaLabel="Sweep feeds now"
              (clicked)="triggerSweep()"
            >
              <app-icon name="play" [size]="14" />
              <span>{{ isSweeping() ? 'Sweeping Feeds...' : 'Sweep Feeds Now' }}</span>
            </ui-button>
          </div>
        </div>
      </header>

      <!-- KPI Bento Grid -->
      <section class="kpi-cards-grid" aria-label="Key performance indicators">
        <a routerLink="/jobs" class="kpi-link" (click)="onNavClick()">
          <ui-card variant="elevated" padding="md" [interactive]="true">
            <div class="kpi-top">
              <span class="kpi-label">Verified Roles</span>
              <app-icon name="briefcase" [size]="15" class="kpi-icon" />
            </div>
            <div class="kpi-num tabular-nums">{{ totalJobs() }}</div>
            <span class="kpi-subtext">Active on radar</span>
          </ui-card>
        </a>

        <a routerLink="/jobs" [queryParams]="{ segment: 'EGYPT' }" class="kpi-link" (click)="onNavClick()">
          <ui-card variant="elevated" padding="md" [interactive]="true">
            <div class="kpi-top">
              <span class="kpi-label">Egypt Frontend</span>
              <app-icon name="map-pin" [size]="15" class="kpi-icon text-emerald" />
            </div>
            <div class="kpi-num tabular-nums text-emerald">{{ countEgypt() }}</div>
            <span class="kpi-subtext">Cairo, Giza &amp; Alex</span>
          </ui-card>
        </a>

        <a routerLink="/jobs" [queryParams]="{ segment: 'REMOTE_GCC_ABROAD' }" class="kpi-link" (click)="onNavClick()">
          <ui-card variant="elevated" padding="md" [interactive]="true">
            <div class="kpi-top">
              <span class="kpi-label">Remote GCC &amp; Abroad</span>
              <app-icon name="globe" [size]="15" class="kpi-icon text-copper" />
            </div>
            <div class="kpi-num tabular-nums text-copper">{{ countRemote() }}</div>
            <span class="kpi-subtext">Gulf &amp; Worldwide</span>
          </ui-card>
        </a>

        <a routerLink="/tracker" class="kpi-link" (click)="onNavClick()">
          <ui-card variant="glass" padding="md" [interactive]="true">
            <div class="kpi-top">
              <span class="kpi-label">Active Pipeline</span>
              <app-icon name="bookmark" [size]="15" class="kpi-icon text-amber" />
            </div>
            <div class="kpi-num tabular-nums text-amber">{{ totalPipeline() }}</div>
            <span class="kpi-subtext tabular-nums">{{ savedCount() }} Saved · {{ appliedCount() }} Active</span>
          </ui-card>
        </a>
      </section>

      <!-- Two-Column Bento Layout -->
      <div class="bento-layout-grid">
        <!-- Left Column (Primary): High-Match Spotlight -->
        <ui-card variant="elevated" padding="md" class="bento-primary-card">
          <header class="bento-card-header">
            <div class="header-title-wrap">
              <app-icon name="sparkles" [size]="15" class="text-copper" />
              <h2 class="bento-title">Top Opportunity Matches</h2>
            </div>

            <a routerLink="/jobs" class="view-all-link" (click)="onNavClick()">
              <span>View all {{ totalJobs() }}</span>
              <app-icon name="arrow-right" [size]="13" />
            </a>
          </header>

          @if (isLoadingTopJobs()) {
            <div class="skeletons-stack">
              @for (item of [1, 2, 3, 4, 5]; track item) {
                <ui-skeleton height="76px" rounded="md" />
              }
            </div>
          } @else if (topJobs().length === 0) {
            <ui-empty-state
              icon="briefcase"
              title="No Opportunities Synced Yet"
              subtitle="Trigger an immediate feed sweep to discover active frontend engineering roles."
            >
              <div action>
                <ui-button variant="primary" size="sm" (clicked)="triggerSweep()">
                  <app-icon name="play" [size]="12" />
                  <span>Sweep Feeds</span>
                </ui-button>
              </div>
            </ui-empty-state>
          } @else {
            <div class="matches-list" role="list">
              @for (job of topJobs(); track job.id) {
                <article
                  (click)="openDrawer(job)"
                  (keydown.enter)="openDrawer(job)"
                  class="match-item-row"
                  tabindex="0"
                  role="listitem"
                  [attr.aria-label]="job.title + ' at ' + job.company"
                >
                  <div class="match-main-content">
                    <div class="match-title-line">
                      <h3 class="role-name" dir="auto">{{ job.title }}</h3>
                    </div>

                    <div class="match-meta-line">
                      <span class="company-text" dir="auto">{{ job.company }}</span>
                      @if (job.raw_location) {
                        <span class="dot-separator" aria-hidden="true">/</span>
                        <span class="location-truncate" dir="auto">{{ job.raw_location }}</span>
                      }
                      <span class="dot-separator" aria-hidden="true">/</span>
                      <span class="time-item tabular-nums">
                        {{ formatRelativeDate(job.published_at || job.first_seen_at) }}
                      </span>
                    </div>

                    <div class="match-badges-row">
                      @if (hasDirectContact(job)) {
                        <ui-badge tone="copper" size="sm">
                          <app-icon name="mail" [size]="10" />
                          <span>{{ job.direct_email ? 'Direct Email' : 'Direct Contact' }}</span>
                        </ui-badge>
                      }
                      @if (job.is_social_post) {
                        <ui-badge tone="glass" size="sm" [dot]="true">LinkedIn</ui-badge>
                      } @else if (job.origin_board) {
                        <ui-badge tone="glass" size="sm">{{ job.origin_board }}</ui-badge>
                      }
                      <ui-badge
                        [tone]="job.workplace_type === 'REMOTE' ? 'emerald' : 'neutral'"
                        size="sm"
                      >
                        {{ formatWorkplace(job.workplace_type) }}
                      </ui-badge>
                    </div>
                  </div>

                  <div class="match-right-col">
                    <ui-match-pill [score]="roundScore(job.match_score)" size="sm" />
                    <app-icon name="chevron-right" [size]="15" class="match-chevron" />
                  </div>
                </article>
              }
            </div>
          }
        </ui-card>

        <!-- Right Column (Secondary): Source Health, Latest Sweep & Alignment -->
        <aside class="bento-secondary-col" aria-label="Platform telemetry and source health">
          <ui-card variant="glass" padding="md">
            <header class="bento-card-header">
              <div class="header-title-wrap">
                <app-icon name="database" [size]="14" class="text-copper" />
                <h2 class="bento-title">Feed Health &amp; Ingestion</h2>
              </div>
              <ui-badge tone="emerald" size="sm" [dot]="true">
                {{ sources().length }} Active
              </ui-badge>
            </header>

            <div class="sources-health-list">
              @for (s of sources(); track s.name) {
                <div class="source-status-row">
                  <div class="source-info-left">
                    <span class="source-live-dot" [class.enabled]="s.is_enabled" aria-hidden="true"></span>
                    <span class="source-title">{{ s.name }}</span>
                  </div>
                  <span class="source-type-pill">{{ s.source_type }}</span>
                </div>
              }
            </div>
          </ui-card>

          @if (lastRun(); as run) {
            <ui-card variant="elevated" padding="md">
              <header class="bento-card-header">
                <div class="header-title-wrap">
                  <app-icon name="activity" [size]="14" class="text-copper" />
                  <h2 class="bento-title">Latest Sweep Metrics</h2>
                </div>
                <span class="run-date-tag tabular-nums">{{ run.run_date }}</span>
              </header>

              <div class="sweep-metrics-grid tabular-nums">
                <div class="metric-block">
                  <span class="metric-num">{{ run.jobs_discovered || 0 }}</span>
                  <span class="metric-lbl">Discovered</span>
                </div>
                <div class="metric-block">
                  <span class="metric-num text-emerald">{{ run.jobs_new || 0 }}</span>
                  <span class="metric-lbl">New</span>
                </div>
                <div class="metric-block">
                  <span class="metric-num text-amber">{{ run.jobs_notified || 0 }}</span>
                  <span class="metric-lbl">Notified</span>
                </div>
                <div class="metric-block">
                  <span class="metric-num text-copper status-text">{{ run.status || 'OK' }}</span>
                  <span class="metric-lbl">Status</span>
                </div>
              </div>
            </ui-card>
          }

          <ui-card variant="subtle" padding="md">
            <header class="bento-card-header">
              <div class="header-title-wrap">
                <app-icon name="shield-check" [size]="14" class="text-emerald" />
                <h2 class="bento-title">Candidate Alignment</h2>
              </div>
            </header>

            <div class="taxonomy-summary">
              <div class="taxonomy-row">
                <span class="tax-label">Target Role</span>
                <span class="tax-value">Frontend Engineer (Angular / Modern Web)</span>
              </div>
              <div class="taxonomy-row">
                <span class="tax-label">Base Location</span>
                <span class="tax-value">Cairo, Egypt (GMT+2)</span>
              </div>
              <div class="taxonomy-row">
                <span class="tax-label">Primary Segments</span>
                <span class="tax-value">Egypt On-site/Hybrid &amp; Worldwide Remote</span>
              </div>
              <div class="taxonomy-row">
                <span class="tax-label">Core Stack</span>
                <span class="tax-value">Angular, TypeScript, RxJS, NgRx, Signals</span>
              </div>
            </div>
          </ui-card>
        </aside>
      </div>

      <!-- Slide-Over Drawer Integration -->
      <app-job-drawer
        [isOpen]="isDrawerOpen()"
        [job]="selectedJob()"
        (closeDrawer)="closeDrawer()"
        (statusUpdated)="onJobStatusUpdated($event)"
      />
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
    }

    .overview-command-center {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
      width: 100%;
      max-width: 1160px;
      margin: 0 auto;
    }

    /* Architectural Hero Header */
    .overview-hero {
      position: relative;
      overflow: hidden;
      border-radius: var(--radius-lg);
      background-color: var(--surface-elevated);
      border: 1px solid var(--border-hairline);
      box-shadow: var(--border-specular), var(--shadow-sm);
      padding: var(--space-5) var(--space-6);
    }

    .hero-inner {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--space-4);
      flex-wrap: wrap;
    }

    .hero-copy {
      display: flex;
      flex-direction: column;
      gap: var(--space-1-5);
      max-width: 60ch;
    }

    .hero-status-row {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
    }

    .hero-title {
      font-family: var(--font-display);
      font-size: var(--text-h1);
      font-weight: 700;
      letter-spacing: var(--tracking-tight);
      color: var(--ink-primary);
      margin: 0;
    }

    .hero-subtitle {
      font-size: var(--text-sm);
      color: var(--ink-secondary);
      line-height: 1.5;
      margin: 0;
    }

    .hero-actions {
      display: flex;
      align-items: center;
      flex-shrink: 0;
    }

    /* KPI Bento Grid */
    .kpi-cards-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: var(--space-3);
    }

    .kpi-link {
      display: block;
      text-decoration: none;
      color: inherit;
      border-radius: var(--radius-lg);
      outline: none;
    }

    .kpi-link:focus-visible {
      outline: 2px solid var(--accent-copper);
      outline-offset: 2px;
    }

    .kpi-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
    }

    .kpi-label {
      font-size: var(--text-xs);
      font-weight: 600;
      color: var(--ink-secondary);
    }

    .kpi-icon {
      color: var(--ink-muted);
    }

    .kpi-num {
      font-family: var(--font-mono);
      font-size: 28px;
      font-weight: 700;
      letter-spacing: var(--tracking-tight);
      color: var(--ink-primary);
      line-height: 1.15;
      margin: var(--space-1-5) 0 var(--space-1) 0;
    }

    .kpi-subtext {
      font-size: var(--text-xs);
      color: var(--ink-muted);
    }

    /* Two-Column Bento Grid */
    .bento-layout-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 340px;
      gap: var(--space-4);
      align-items: start;
    }

    .bento-primary-card {
      display: block;
    }

    .bento-secondary-col {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      min-width: 0;
    }

    .bento-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      border-bottom: 1px solid var(--border-hairline);
      padding-bottom: var(--space-3);
      margin-bottom: var(--space-3);
    }

    .header-title-wrap {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-width: 0;
    }

    .bento-title {
      margin: 0;
      font-family: var(--font-display);
      font-size: var(--text-sm);
      font-weight: 600;
      letter-spacing: var(--tracking-snug);
      color: var(--ink-primary);
    }

    .view-all-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: var(--text-xs);
      font-weight: 600;
      color: var(--accent-copper-text);
      text-decoration: none;
      padding: 4px 8px;
      border-radius: var(--radius-xs);
      transition: background-color var(--dur-fast) var(--ease-spring);
    }

    .view-all-link:hover {
      background-color: var(--accent-copper-soft);
    }

    .run-date-tag {
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      color: var(--ink-muted);
    }

    /* Spotlight Matches List */
    .skeletons-stack {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .matches-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .match-item-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-3-5);
      background-color: var(--surface-subtle);
      border: 1px solid var(--border-hairline);
      border-radius: var(--radius-md);
      cursor: pointer;
      outline: none;
      transition:
        background-color var(--dur-fast) var(--ease-spring),
        border-color var(--dur-fast) var(--ease-spring),
        transform var(--dur-fast) var(--ease-spring);
    }

    .match-item-row:hover {
      background-color: var(--surface-elevated);
      border-color: var(--border-strong);
      transform: translateY(-1px);
    }

    .match-item-row:focus-visible {
      outline: 2px solid var(--accent-copper);
      outline-offset: 2px;
    }

    .match-main-content {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .match-title-line {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .role-name {
      margin: 0;
      font-family: var(--font-display);
      font-size: var(--text-sm);
      font-weight: 600;
      letter-spacing: var(--tracking-snug);
      color: var(--ink-primary);
      line-height: 1.35;
    }

    .match-meta-line {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: var(--text-xs);
      color: var(--ink-muted);
      flex-wrap: wrap;
    }

    .company-text {
      color: var(--ink-secondary);
      font-weight: 600;
    }

    .dot-separator {
      color: var(--border-strong);
    }

    .location-truncate {
      max-width: 160px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .time-item {
      font-family: var(--font-mono);
    }

    .match-badges-row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 5px;
      margin-top: 2px;
    }

    .match-right-col {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-shrink: 0;
    }

    .match-chevron {
      color: var(--ink-muted);
      transition: transform var(--dur-fast) var(--ease-spring), color var(--dur-fast) var(--ease-spring);
    }

    .match-item-row:hover .match-chevron {
      transform: translateX(2px);
      color: var(--ink-primary);
    }

    /* Sources Health List */
    .sources-health-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .source-status-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      padding: 7px 10px;
      background-color: var(--surface-subtle);
      border: 1px solid var(--border-hairline);
      border-radius: var(--radius-sm);
    }

    .source-info-left {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .source-live-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background-color: var(--ink-muted);
      flex-shrink: 0;
    }

    .source-live-dot.enabled {
      background-color: var(--semantic-emerald);
    }

    .source-title {
      font-size: var(--text-xs);
      font-weight: 500;
      color: var(--ink-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .source-type-pill {
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--ink-muted);
      flex-shrink: 0;
    }

    /* Sweep Metrics Grid */
    .sweep-metrics-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: var(--space-2);
    }

    .metric-block {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background-color: var(--surface-subtle);
      border: 1px solid var(--border-hairline);
      border-radius: var(--radius-sm);
      padding: 8px 4px;
    }

    .metric-num {
      font-family: var(--font-mono);
      font-size: var(--text-md);
      font-weight: 700;
      color: var(--ink-primary);
      line-height: 1.2;
    }

    .metric-num.status-text {
      font-size: var(--text-xs);
    }

    .metric-lbl {
      font-size: 10px;
      font-weight: 500;
      color: var(--ink-muted);
      margin-top: 2px;
    }

    /* Taxonomy Summary */
    .taxonomy-summary {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .taxonomy-row {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 7px 10px;
      background-color: var(--surface-elevated);
      border: 1px solid var(--border-hairline);
      border-radius: var(--radius-sm);
    }

    .tax-label {
      font-size: 10px;
      font-weight: 600;
      color: var(--ink-muted);
    }

    .tax-value {
      font-size: var(--text-xs);
      font-weight: 500;
      color: var(--ink-primary);
    }

    .text-emerald { color: var(--semantic-emerald-text); }
    .text-copper { color: var(--accent-copper-text); }
    .text-amber { color: var(--semantic-amber-text); }

    @media (max-width: 992px) {
      .kpi-cards-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .bento-layout-grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }

    @media (max-width: 600px) {
      .overview-hero {
        padding: var(--space-4);
      }

      .hero-actions {
        width: 100%;
      }

      .kpi-cards-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .match-item-row {
        flex-direction: column;
        align-items: stretch;
      }

      .match-right-col {
        justify-content: space-between;
        padding-top: var(--space-2);
        border-top: 1px solid var(--border-hairline);
      }
    }

    @media (max-width: 380px) {
      .kpi-cards-grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `],
})
export class OverviewComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly telegram = inject(TelegramService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly totalJobs = signal<number>(0);
  readonly countEgypt = signal<number>(0);
  readonly countRemote = signal<number>(0);
  readonly savedCount = signal<number>(0);
  readonly appliedCount = signal<number>(0);
  readonly totalPipeline = signal<number>(0);

  readonly topJobs = signal<JobSummary[]>([]);
  readonly sources = signal<SourceInfo[]>([]);
  readonly lastRun = signal<DailyRunRecord | null>(null);

  readonly isLoadingTopJobs = signal<boolean>(false);
  readonly isSweeping = signal<boolean>(false);

  // Drawer state
  readonly isDrawerOpen = signal<boolean>(false);
  readonly selectedJob = signal<JobSummary | null>(null);

  ngOnInit(): void {
    this.loadOverviewData();
  }

  onNavClick(): void {
    this.telegram.haptic('selection');
  }

  loadOverviewData(): void {
    this.isLoadingTopJobs.set(true);

    this.api
      .getJobs({ limit: 8, sort_by: 'match_score' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.totalJobs.set(res.total);
          this.topJobs.set(res.items);
          this.isLoadingTopJobs.set(false);
        },
        error: (e: unknown) => {
          console.error('Failed to load top jobs', e);
          this.isLoadingTopJobs.set(false);
        },
      });

    this.api
      .getJobs({ segment: 'EGYPT', limit: 1 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => this.countEgypt.set(res.total),
        error: () => {},
      });

    this.api
      .getJobs({ segment: 'REMOTE_GCC_ABROAD', limit: 1 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => this.countRemote.set(res.total),
        error: () => {},
      });

    this.api
      .getTrackedJobs()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          const saved = items.filter((i) => i.status === 'SAVED').length;
          const applied = items.filter((i) => i.status === 'APPLIED' || i.status === 'INTERVIEW').length;
          this.savedCount.set(saved);
          this.appliedCount.set(applied);
          this.totalPipeline.set(items.length);
        },
        error: (e: unknown) => console.error('Failed to load tracker stats', e),
      });

    this.api
      .getSources()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (srcs) => this.sources.set(srcs),
        error: (e: unknown) => console.error('Failed to load sources', e),
      });

    this.api
      .getRuns()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (runs) => {
          if (runs.length > 0) {
            this.lastRun.set(runs[0]);
          }
        },
        error: (e: unknown) => console.error('Failed to load runs', e),
      });
  }

  triggerSweep(): void {
    if (this.isSweeping()) return;
    this.isSweeping.set(true);
    this.telegram.haptic('medium');
    this.toast.show('Autonomous Agent initiating sweep across feeds...', 'info', 2500);

    this.api
      .triggerRun(true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.isSweeping.set(false);
          this.telegram.haptic('success');
          if (res?.status === 'accepted') {
            this.toast.show(
              res.message || 'Background feed sweep started.',
              'info',
              3000
            );
          } else {
            this.toast.show('Feed sweep completed! Latest roles refreshed.', 'success');
          }
          this.loadOverviewData();
        },
        error: () => {
          this.isSweeping.set(false);
          this.telegram.haptic('error');
          this.toast.show('Failed to initiate feed sweep. Please try again.', 'error');
        },
      });
  }

  openDrawer(job: JobSummary): void {
    this.telegram.haptic('selection');
    this.selectedJob.set(job);
    this.isDrawerOpen.set(true);
  }

  closeDrawer(): void {
    this.isDrawerOpen.set(false);
    this.selectedJob.set(null);
  }

  onJobStatusUpdated(evt: { jobId: number; status: ApplicationStatus }): void {
    this.toast.show(`Role marked as ${evt.status}`, 'success');
    this.loadOverviewData();
  }

  hasDirectContact(job: JobSummary): boolean {
    return Boolean(job.direct_email || job.whatsapp_contact || job.apply_form_url);
  }

  roundScore(score: number): number {
    return Math.round(score);
  }

  formatWorkplace(w?: WorkplaceType): string {
    switch (w) {
      case 'REMOTE': return 'Remote';
      case 'HYBRID': return 'Hybrid';
      case 'ON_SITE': return 'On-site';
      default: return 'Remote';
    }
  }

  formatRelativeDate(dateStr?: string | null): string {
    if (!dateStr) return 'Recently';
    try {
      const date = new Date(dateStr);
      const diffMs = Date.now() - date.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours < 1) return 'Just now';
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return 'Recently';
    }
  }
}
