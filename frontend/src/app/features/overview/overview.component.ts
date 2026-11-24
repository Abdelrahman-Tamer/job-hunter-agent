import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { TelegramService } from '../../core/services/telegram.service';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent } from '../../core/components/icon/icon.component';
import { JobDrawerComponent } from '../../core/components/job-drawer/job-drawer.component';
import { UiBadgeComponent } from '../../shared/ui/ui-badge.component';
import { UiButtonComponent } from '../../shared/ui/ui-button.component';
import { UiSkeletonComponent } from '../../shared/ui/ui-skeleton.component';
import { UiEmptyStateComponent } from '../../shared/ui/ui-empty-state.component';
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
    CommonModule,
    RouterLink,
    IconComponent,
    JobDrawerComponent,
    UiBadgeComponent,
    UiButtonComponent,
    UiSkeletonComponent,
    UiEmptyStateComponent,
  ],
  template: `
    <div class="overview-command-center">
      <!-- Top Executive KPI Strip (4 Hairline Metric Cards + Sweep Trigger) -->
      <section class="kpi-strip-section" aria-label="Key performance indicators">
        <div class="kpi-cards-grid">
          <!-- KPI 1: Total Verified Roles -->
          <a routerLink="/jobs" class="kpi-card" (click)="onNavClick()">
            <div class="kpi-top">
              <span class="kpi-label">Verified Roles</span>
              <app-icon name="briefcase" [size]="14" class="kpi-icon"></app-icon>
            </div>
            <div class="kpi-num tabular-nums">{{ totalJobs() }}</div>
            <span class="kpi-subtext">Active on Radar</span>
          </a>

          <!-- KPI 2: Egypt Frontend -->
          <a routerLink="/jobs" [queryParams]="{ segment: 'EGYPT' }" class="kpi-card" (click)="onNavClick()">
            <div class="kpi-top">
              <span class="kpi-label">Egypt Frontend</span>
              <span class="kpi-flag">🇪🇬</span>
            </div>
            <div class="kpi-num tabular-nums text-emerald">{{ countEgypt() }}</div>
            <span class="kpi-subtext">Cairo • Giza • Alex</span>
          </a>

          <!-- KPI 3: Remote GCC & Abroad -->
          <a routerLink="/jobs" [queryParams]="{ segment: 'REMOTE_GCC_ABROAD' }" class="kpi-card" (click)="onNavClick()">
            <div class="kpi-top">
              <span class="kpi-label">Remote GCC & Abroad</span>
              <app-icon name="globe" [size]="14" class="kpi-icon text-brand"></app-icon>
            </div>
            <div class="kpi-num tabular-nums text-brand">{{ countRemote() }}</div>
            <span class="kpi-subtext">Gulf & Worldwide</span>
          </a>

          <!-- KPI 4: Active Pipeline -->
          <a routerLink="/tracker" class="kpi-card" (click)="onNavClick()">
            <div class="kpi-top">
              <span class="kpi-label">Active Pipeline</span>
              <app-icon name="bookmark" [size]="14" class="kpi-icon text-amber"></app-icon>
            </div>
            <div class="kpi-num tabular-nums text-amber">{{ totalPipeline() }}</div>
            <span class="kpi-subtext">{{ savedCount() }} Saved • {{ appliedCount() }} Applied</span>
          </a>
        </div>

        <!-- Sweep Feeds Control Bar -->
        <div class="sweep-control-bar">
          <div class="sweep-meta-left">
            <span class="status-pulse-dot"></span>
            <span class="sweep-meta-text">
              <strong>Autonomous Pipeline Active</strong> — Scheduled Cairo 09:00 Daily Digest
            </span>
          </div>

          <button
            type="button"
            (click)="triggerSweep()"
            [disabled]="isSweeping()"
            class="sweep-action-btn"
            title="Execute immediate feed sweep"
            aria-label="Sweep feeds now"
          >
            <app-icon [name]="isSweeping() ? 'refresh' : 'play'" [size]="13" [class.spin]="isSweeping()"></app-icon>
            <span>{{ isSweeping() ? 'Sweeping Feeds...' : 'Sweep Feeds Now' }}</span>
          </button>
        </div>
      </section>

      <!-- Two-Column Bento Layout -->
      <div class="bento-layout-grid">
        <!-- Left Column (Primary): Top Matches Today -->
        <section class="bento-primary-card" aria-label="Top matching opportunities">
          <header class="bento-card-header">
            <div class="header-title-wrap">
              <app-icon name="sparkles" [size]="15" class="header-glyph"></app-icon>
              <h2 class="bento-title">Top Opportunity Matches</h2>
            </div>

            <a routerLink="/jobs" class="view-all-link" (click)="onNavClick()">
              <span>View all {{ totalJobs() }}</span>
              <app-icon name="arrow-right" [size]="12"></app-icon>
            </a>
          </header>

          <!-- Skeleton Loader -->
          <div *ngIf="isLoadingTopJobs()" class="skeletons-stack">
            <ui-skeleton *ngFor="let i of [1, 2, 3, 4, 5]" height="64px" rounded="sm"></ui-skeleton>
          </div>

          <!-- Empty State -->
          <div *ngIf="!isLoadingTopJobs() && topJobs().length === 0" class="empty-wrap">
            <ui-empty-state
              icon="briefcase"
              title="No Opportunities Synced Yet"
              subtitle="Trigger an immediate feed sweep to discover active frontend engineering roles."
            >
              <div action>
                <ui-button variant="primary" size="sm" (buttonClick)="triggerSweep()">
                  <app-icon name="play" [size]="12"></app-icon>
                  <span>Sweep Feeds</span>
                </ui-button>
              </div>
            </ui-empty-state>
          </div>

          <!-- High-Density Matches List -->
          <div *ngIf="!isLoadingTopJobs() && topJobs().length > 0" class="matches-compact-list" role="list">
            <article
              *ngFor="let job of topJobs()"
              (click)="openDrawer(job)"
              class="match-item-row"
              tabindex="0"
              (keydown.enter)="openDrawer(job)"
              [attr.aria-label]="job.title + ' at ' + job.company"
            >
              <!-- Score Badge -->
              <div
                class="match-score-badge tabular-nums"
                [attr.data-band]="getScoreBand(job.match_score)"
              >
                {{ roundScore(job.match_score) }}%
              </div>

              <!-- Main Content -->
              <div class="match-main-content">
                <div class="match-title-line">
                  <h3 class="role-name" dir="auto">{{ job.title }}</h3>
                  <ui-badge
                    *ngIf="job.is_social_post"
                    variant="social"
                    size="sm"
                    [dot]="true"
                  >
                    LinkedIn
                  </ui-badge>
                  <ui-badge
                    *ngIf="job.opportunity_segment === 'EGYPT'"
                    variant="default"
                    size="sm"
                  >
                    Egypt
                  </ui-badge>
                  <ui-badge
                    *ngIf="job.opportunity_segment === 'REMOTE_GCC_ABROAD'"
                    variant="brand"
                    size="sm"
                  >
                    Remote Abroad
                  </ui-badge>
                </div>

                <div class="match-meta-line">
                  <span class="company-text" dir="auto">{{ job.company }}</span>
                  <span class="dot-separator">•</span>
                  <span class="meta-item">{{ formatWorkplace(job.workplace_type) }}</span>
                  <span class="dot-separator" *ngIf="job.raw_location">•</span>
                  <span class="meta-item location-truncate" dir="auto" *ngIf="job.raw_location">
                    {{ job.raw_location }}
                  </span>
                  <span class="dot-separator">•</span>
                  <span class="time-item tabular-nums">
                    {{ formatRelativeDate(job.published_at || job.first_seen_at) }}
                  </span>
                </div>
              </div>

              <!-- Action Indicator -->
              <div class="match-arrow-wrap">
                <app-icon name="chevron-right" [size]="14"></app-icon>
              </div>
            </article>
          </div>
        </section>

        <!-- Right Column (Secondary): Source Health & Recent Sweeps -->
        <aside class="bento-secondary-col" aria-label="Platform telemetry and source health">
          <!-- Feed Adapters Health Card -->
          <section class="bento-card">
            <header class="bento-card-header">
              <div class="header-title-wrap">
                <app-icon name="database" [size]="14" class="header-glyph"></app-icon>
                <h2 class="bento-title">Feed Health & Ingestion</h2>
              </div>
              <ui-badge variant="success" size="sm" [dot]="true">
                {{ sources().length }} Active
              </ui-badge>
            </header>

            <div class="sources-health-list">
              <div *ngFor="let s of sources()" class="source-status-row">
                <div class="source-info-left">
                  <span class="source-live-dot" [class.enabled]="s.is_enabled"></span>
                  <span class="source-title">{{ s.name }}</span>
                </div>
                <span class="source-type-pill">{{ s.source_type }}</span>
              </div>
            </div>
          </section>

          <!-- Last Daily Sweep Telemetry -->
          <section class="bento-card" *ngIf="lastRun()">
            <header class="bento-card-header">
              <div class="header-title-wrap">
                <app-icon name="activity" [size]="14" class="header-glyph text-brand"></app-icon>
                <h2 class="bento-title">Latest Sweep Metrics</h2>
              </div>
              <span class="run-date-tag tabular-nums">{{ lastRun()?.run_date }}</span>
            </header>

            <div class="sweep-metrics-grid tabular-nums">
              <div class="metric-block">
                <span class="metric-num">{{ lastRun()?.jobs_discovered || 0 }}</span>
                <span class="metric-lbl">Discovered</span>
              </div>
              <div class="metric-block">
                <span class="metric-num text-emerald">{{ lastRun()?.jobs_new || 0 }}</span>
                <span class="metric-lbl">New Added</span>
              </div>
              <div class="metric-block">
                <span class="metric-num text-amber">{{ lastRun()?.jobs_notified || 0 }}</span>
                <span class="metric-lbl">Notified</span>
              </div>
              <div class="metric-block">
                <span class="metric-num text-brand status-text">{{ lastRun()?.status || 'OK' }}</span>
                <span class="metric-lbl">Status</span>
              </div>
            </div>
          </section>

          <!-- Engineering Taxonomy Card -->
          <section class="bento-card">
            <header class="bento-card-header">
              <div class="header-title-wrap">
                <app-icon name="shield-check" [size]="14" class="header-glyph text-emerald"></app-icon>
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
                <span class="tax-value">Egypt On-site/Hybrid & Worldwide Remote</span>
              </div>
              <div class="taxonomy-row">
                <span class="tax-label">Core Tech Stack</span>
                <span class="tax-value">Angular, TypeScript, RxJS, NgRx, Signals</span>
              </div>
            </div>
          </section>
        </aside>
      </div>

      <!-- Slide-Over Drawer Integration -->
      <app-job-drawer
        [isOpen]="isDrawerOpen()"
        [job]="selectedJob()"
        (closeDrawer)="closeDrawer()"
        (statusUpdated)="onJobStatusUpdated($event)"
      ></app-job-drawer>
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
      max-width: 1240px;
      margin: 0 auto;
    }

    /* ==========================================================================
       Top Executive KPI Strip
       ========================================================================== */
    .kpi-strip-section {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .kpi-cards-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: var(--space-3);
    }

    .kpi-card {
      background-color: var(--bg-surface-1);
      border: 1px solid var(--border-default);
      box-shadow: var(--surface-highlight), var(--shadow-xs);
      border-radius: var(--radius-sm);
      padding: var(--space-3-5) var(--space-4);
      display: flex;
      flex-direction: column;
      gap: 2px;
      text-decoration: none;
      color: inherit;
      transition: all var(--motion-fast);
      position: relative;
      outline: none;
    }
    .kpi-card:hover {
      background-color: var(--bg-surface-2);
      border-color: var(--border-strong);
      box-shadow: var(--surface-highlight-hover), var(--shadow-sm);
      transform: translateY(-2px);
    }
    .kpi-card:focus-visible {
      border-color: var(--border-focus);
      box-shadow: 0 0 0 2px var(--brand-focus-ring);
    }

    .kpi-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .kpi-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-secondary);
      letter-spacing: -0.01em;
    }
    .kpi-icon {
      color: var(--text-tertiary);
    }
    .kpi-flag {
      font-size: 13px;
      line-height: 1;
    }

    .kpi-num {
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.03em;
      color: var(--text-primary);
      line-height: 1.15;
      margin: 2px 0;
    }

    .kpi-subtext {
      font-size: 11px;
      color: var(--text-tertiary);
      letter-spacing: -0.01em;
    }

    /* Sweep Control Bar */
    .sweep-control-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      padding: 10px 14px;
      background-color: var(--bg-surface-2);
      border: 1px solid var(--border-default);
      box-shadow: var(--surface-highlight-sm);
      border-radius: var(--radius-sm);
      flex-wrap: wrap;
    }

    .sweep-meta-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .status-pulse-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background-color: var(--emerald-500);
      box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
    }
    .sweep-meta-text {
      font-size: 12px;
      color: var(--text-secondary);
    }
    .sweep-meta-text strong {
      color: var(--text-primary);
    }

    .sweep-action-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      background-color: var(--brand-primary);
      border: 1px solid var(--brand-primary);
      box-shadow: var(--surface-highlight-sm);
      border-radius: var(--radius-xs);
      color: #ffffff;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all var(--motion-fast);
      outline: none;
    }
    .sweep-action-btn:hover:not(:disabled) {
      background-color: var(--brand-primary-hover);
      box-shadow: var(--shadow-glow-brand);
    }
    .sweep-action-btn:active:not(:disabled) {
      transform: scale(0.97);
    }
    .sweep-action-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .spin {
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* ==========================================================================
       Two-Column Bento Grid
       ========================================================================== */
    .bento-layout-grid {
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: var(--space-4);
      align-items: start;
    }

    .bento-primary-card {
      background-color: var(--bg-surface-1);
      border: 1px solid var(--border-default);
      box-shadow: var(--surface-highlight), var(--shadow-xs);
      border-radius: var(--radius-sm);
      padding: var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .bento-secondary-col {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .bento-card {
      background-color: var(--bg-surface-1);
      border: 1px solid var(--border-default);
      box-shadow: var(--surface-highlight), var(--shadow-xs);
      border-radius: var(--radius-sm);
      padding: var(--space-3-5) var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .bento-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--border-subtle);
      padding-bottom: var(--space-2-5);
    }

    .header-title-wrap {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .header-glyph {
      color: var(--brand-accent);
    }

    .bento-title {
      margin: 0;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: -0.015em;
      color: var(--text-primary);
    }

    .view-all-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      font-weight: 600;
      color: var(--brand-accent);
      text-decoration: none;
      transition: color var(--motion-fast);
    }
    .view-all-link:hover {
      color: var(--brand-primary);
    }

    .run-date-tag {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-tertiary);
    }

    /* Top Matches Compact List */
    .skeletons-stack {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .matches-compact-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .match-item-row {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: 9px 12px;
      background-color: var(--bg-surface-2);
      border: 1px solid var(--border-default);
      box-shadow: var(--surface-highlight-sm);
      border-radius: var(--radius-xs);
      cursor: pointer;
      transition: all var(--motion-fast);
      outline: none;
    }
    .match-item-row:hover {
      background-color: var(--bg-surface-3);
      border-color: var(--border-strong);
      transform: translateX(2px);
    }
    .match-item-row:focus-visible {
      border-color: var(--border-focus);
      box-shadow: 0 0 0 2px var(--brand-focus-ring);
    }

    .match-score-badge {
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 42px;
      height: 28px;
      border-radius: 3px;
      font-size: 11px;
      font-weight: 700;
      border: 1px solid var(--border-default);
      background-color: var(--bg-surface-1);
      box-shadow: var(--surface-highlight-sm);
      flex-shrink: 0;
    }
    .match-score-badge[data-band="emerald"] {
      border-color: var(--emerald-border);
      background-color: var(--emerald-bg);
      color: var(--emerald-400);
    }
    .match-score-badge[data-band="indigo"] {
      border-color: var(--brand-border-subtle);
      background-color: var(--brand-bg-subtle);
      color: var(--brand-accent);
    }
    .match-score-badge[data-band="amber"] {
      border-color: var(--amber-border);
      background-color: var(--amber-bg);
      color: var(--amber-400);
    }
    .match-score-badge[data-band="muted"] {
      color: var(--text-tertiary);
    }

    .match-main-content {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .match-title-line {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }

    .role-name {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 320px;
    }

    .match-meta-line {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      color: var(--text-tertiary);
      flex-wrap: wrap;
    }
    .company-text {
      color: var(--text-secondary);
      font-weight: 500;
    }
    .dot-separator {
      color: var(--text-tertiary);
    }
    .location-truncate {
      max-width: 120px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .match-arrow-wrap {
      color: var(--text-tertiary);
      display: flex;
      align-items: center;
      flex-shrink: 0;
      transition: transform var(--motion-fast), color var(--motion-fast);
    }
    .match-item-row:hover .match-arrow-wrap {
      transform: translateX(2px);
      color: var(--text-primary);
    }

    /* Sources Health List */
    .sources-health-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .source-status-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 8px;
      background-color: var(--bg-surface-2);
      border: 1px solid var(--border-default);
      box-shadow: var(--surface-highlight-sm);
      border-radius: var(--radius-xs);
    }

    .source-info-left {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .source-live-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background-color: var(--text-tertiary);
    }
    .source-live-dot.enabled {
      background-color: var(--emerald-500);
      box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
    }
    .source-title {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-primary);
    }
    .source-type-pill {
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--text-tertiary);
    }

    /* Sweep Metrics Grid */
    .sweep-metrics-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: var(--space-2);
    }

    .metric-block {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background-color: var(--bg-surface-2);
      border: 1px solid var(--border-default);
      box-shadow: var(--surface-highlight-sm);
      border-radius: var(--radius-xs);
      padding: 6px 4px;
    }
    .metric-num {
      font-size: 16px;
      font-weight: 700;
      color: var(--text-primary);
      line-height: 1.2;
    }
    .metric-lbl {
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-tertiary);
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
      gap: 1px;
      padding: 5px 8px;
      background-color: var(--bg-surface-2);
      border: 1px solid var(--border-default);
      box-shadow: var(--surface-highlight-sm);
      border-radius: var(--radius-xs);
    }
    .tax-label {
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-tertiary);
    }
    .tax-value {
      font-size: 11px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .text-emerald { color: var(--emerald-400); }
    .text-brand { color: var(--brand-accent); }
    .text-amber { color: var(--amber-400); }

    @media (max-width: 992px) {
      .kpi-cards-grid {
        grid-template-columns: repeat(2, 1fr);
      }
      .bento-layout-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 500px) {
      .kpi-cards-grid {
        grid-template-columns: 1fr;
      }
      .sweep-control-bar {
        flex-direction: column;
        align-items: stretch;
      }
      .sweep-action-btn {
        width: 100%;
        justify-content: center;
      }
      .role-name {
        max-width: 200px;
      }
    }
  `],
})
export class OverviewComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly telegram = inject(TelegramService);
  private readonly toast = inject(ToastService);

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

    // 1. Fetch top matching opportunities
    this.api.getJobs({ limit: 8, sort_by: 'match_score' }).subscribe({
      next: (res) => {
        this.totalJobs.set(res.total);
        this.topJobs.set(res.items);
        this.isLoadingTopJobs.set(false);
      },
      error: (e) => {
        console.error('Failed to load top jobs', e);
        this.isLoadingTopJobs.set(false);
      },
    });

    // 2. Fetch Egypt count
    this.api.getJobs({ segment: 'EGYPT', limit: 1 }).subscribe({
      next: (res) => this.countEgypt.set(res.total),
      error: () => {},
    });

    // 3. Fetch Remote GCC / Abroad count
    this.api.getJobs({ segment: 'REMOTE_GCC_ABROAD', limit: 1 }).subscribe({
      next: (res) => this.countRemote.set(res.total),
      error: () => {},
    });

    // 4. Fetch Tracker pipeline count
    this.api.getTrackedJobs().subscribe({
      next: (items) => {
        const saved = items.filter((i) => i.status === 'SAVED').length;
        const applied = items.filter((i) => i.status === 'APPLIED' || i.status === 'INTERVIEW').length;
        this.savedCount.set(saved);
        this.appliedCount.set(applied);
        this.totalPipeline.set(items.length);
      },
      error: (e) => console.error('Failed to load tracker stats', e),
    });

    // 5. Fetch Sources
    this.api.getSources().subscribe({
      next: (srcs) => this.sources.set(srcs),
      error: (e) => console.error('Failed to load sources', e),
    });

    // 6. Fetch Runs
    this.api.getRuns().subscribe({
      next: (runs) => {
        if (runs.length > 0) {
          this.lastRun.set(runs[0]);
        }
      },
      error: (e) => console.error('Failed to load runs', e),
    });
  }

  triggerSweep(): void {
    if (this.isSweeping()) return;
    this.isSweeping.set(true);
    this.telegram.haptic('medium');
    this.toast.show('Autonomous Agent initiating sweep across feeds...', 'info', 2500);

    this.api.triggerRun(true).subscribe({
      next: () => {
        this.isSweeping.set(false);
        this.telegram.haptic('success');
        this.toast.show('Feed sweep completed! Latest roles refreshed.', 'success');
        this.loadOverviewData();
      },
      error: () => {
        this.isSweeping.set(false);
        this.telegram.haptic('error');
        this.toast.show('Feed scan completed or already up to date.', 'info');
        this.loadOverviewData();
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

  roundScore(score: number): number {
    return Math.round(score);
  }

  getScoreBand(score: number): 'emerald' | 'indigo' | 'amber' | 'muted' {
    if (score >= 80) return 'emerald';
    if (score >= 65) return 'indigo';
    if (score >= 50) return 'amber';
    return 'muted';
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
