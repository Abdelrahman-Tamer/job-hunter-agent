import {
  Component,
  ElementRef,
  HostListener,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
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
  JobSummary,
  OpportunitySegment,
  WorkplaceType,
} from '../../core/models/job.model';

@Component({
  selector: 'app-jobs',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IconComponent,
    JobDrawerComponent,
    UiBadgeComponent,
    UiButtonComponent,
    UiSkeletonComponent,
    UiEmptyStateComponent,
  ],
  template: `
    <div class="jobs-radar-view">
      <!-- Sticky Command Bar & Filter Header -->
      <header class="radar-command-bar">
        <!-- Top Controls: Regional Segment & Source Category -->
        <div class="command-row-top">
          <!-- Regional Segmented Control -->
          <div class="segmented-control regional-segmented" role="tablist" aria-label="Regional segment filter">
            <button
              type="button"
              role="tab"
              [attr.aria-selected]="selectedSegment() === ''"
              [class.active]="selectedSegment() === ''"
              (click)="setSegment('')"
              class="segment-tab-btn"
            >
              <span>All Regions</span>
            </button>
            <button
              type="button"
              role="tab"
              [attr.aria-selected]="selectedSegment() === 'EGYPT'"
              [class.active]="selectedSegment() === 'EGYPT'"
              (click)="setSegment('EGYPT')"
              class="segment-tab-btn"
            >
              <span class="region-flag">🇪🇬</span>
              <span>Egypt Frontend</span>
            </button>
            <button
              type="button"
              role="tab"
              [attr.aria-selected]="selectedSegment() === 'REMOTE_GCC_ABROAD'"
              [class.active]="selectedSegment() === 'REMOTE_GCC_ABROAD'"
              (click)="setSegment('REMOTE_GCC_ABROAD')"
              class="segment-tab-btn"
            >
              <span class="region-flag">🌍</span>
              <span>Remote GCC & Abroad</span>
            </button>
          </div>

          <!-- Source Category Toggle -->
          <div class="segmented-control source-segmented" role="tablist" aria-label="Source category filter">
            <button
              type="button"
              role="tab"
              [attr.aria-selected]="selectedSourceType() === 'ALL'"
              [class.active]="selectedSourceType() === 'ALL'"
              (click)="setSourceType('ALL')"
              class="segment-tab-btn sm"
            >
              <span>All Sources</span>
            </button>
            <button
              type="button"
              role="tab"
              [attr.aria-selected]="selectedSourceType() === 'SOCIAL'"
              [class.active]="selectedSourceType() === 'SOCIAL'"
              (click)="setSourceType('SOCIAL')"
              class="segment-tab-btn sm social-tab"
            >
              <app-icon name="message-square" [size]="11"></app-icon>
              <span>LinkedIn Social</span>
            </button>
            <button
              type="button"
              role="tab"
              [attr.aria-selected]="selectedSourceType() === 'BOARDS'"
              [class.active]="selectedSourceType() === 'BOARDS'"
              (click)="setSourceType('BOARDS')"
              class="segment-tab-btn sm"
            >
              <app-icon name="briefcase" [size]="11"></app-icon>
              <span>Job Boards</span>
            </button>
          </div>
        </div>

        <!-- Bottom Controls: Search & Secondary Filters -->
        <div class="command-row-bottom">
          <!-- Search input with ⌘K hint -->
          <div class="search-box-wrap">
            <app-icon name="search" [size]="14" class="search-lens"></app-icon>
            <input
              #searchInput
              type="search"
              [(ngModel)]="searchKeyword"
              (keyup.enter)="applyFilters()"
              placeholder="Search roles, skills, or companies (Angular, TypeScript, Cairo)..."
              class="search-input"
              aria-label="Search opportunities"
            />
            <button
              *ngIf="searchKeyword"
              type="button"
              (click)="clearSearch()"
              class="search-clear-btn"
              aria-label="Clear search"
            >
              <app-icon name="x" [size]="12"></app-icon>
            </button>
            <span class="kbd-shortcut-hint" *ngIf="!searchKeyword">⌘K</span>
          </div>

          <div class="filters-actions-wrap">
            <!-- Workplace Type Dropdown -->
            <div class="filter-select-wrap">
              <select
                [(ngModel)]="selectedWorkplace"
                (change)="applyFilters()"
                class="filter-select"
                aria-label="Workplace type"
              >
                <option value="">All Workplaces</option>
                <option value="REMOTE">Remote</option>
                <option value="HYBRID">Hybrid</option>
                <option value="ON_SITE">On-site</option>
              </select>
            </div>

            <!-- Min Score Dropdown -->
            <div class="filter-select-wrap">
              <select
                [(ngModel)]="selectedMinScore"
                (change)="applyFilters()"
                class="filter-select"
                aria-label="Minimum score"
              >
                <option value="0">Any Fit Score</option>
                <option value="60">Fit 60%+</option>
                <option value="75">Fit 75%+</option>
                <option value="85">Fit 85%+ (Top Tier)</option>
              </select>
            </div>

            <!-- Filter Reset Button (visible when filters active) -->
            <button
              *ngIf="hasActiveFilters()"
              type="button"
              (click)="resetFilters()"
              class="reset-filters-btn"
              title="Reset all filters"
            >
              <app-icon name="refresh" [size]="12"></app-icon>
              <span>Reset</span>
            </button>
          </div>
        </div>

        <!-- Telemetry Status Bar -->
        <div class="telemetry-bar">
          <div class="telemetry-left">
            <span class="results-count tabular-nums">
              <strong>{{ total() }}</strong> verified opportunities
            </span>
            <span class="telemetry-dot">•</span>
            <span class="telemetry-sub">Page {{ currentPage() }} of {{ totalPages() || 1 }}</span>
          </div>

          <div class="telemetry-right">
            <span class="live-status-pill">
              <span class="live-dot-green"></span>
              <span>Cairo 09:00 Radar</span>
            </span>
          </div>
        </div>
      </header>

      <!-- Opportunities Feed Content -->
      <main class="radar-feed-container">
        <!-- Loading State: Smooth Skeleton Rows -->
        <div *ngIf="isLoading()" class="feed-skeletons-list">
          <div *ngFor="let i of [1, 2, 3, 4, 5]" class="skeleton-opportunity-row">
            <ui-skeleton height="78px" rounded="sm"></ui-skeleton>
          </div>
        </div>

        <!-- Empty State -->
        <div *ngIf="!isLoading() && jobs().length === 0" class="feed-empty-wrap">
          <ui-empty-state
            icon="briefcase"
            title="No Matching Opportunities Found"
            subtitle="No roles match your current regional segment, search keywords, or fit criteria."
          >
            <div action>
              <ui-button variant="secondary" size="sm" (buttonClick)="resetFilters()">
                <app-icon name="refresh" [size]="13"></app-icon>
                <span>Reset Filters</span>
              </ui-button>
            </div>
          </ui-empty-state>
        </div>

        <!-- Opportunity Cards Feed -->
        <div *ngIf="!isLoading() && jobs().length > 0" class="opportunities-list" role="feed">
          <article
            *ngFor="let job of jobs()"
            (click)="openDrawer(job)"
            class="opportunity-row-card"
            tabindex="0"
            (keydown.enter)="openDrawer(job)"
            [attr.aria-label]="job.title + ' at ' + job.company"
          >
            <!-- Left: Match Score Column -->
            <div class="card-score-col">
              <div
                class="score-badge tabular-nums"
                [attr.data-band]="getScoreBand(job.match_score)"
                [title]="'Match Score: ' + roundScore(job.match_score) + '%'"
              >
                {{ roundScore(job.match_score) }}%
              </div>
            </div>

            <!-- Middle: Main Information Block -->
            <div class="card-main-col">
              <!-- Title & Header Row -->
              <div class="card-title-row">
                <h3 class="role-title" dir="auto">{{ job.title }}</h3>

                <div class="badges-row">
                  <ui-badge
                    *ngIf="job.is_social_post"
                    variant="social"
                    size="sm"
                    [dot]="true"
                  >
                    LinkedIn Post
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
              </div>

              <!-- Company & Poster Row -->
              <div class="card-company-row">
                <span class="company-name" dir="auto">{{ job.company }}</span>
                <span *ngIf="job.poster_name" class="poster-tag">
                  <app-icon name="user" [size]="10"></app-icon>
                  <span>Shared by <strong>{{ job.poster_name }}</strong></span>
                </span>
                <span class="time-relative tabular-nums">
                  • {{ formatRelativeDate(job.published_at || job.first_seen_at) }}
                </span>
              </div>

              <!-- Metadata & Skills Row -->
              <div class="card-meta-row">
                <div class="meta-tags-group">
                  <span class="meta-tag workplace" [attr.data-workplace]="job.workplace_type">
                    <app-icon name="building" [size]="11"></app-icon>
                    <span>{{ formatWorkplace(job.workplace_type) }}</span>
                  </span>

                  <span class="meta-tag location" *ngIf="job.raw_location">
                    <app-icon name="map-pin" [size]="11"></app-icon>
                    <span class="location-text" dir="auto">{{ job.raw_location }}</span>
                  </span>
                </div>

                <!-- Skills Pills (Max 4 + Overflow) -->
                <div class="skills-preview-group" *ngIf="job.required_skills && job.required_skills.length > 0">
                  <span
                    *ngFor="let skill of job.required_skills.slice(0, 4)"
                    class="skill-chip"
                  >
                    {{ skill }}
                  </span>
                  <span
                    *ngIf="job.required_skills.length > 4"
                    class="skill-chip overflow"
                  >
                    +{{ job.required_skills.length - 4 }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Right: Quick Hover Actions -->
            <div class="card-actions-col" (click)="$event.stopPropagation()">
              <button
                type="button"
                (click)="toggleSave(job, $event)"
                class="quick-action-btn bookmark-btn"
                [class.saved]="job.tracker_status === 'SAVED'"
                [title]="job.tracker_status === 'SAVED' ? 'Remove from Saved' : 'Save opportunity'"
                aria-label="Toggle bookmark"
              >
                <app-icon
                  [name]="job.tracker_status === 'SAVED' ? 'check' : 'bookmark'"
                  [size]="14"
                ></app-icon>
              </button>

              <a
                *ngIf="job.original_application_url"
                [href]="job.original_application_url"
                target="_blank"
                rel="noopener noreferrer"
                (click)="onDirectApply(job, $event)"
                class="quick-action-btn apply-btn"
                title="Direct Apply"
                aria-label="Direct apply on portal"
              >
                <app-icon name="external-link" [size]="14"></app-icon>
              </a>
            </div>
          </article>
        </div>

        <!-- Pagination Controls -->
        <footer *ngIf="!isLoading() && total() > 0" class="radar-pagination-bar">
          <div class="pagination-info tabular-nums">
            Showing {{ ((currentPage() - 1) * limit) + 1 }}-{{ Math.min(currentPage() * limit, total()) }} of {{ total() }}
          </div>

          <div class="pagination-buttons">
            <button
              type="button"
              (click)="goToPage(currentPage() - 1)"
              [disabled]="currentPage() <= 1"
              class="page-nav-btn"
              aria-label="Previous page"
            >
              <app-icon name="chevron-left" [size]="14"></app-icon>
              <span>Prev</span>
            </button>

            <span class="page-indicator tabular-nums">
              {{ currentPage() }} / {{ totalPages() }}
            </span>

            <button
              type="button"
              (click)="goToPage(currentPage() + 1)"
              [disabled]="currentPage() >= totalPages()"
              class="page-nav-btn"
              aria-label="Next page"
            >
              <span>Next</span>
              <app-icon name="chevron-right" [size]="14"></app-icon>
            </button>
          </div>
        </footer>
      </main>

      <!-- Rebuilt Slide-Over Drawer -->
      <app-job-drawer
        [isOpen]="isDrawerOpen()"
        [job]="selectedJob()"
        (closeDrawer)="closeDrawer()"
        (statusUpdated)="onStatusUpdated($event)"
      ></app-job-drawer>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
    }

    .jobs-radar-view {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      width: 100%;
      max-width: 1240px;
      margin: 0 auto;
    }

    /* ==========================================================================
       Sticky Command Bar & Filter Header
       ========================================================================== */
    .radar-command-bar {
      position: sticky;
      top: 0;
      z-index: 50;
      background-color: var(--bg-glass-1);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      padding: var(--space-3) var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-2-5);
      box-shadow: var(--surface-highlight), var(--shadow-sm);
    }

    .command-row-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      flex-wrap: wrap;
    }

    /* Segmented Controls */
    .segmented-control {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      background-color: var(--bg-surface-2);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      padding: 3px;
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.2);
    }

    .segment-tab-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 5px 12px;
      background: transparent;
      border: 1px solid transparent;
      border-radius: var(--radius-xs);
      font-size: 12px;
      font-weight: 500;
      color: var(--text-secondary);
      cursor: pointer;
      user-select: none;
      transition: all var(--motion-fast);
      white-space: nowrap;
      outline: none;
    }

    .segment-tab-btn:hover {
      color: var(--text-primary);
      background-color: var(--bg-surface-hover);
    }

    .segment-tab-btn:active {
      transform: scale(0.98);
    }

    .segment-tab-btn.active {
      background-color: var(--bg-surface-1);
      color: var(--text-primary);
      border-color: var(--border-default);
      font-weight: 600;
      box-shadow: var(--surface-highlight-sm), var(--shadow-xs);
    }

    .segment-tab-btn.sm {
      padding: 4px 10px;
      font-size: 11px;
    }

    .segment-tab-btn.social-tab.active {
      color: var(--sky-400);
    }

    .region-flag {
      font-size: 13px;
      line-height: 1;
    }

    /* Command Row Bottom: Search & Selects */
    .command-row-bottom {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      flex-wrap: wrap;
    }

    .search-box-wrap {
      flex: 1;
      min-width: 260px;
      position: relative;
      display: flex;
      align-items: center;
    }

    .search-lens {
      position: absolute;
      left: 10px;
      color: var(--text-tertiary);
      pointer-events: none;
    }

    .search-input {
      width: 100%;
      height: 34px;
      background-color: var(--bg-surface-2);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-xs);
      padding: 0 32px 0 32px;
      font-size: 13px;
      color: var(--text-primary);
      transition: border-color var(--motion-fast), background-color var(--motion-fast), box-shadow var(--motion-fast);
    }
    .search-input:focus {
      outline: none;
      border-color: var(--brand-primary);
      box-shadow: 0 0 0 2px var(--brand-focus-ring);
      background-color: var(--bg-surface-1);
    }
    .search-input::placeholder {
      color: var(--text-tertiary);
    }

    .search-clear-btn {
      position: absolute;
      right: 8px;
      background: transparent;
      border: none;
      color: var(--text-tertiary);
      cursor: pointer;
      display: flex;
      padding: 2px;
      border-radius: var(--radius-xs);
    }
    .search-clear-btn:hover {
      color: var(--text-primary);
    }

    .kbd-shortcut-hint {
      position: absolute;
      right: 10px;
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 600;
      color: var(--text-tertiary);
      background: var(--bg-surface-1);
      border: 1px solid var(--border-default);
      box-shadow: var(--surface-highlight-sm);
      border-radius: 3px;
      padding: 1px 5px;
      pointer-events: none;
    }

    .filters-actions-wrap {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .filter-select-wrap {
      position: relative;
    }

    .filter-select {
      height: 34px;
      background-color: var(--bg-surface-2);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-xs);
      padding: 0 10px;
      font-size: 12px;
      font-weight: 500;
      color: var(--text-secondary);
      cursor: pointer;
      transition: all var(--motion-fast);
    }
    .filter-select:hover {
      border-color: var(--border-strong);
      color: var(--text-primary);
    }
    .filter-select:focus {
      outline: none;
      border-color: var(--brand-primary);
      box-shadow: 0 0 0 2px var(--brand-focus-ring);
    }

    .reset-filters-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 34px;
      padding: 0 10px;
      background-color: var(--bg-surface-2);
      border: 1px solid var(--border-default);
      box-shadow: var(--surface-highlight-sm);
      border-radius: var(--radius-xs);
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all var(--motion-fast);
    }
    .reset-filters-btn:hover {
      background-color: var(--bg-surface-3);
      color: var(--text-primary);
      border-color: var(--border-strong);
    }
    .reset-filters-btn:active {
      transform: scale(0.98);
    }

    /* Telemetry Sub-Bar */
    .telemetry-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: var(--space-2);
      border-top: 1px solid var(--border-subtle);
      font-size: 11px;
      color: var(--text-tertiary);
    }

    .telemetry-left {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .results-count strong {
      color: var(--text-primary);
    }
    .telemetry-dot {
      color: var(--text-tertiary);
    }

    .live-status-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 600;
      color: var(--text-secondary);
    }
    .live-dot-green {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background-color: var(--emerald-500);
      box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
    }

    /* ==========================================================================
       Opportunities Feed
       ========================================================================== */
    .radar-feed-container {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      width: 100%;
    }

    .feed-skeletons-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .opportunities-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    /* Row Card */
    .opportunity-row-card {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
      background-color: var(--bg-surface-1);
      border: 1px solid var(--border-default);
      box-shadow: var(--surface-highlight), var(--shadow-xs);
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: transform var(--motion-fast), border-color var(--motion-fast), background-color var(--motion-fast), box-shadow var(--motion-fast);
      position: relative;
      outline: none;
    }

    .opportunity-row-card:hover {
      background-color: var(--bg-surface-2);
      border-color: var(--border-strong);
      box-shadow: var(--surface-highlight-hover), var(--shadow-sm);
      transform: translateY(-1px);
    }

    .opportunity-row-card:focus-visible {
      border-color: var(--border-focus);
      box-shadow: 0 0 0 2px var(--brand-focus-ring);
    }

    /* Score Column */
    .card-score-col {
      flex-shrink: 0;
    }

    .score-badge {
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 44px;
      height: 32px;
      border-radius: var(--radius-xs);
      font-size: 12px;
      font-weight: 700;
      border: 1px solid var(--border-default);
      background-color: var(--bg-surface-2);
      box-shadow: var(--surface-highlight-sm);
    }

    .score-badge[data-band="emerald"] {
      border-color: var(--emerald-border);
      background-color: var(--emerald-bg);
      color: var(--emerald-400);
    }
    .score-badge[data-band="indigo"] {
      border-color: var(--brand-border-subtle);
      background-color: var(--brand-bg-subtle);
      color: var(--brand-accent);
    }
    .score-badge[data-band="amber"] {
      border-color: var(--amber-border);
      background-color: var(--amber-bg);
      color: var(--amber-400);
    }
    .score-badge[data-band="muted"] {
      color: var(--text-tertiary);
    }

    /* Main Info Column */
    .card-main-col {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .card-title-row {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
    }

    .role-title {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
      letter-spacing: -0.015em;
      line-height: 1.35;
    }

    .badges-row {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .card-company-row {
      font-size: 12px;
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      gap: 5px;
      flex-wrap: wrap;
    }
    .company-name {
      font-weight: 500;
      color: var(--text-primary);
    }
    .poster-tag {
      background: var(--sky-bg);
      border: 1px solid var(--sky-border);
      color: var(--sky-400);
      border-radius: var(--radius-xs);
      padding: 1px 6px;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-size: 11px;
    }
    .poster-tag strong {
      color: var(--text-primary);
    }
    .time-relative {
      color: var(--text-tertiary);
    }

    /* Meta & Skills Row */
    .card-meta-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      margin-top: 3px;
      flex-wrap: wrap;
    }

    .meta-tags-group {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      font-size: 11px;
    }

    .meta-tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--text-tertiary);
    }
    .meta-tag.workplace[data-workplace="REMOTE"] {
      color: var(--brand-accent);
      font-weight: 500;
    }

    .location-text {
      max-width: 160px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Skill Chips */
    .skills-preview-group {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
    }

    .skill-chip {
      font-size: 10px;
      font-family: var(--font-mono);
      font-weight: 500;
      background-color: var(--bg-surface-2);
      border: 1px solid var(--border-subtle);
      border-radius: 3px;
      padding: 1px 6px;
      color: var(--text-secondary);
    }

    .skill-chip.overflow {
      color: var(--text-tertiary);
      border-style: dashed;
    }

    /* Actions Column */
    .card-actions-col {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }

    .quick-action-btn {
      width: 32px;
      height: 32px;
      border-radius: var(--radius-xs);
      background-color: var(--bg-surface-2);
      border: 1px solid var(--border-default);
      box-shadow: var(--surface-highlight-sm);
      color: var(--text-secondary);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      text-decoration: none;
      transition: all var(--motion-fast);
      outline: none;
    }

    .quick-action-btn:hover {
      background-color: var(--bg-surface-3);
      color: var(--text-primary);
      border-color: var(--border-strong);
      transform: scale(1.05);
    }

    .quick-action-btn:active {
      transform: scale(0.95);
    }

    .quick-action-btn.bookmark-btn.saved {
      color: var(--emerald-400);
      background-color: var(--emerald-bg);
      border-color: var(--emerald-border);
    }

    .quick-action-btn.apply-btn:hover {
      color: var(--brand-accent);
    }

    /* ==========================================================================
       Pagination Bar
       ========================================================================== */
    .radar-pagination-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-3) var(--space-4);
      background-color: var(--bg-surface-1);
      border: 1px solid var(--border-default);
      box-shadow: var(--surface-highlight-sm);
      border-radius: var(--radius-sm);
      margin-top: var(--space-2);
    }

    .pagination-info {
      font-size: 12px;
      color: var(--text-tertiary);
    }

    .pagination-buttons {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .page-nav-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 30px;
      padding: 0 10px;
      background-color: var(--bg-surface-2);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-xs);
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all var(--motion-fast);
      outline: none;
    }
    .page-nav-btn:hover:not(:disabled) {
      background-color: var(--bg-surface-3);
      color: var(--text-primary);
      border-color: var(--border-strong);
    }
    .page-nav-btn:active:not(:disabled) {
      transform: scale(0.98);
    }
    .page-nav-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .page-indicator {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary);
      padding: 0 4px;
    }

    @media (max-width: 768px) {
      .radar-command-bar {
        padding: var(--space-2-5) var(--space-3);
      }
      .command-row-top {
        flex-direction: column;
        align-items: stretch;
      }
      .segmented-control {
        width: 100%;
        overflow-x: auto;
      }
      .command-row-bottom {
        flex-direction: column;
        align-items: stretch;
      }
      .filters-actions-wrap {
        width: 100%;
        justify-content: space-between;
      }
      .filter-select {
        flex: 1;
      }
      .card-meta-row {
        flex-direction: column;
        align-items: flex-start;
        gap: var(--space-1);
      }
      .card-actions-col {
        position: absolute;
        top: 10px;
        right: 10px;
      }
      .opportunity-row-card {
        padding-right: 76px;
      }
    }
  `],
})
export class JobsComponent implements OnInit {
  @ViewChild('searchInput') searchInputRef?: ElementRef<HTMLInputElement>;

  private readonly api = inject(ApiService);
  private readonly telegram = inject(TelegramService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);

  readonly Math = Math;

  readonly isLoading = signal<boolean>(false);
  readonly jobs = signal<JobSummary[]>([]);
  readonly total = signal<number>(0);
  readonly currentPage = signal<number>(1);
  readonly limit = 20;

  // Filter States
  readonly selectedSegment = signal<string>(''); // '', 'EGYPT', 'REMOTE_GCC_ABROAD'
  readonly selectedSourceType = signal<'ALL' | 'SOCIAL' | 'BOARDS'>('ALL');
  selectedWorkplace = '';
  selectedMinScore = '0';
  searchKeyword = '';

  // Drawer state
  readonly isDrawerOpen = signal<boolean>(false);
  readonly selectedJob = signal<JobSummary | null>(null);

  readonly totalPages = computed(() => {
    return Math.ceil(this.total() / this.limit);
  });

  // Global ⌘K / Ctrl+K search focus
  @HostListener('document:keydown', ['$event'])
  onGlobalKeydown(e: KeyboardEvent): void {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      this.searchInputRef?.nativeElement.focus();
      this.searchInputRef?.nativeElement.select();
    }
  }

  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      if (params['segment']) {
        this.selectedSegment.set(params['segment']);
      }
      if (params['keyword']) {
        this.searchKeyword = params['keyword'];
      }
      this.fetchJobs();
    });
  }

  fetchJobs(): void {
    this.isLoading.set(true);

    const queryParams: Record<string, string | number | boolean | null | undefined> = {
      page: this.currentPage(),
      limit: this.limit,
    };

    if (this.selectedSegment()) {
      queryParams['segment'] = this.selectedSegment();
    }

    if (this.selectedSourceType() === 'SOCIAL') {
      queryParams['is_social_post'] = true;
    } else if (this.selectedSourceType() === 'BOARDS') {
      queryParams['is_social_post'] = false;
    }

    if (this.selectedWorkplace) {
      queryParams['workplace_type'] = this.selectedWorkplace;
    }

    const minScoreNum = parseFloat(this.selectedMinScore);
    if (minScoreNum > 0) {
      queryParams['min_score'] = minScoreNum;
    }

    if (this.searchKeyword.trim()) {
      queryParams['keyword'] = this.searchKeyword.trim();
    }

    this.api.getJobs(queryParams).subscribe({
      next: (res) => {
        this.jobs.set(res.items);
        this.total.set(res.total);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load opportunities:', err);
        this.toast.show('Failed to fetch opportunities', 'error');
        this.isLoading.set(false);
      },
    });
  }

  setSegment(seg: string): void {
    this.telegram.haptic('selection');
    this.selectedSegment.set(seg);
    this.currentPage.set(1);
    this.fetchJobs();
  }

  setSourceType(type: 'ALL' | 'SOCIAL' | 'BOARDS'): void {
    this.telegram.haptic('selection');
    this.selectedSourceType.set(type);
    this.currentPage.set(1);
    this.fetchJobs();
  }

  applyFilters(): void {
    this.telegram.haptic('selection');
    this.currentPage.set(1);
    this.fetchJobs();
  }

  clearSearch(): void {
    this.searchKeyword = '';
    this.applyFilters();
  }

  resetFilters(): void {
    this.telegram.haptic('selection');
    this.selectedSegment.set('');
    this.selectedSourceType.set('ALL');
    this.selectedWorkplace = '';
    this.selectedMinScore = '0';
    this.searchKeyword = '';
    this.currentPage.set(1);
    this.fetchJobs();
  }

  hasActiveFilters(): boolean {
    return (
      this.selectedSegment() !== '' ||
      this.selectedSourceType() !== 'ALL' ||
      this.selectedWorkplace !== '' ||
      this.selectedMinScore !== '0' ||
      this.searchKeyword.trim() !== ''
    );
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.telegram.haptic('selection');
    this.currentPage.set(page);
    this.fetchJobs();
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
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

  onStatusUpdated(evt: { jobId: number; status: ApplicationStatus }): void {
    this.jobs.update((list) =>
      list.map((j) => (j.id === evt.jobId ? { ...j, tracker_status: evt.status } : j))
    );
  }

  toggleSave(job: JobSummary, event: Event): void {
    event.stopPropagation();
    const newStatus: ApplicationStatus = job.tracker_status === 'SAVED' ? 'DISCOVERED' : 'SAVED';
    this.telegram.haptic('medium');

    this.jobs.update((list) =>
      list.map((j) => (j.id === job.id ? { ...j, tracker_status: newStatus } : j))
    );

    this.api.updateJobStatus(job.id, newStatus).subscribe({
      next: () => {
        this.toast.show(
          newStatus === 'SAVED' ? 'Saved to Tracker' : 'Removed from Saved',
          'info',
          1800
        );
      },
      error: () => {
        // Rollback
        this.jobs.update((list) =>
          list.map((j) => (j.id === job.id ? { ...j, tracker_status: job.tracker_status } : j))
        );
        this.toast.show('Failed to update bookmark', 'error');
      },
    });
  }

  onDirectApply(job: JobSummary, event: Event): void {
    event.stopPropagation();
    if (job.original_application_url) {
      this.telegram.haptic('medium');
      this.telegram.openExternalLink(job.original_application_url);
    }
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
      case 'REMOTE':
        return 'Remote';
      case 'HYBRID':
        return 'Hybrid';
      case 'ON_SITE':
        return 'On-site';
      default:
        return 'Remote';
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
