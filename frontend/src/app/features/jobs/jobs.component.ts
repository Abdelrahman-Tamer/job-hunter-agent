import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject, catchError, of, switchMap } from 'rxjs';
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
  JobSummary,
  JobTrack,
  WorkplaceType,
} from '../../core/models/job.model';

type SortOption = 'score' | 'recent' | 'direct';
type StatusFilter = 'ALL' | 'SAVED' | 'APPLIED';

@Component({
  selector: 'app-jobs',
  standalone: true,
  imports: [
    FormsModule,
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
    <div class="jobs-radar-view">
      <!-- Architectural Hero Header -->
      <header class="feed-hero">
        <ui-architectural-motif variant="header" />

        <div class="hero-inner">
          <div class="hero-copy">
            <h1 class="hero-title">Opportunities</h1>
            <p class="hero-subtitle">
              Verified frontend engineering roles scored against your skills and geographic eligibility.
            </p>
          </div>

          <div class="hero-telemetry">
            <ui-badge tone="neutral" size="md" [mono]="true">
              {{ total() }} verified
            </ui-badge>
            @if (directContactOnPage() > 0) {
              <ui-badge tone="copper" size="sm" [mono]="true">
                {{ directContactOnPage() }} direct contact
              </ui-badge>
            }
            <ui-badge tone="emerald" size="sm" [dot]="true">
              Cairo 09:00 Radar
            </ui-badge>
          </div>
        </div>
      </header>

      <!-- Frosted Filter Command Bar -->
      <section class="radar-command-bar" aria-label="Search and filter opportunities">
        <div class="command-search-row">
          <!-- Search input with ⌘K hint -->
          <div class="search-box-wrap">
            <app-icon name="search" [size]="15" class="search-lens" />
            <input
              #searchInput
              type="search"
              [(ngModel)]="searchKeyword"
              (keyup.enter)="applyFilters()"
              placeholder="Search roles, skills, or companies (Angular, TypeScript, Cairo)..."
              class="search-input"
              aria-label="Search opportunities"
            />
            @if (searchKeyword) {
              <button
                type="button"
                (click)="clearSearch()"
                class="search-clear-btn"
                aria-label="Clear search"
              >
                <app-icon name="x" [size]="13" />
              </button>
            } @else {
              <span class="kbd-shortcut-hint" aria-hidden="true">⌘K</span>
            }
          </div>

          <!-- Secondary Select Controls & Sort -->
          <div class="filters-select-group">
            <select
              [(ngModel)]="selectedTrack"
              (change)="applyFilters()"
              class="filter-select"
              aria-label="Role track"
            >
              <option value="">All Tracks</option>
              <option value="FRONTEND_EGYPT">Frontend Egypt</option>
              <option value="FRONTEND_REMOTE_GCC">Remote GCC</option>
              <option value="WEB_ANGULAR">Web &amp; Angular</option>
              <option value="FRONTEND_INTERN">Frontend Intern</option>
              <option value="NO_EXP_REMOTE">No-Exp Remote</option>
            </select>

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

            <select
              [(ngModel)]="selectedMinScore"
              (change)="applyFilters()"
              class="filter-select"
              aria-label="Minimum fit score"
            >
              <option value="0">Any Fit Score</option>
              <option value="60">Fit 60%+</option>
              <option value="75">Fit 75%+</option>
              <option value="85">Fit 85%+</option>
            </select>

            <select
              [ngModel]="sortBy()"
              (ngModelChange)="setSort($event)"
              class="filter-select sort-select"
              aria-label="Sort opportunities"
            >
              <option value="score">Sort: Highest Match</option>
              <option value="recent">Sort: Most Recent</option>
              <option value="direct">Sort: Direct Contact</option>
            </select>

            @if (hasActiveFilters()) {
              <ui-button
                variant="ghost"
                size="sm"
                ariaLabel="Reset all filters"
                (clicked)="resetFilters()"
              >
                <app-icon name="refresh" [size]="12" />
                <span>Reset</span>
              </ui-button>
            }
          </div>
        </div>

        <!-- Horizontal Scrollable Pill Filter Rail -->
        <div class="pill-rail-wrap">
          <div class="pill-rail-scroll" role="toolbar" aria-label="Quick category filters">
            <!-- Segment Pills -->
            <button
              type="button"
              [attr.aria-pressed]="selectedSegment() === ''"
              [class.active]="selectedSegment() === ''"
              (click)="setSegment('')"
              class="filter-pill"
            >
              All Regions
            </button>
            <button
              type="button"
              [attr.aria-pressed]="selectedSegment() === 'EGYPT'"
              [class.active]="selectedSegment() === 'EGYPT'"
              (click)="setSegment('EGYPT')"
              class="filter-pill"
            >
              Egypt
            </button>
            <button
              type="button"
              [attr.aria-pressed]="selectedSegment() === 'REMOTE_GCC_ABROAD'"
              [class.active]="selectedSegment() === 'REMOTE_GCC_ABROAD'"
              (click)="setSegment('REMOTE_GCC_ABROAD')"
              class="filter-pill"
            >
              Remote &amp; GCC
            </button>

            <span class="pill-divider" aria-hidden="true"></span>

            <!-- Source Category Pills -->
            <button
              type="button"
              [attr.aria-pressed]="selectedSourceType() === 'ALL'"
              [class.active]="selectedSourceType() === 'ALL'"
              (click)="setSourceType('ALL')"
              class="filter-pill"
            >
              All Sources
            </button>
            <button
              type="button"
              [attr.aria-pressed]="selectedSourceType() === 'SOCIAL'"
              [class.active]="selectedSourceType() === 'SOCIAL'"
              (click)="setSourceType('SOCIAL')"
              class="filter-pill"
            >
              <app-icon name="message-square" [size]="12" />
              <span>LinkedIn Social</span>
            </button>
            <button
              type="button"
              [attr.aria-pressed]="selectedSourceType() === 'BOARDS'"
              [class.active]="selectedSourceType() === 'BOARDS'"
              (click)="setSourceType('BOARDS')"
              class="filter-pill"
            >
              <app-icon name="briefcase" [size]="12" />
              <span>Job Boards</span>
            </button>

            <span class="pill-divider" aria-hidden="true"></span>

            <!-- Direct Contact & Status Pills -->
            <button
              type="button"
              [attr.aria-pressed]="directContactOnly()"
              [class.active]="directContactOnly()"
              [class.copper-active]="directContactOnly()"
              (click)="toggleDirectContactFilter()"
              class="filter-pill"
            >
              <app-icon name="mail" [size]="12" />
              <span>Direct Contact</span>
            </button>

            <button
              type="button"
              [attr.aria-pressed]="statusFilter() === 'SAVED'"
              [class.active]="statusFilter() === 'SAVED'"
              (click)="toggleStatusFilter('SAVED')"
              class="filter-pill"
            >
              <app-icon name="bookmark" [size]="12" />
              <span>Saved</span>
            </button>

            <button
              type="button"
              [attr.aria-pressed]="statusFilter() === 'APPLIED'"
              [class.active]="statusFilter() === 'APPLIED'"
              (click)="toggleStatusFilter('APPLIED')"
              class="filter-pill"
            >
              <app-icon name="check-circle" [size]="12" />
              <span>Applied</span>
            </button>
          </div>
        </div>

        <!-- Telemetry Sub-Bar -->
        <div class="telemetry-bar">
          <div class="telemetry-left tabular-nums">
            <span>
              <strong>{{ displayedJobs().length }}</strong> shown
              @if (hasLocalPageFilter()) {
                <span>(filtered from {{ jobs().length }} on page)</span>
              } @else {
                <span>of {{ total() }} total</span>
              }
            </span>
            <span class="telemetry-dot" aria-hidden="true">/</span>
            <span>Page {{ currentPage() }} of {{ totalPages() || 1 }}</span>
          </div>

          @if (hasLocalPageFilter()) {
            <button
              type="button"
              (click)="clearLocalPageFilters()"
              class="inline-reset-link"
            >
              Clear page filter
            </button>
          }
        </div>
      </section>

      <!-- Opportunities Feed Content -->
      <section class="radar-feed-container" aria-label="Opportunities list">
        <!-- Loading State -->
        @if (isLoading()) {
          <div class="feed-skeletons-list">
            @for (item of [1, 2, 3, 4, 5]; track item) {
              <ui-skeleton height="114px" rounded="lg" />
            }
          </div>
        } @else if (displayedJobs().length === 0) {
          <!-- Empty State -->
          <ui-empty-state
            icon="briefcase"
            title="No Matching Opportunities Found"
            [subtitle]="
              hasLocalPageFilter()
                ? 'No roles on this page match your Direct Contact or status filter.'
                : 'No roles match your current segment, track, search keywords, or fit criteria.'
            "
          >
            <div action>
              <ui-button variant="secondary" size="sm" (clicked)="resetFilters()">
                <app-icon name="refresh" [size]="13" />
                <span>Reset Filters</span>
              </ui-button>
            </div>
          </ui-empty-state>
        } @else {
          <!-- Opportunity Cards Feed -->
          <div class="opportunities-list" role="feed">
            @for (job of displayedJobs(); track job.id; let idx = $index) {
              <div
                class="job-card-motion"
                [style.animation-delay]="(idx < 10 ? idx * 30 : 0) + 'ms'"
              >
                <ui-card
                  variant="elevated"
                  padding="md"
                  [interactive]="true"
                  class="opportunity-card"
                  tabindex="0"
                  role="article"
                  [attr.aria-label]="job.title + ' at ' + job.company"
                  (click)="openDrawer(job)"
                  (keydown.enter)="openDrawer(job)"
                >
                  <div class="job-card-grid">
                    <!-- Left / Primary Info Column -->
                    <div class="job-primary-col">
                      <div class="job-title-header">
                        <h3 class="role-title" dir="auto">{{ job.title }}</h3>
                      </div>

                      <div class="job-company-line">
                        <span class="company-name" dir="auto">{{ job.company }}</span>

                        @if (job.raw_location) {
                          <span class="meta-sep" aria-hidden="true">/</span>
                          <span class="meta-inline">
                            <app-icon name="map-pin" [size]="12" />
                            <span class="location-text" dir="auto">{{ job.raw_location }}</span>
                          </span>
                        }

                        <span class="meta-sep" aria-hidden="true">/</span>
                        <span class="time-relative tabular-nums">
                          {{ formatRelativeDate(job.published_at || job.first_seen_at) }}
                        </span>

                        @if (job.poster_name) {
                          <span class="poster-tag">
                            <app-icon name="user" [size]="11" />
                            <span>{{ job.poster_name }}</span>
                          </span>
                        }
                      </div>

                      <!-- Signal Chips Row -->
                      <div class="signals-row">
                        @if (hasDirectContact(job)) {
                          <ui-badge tone="copper" size="sm">
                            <app-icon name="mail" [size]="11" />
                            <span>{{ getDirectContactLabel(job) }}</span>
                          </ui-badge>
                        }

                        @if (job.is_social_post) {
                          <ui-badge tone="glass" size="sm" [dot]="true">
                            LinkedIn Social
                          </ui-badge>
                        } @else if (job.origin_board) {
                          <ui-badge tone="glass" size="sm">
                            {{ job.origin_board }}
                          </ui-badge>
                        }

                        <ui-badge
                          [tone]="job.workplace_type === 'REMOTE' ? 'emerald' : 'neutral'"
                          size="sm"
                        >
                          {{ formatWorkplace(job.workplace_type) }}
                        </ui-badge>

                        <ui-badge tone="neutral" size="sm">
                          {{ formatTrackOrSegment(job) }}
                        </ui-badge>

                        @if (job.tracker_status && job.tracker_status !== 'DISCOVERED') {
                          <ui-badge
                            [tone]="job.tracker_status === 'APPLIED' || job.tracker_status === 'OFFER' ? 'emerald' : 'copper'"
                            size="sm"
                          >
                            {{ formatStatus(job.tracker_status) }}
                          </ui-badge>
                        }
                      </div>

                      <!-- Skills Row -->
                      @if (job.required_skills && job.required_skills.length > 0) {
                        <div class="skills-preview-group">
                          @for (skill of job.required_skills.slice(0, 4); track skill) {
                            <span class="skill-chip">{{ skill }}</span>
                          }
                          @if (job.required_skills.length > 4) {
                            <span class="skill-chip overflow tabular-nums">
                              +{{ job.required_skills.length - 4 }}
                            </span>
                          }
                        </div>
                      }
                    </div>

                    <!-- Right / Signal & Actions Column -->
                    <div class="job-signal-col" (click)="$event.stopPropagation()">
                      <ui-match-pill
                        [score]="roundScore(job.match_score)"
                        size="md"
                      />

                      <div class="card-actions-row">
                        <button
                          type="button"
                          (click)="toggleSave(job, $event)"
                          class="quick-action-btn bookmark-btn"
                          [class.saved]="job.tracker_status === 'SAVED'"
                          [disabled]="savingJobIds().has(job.id)"
                          [title]="job.tracker_status === 'SAVED' ? 'Remove from Saved' : 'Save opportunity'"
                          [attr.aria-label]="job.tracker_status === 'SAVED' ? 'Remove from Saved' : 'Save opportunity'"
                        >
                          <app-icon
                            [name]="job.tracker_status === 'SAVED' ? 'check' : 'bookmark'"
                            [size]="15"
                          />
                        </button>

                        @if (job.original_application_url) {
                          <a
                            [href]="job.original_application_url"
                            target="_blank"
                            rel="noopener noreferrer"
                            (click)="onDirectApply(job, $event)"
                            class="quick-action-btn apply-btn"
                            title="Open application link"
                            aria-label="Open application link"
                          >
                            <app-icon name="external-link" [size]="15" />
                          </a>
                        }
                      </div>
                    </div>
                  </div>
                </ui-card>
              </div>
            }
          </div>
        }

        <!-- Pagination Controls -->
        @if (!isLoading() && total() > 0) {
          <footer class="radar-pagination-bar">
            <div class="pagination-info tabular-nums">
              Showing {{ ((currentPage() - 1) * limit) + 1 }}-{{ Math.min(currentPage() * limit, total()) }} of {{ total() }}
            </div>

            <div class="pagination-buttons">
              <ui-button
                variant="secondary"
                size="sm"
                [disabled]="currentPage() <= 1"
                ariaLabel="Previous page"
                (clicked)="goToPage(currentPage() - 1)"
              >
                <app-icon name="chevron-left" [size]="14" />
                <span>Prev</span>
              </ui-button>

              <span class="page-indicator tabular-nums">
                {{ currentPage() }} / {{ totalPages() || 1 }}
              </span>

              <ui-button
                variant="secondary"
                size="sm"
                [disabled]="currentPage() >= totalPages()"
                ariaLabel="Next page"
                (clicked)="goToPage(currentPage() + 1)"
              >
                <span>Next</span>
                <app-icon name="chevron-right" [size]="14" />
              </ui-button>
            </div>
          </footer>
        }
      </section>

      <!-- Elevated Frosted Slide-Over Drawer -->
      <app-job-drawer
        [isOpen]="isDrawerOpen()"
        [job]="selectedJob()"
        (closeDrawer)="closeDrawer()"
        (statusUpdated)="onStatusUpdated($event)"
      />
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
      max-width: 1120px;
      margin: 0 auto;
    }

    /* ==========================================================================
       Architectural Hero Header
       ========================================================================== */
    .feed-hero {
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
      gap: var(--space-1);
      max-width: 62ch;
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

    .hero-telemetry {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
    }

    /* ==========================================================================
       Frosted Filter Command Bar
       ========================================================================== */
    .radar-command-bar {
      position: sticky;
      top: 12px;
      z-index: 40;
      background-color: var(--surface-glass);
      backdrop-filter: var(--blur-glass);
      -webkit-backdrop-filter: var(--blur-glass);
      border: 1px solid var(--border-hairline);
      box-shadow: var(--border-specular), var(--shadow-sm);
      border-radius: var(--radius-lg);
      padding: var(--space-3-5) var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .command-search-row {
      display: flex;
      align-items: center;
      gap: var(--space-2-5);
      flex-wrap: wrap;
    }

    .search-box-wrap {
      flex: 1 1 280px;
      min-width: 0;
      position: relative;
      display: flex;
      align-items: center;
    }

    .search-lens {
      position: absolute;
      left: 12px;
      color: var(--ink-muted);
      pointer-events: none;
    }

    .search-input {
      width: 100%;
      height: 38px;
      background-color: var(--surface-subtle);
      border: 1px solid var(--border-hairline);
      border-radius: var(--radius-sm);
      padding: 0 38px 0 36px;
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      color: var(--ink-primary);
      transition:
        border-color var(--dur-fast) var(--ease-spring),
        background-color var(--dur-fast) var(--ease-spring),
        box-shadow var(--dur-fast) var(--ease-spring);
    }

    .search-input:hover {
      border-color: var(--border-strong);
    }

    .search-input:focus {
      outline: none;
      border-color: var(--accent-copper);
      box-shadow: 0 0 0 2px var(--accent-copper-focus);
      background-color: var(--surface-elevated);
    }

    .search-input::placeholder {
      color: var(--ink-muted);
    }

    .search-clear-btn {
      position: absolute;
      right: 4px;
      min-width: 32px;
      min-height: 32px;
      background: transparent;
      border: none;
      color: var(--ink-muted);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-xs);
      transition: color var(--dur-fast) var(--ease-spring);
    }

    .search-clear-btn:hover {
      color: var(--ink-primary);
    }

    .kbd-shortcut-hint {
      position: absolute;
      right: 10px;
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 600;
      color: var(--ink-muted);
      background: var(--surface-elevated);
      border: 1px solid var(--border-hairline);
      border-radius: var(--radius-xs);
      padding: 2px 6px;
      pointer-events: none;
    }

    .filters-select-group {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
    }

    .filter-select {
      height: 38px;
      background-color: var(--surface-subtle);
      border: 1px solid var(--border-hairline);
      border-radius: var(--radius-sm);
      padding: 0 10px;
      font-family: var(--font-sans);
      font-size: var(--text-xs);
      font-weight: 500;
      color: var(--ink-secondary);
      cursor: pointer;
      transition:
        border-color var(--dur-fast) var(--ease-spring),
        color var(--dur-fast) var(--ease-spring),
        background-color var(--dur-fast) var(--ease-spring);
    }

    .filter-select:hover {
      border-color: var(--border-strong);
      color: var(--ink-primary);
    }

    .filter-select:focus {
      outline: none;
      border-color: var(--accent-copper);
      box-shadow: 0 0 0 2px var(--accent-copper-focus);
      background-color: var(--surface-elevated);
    }

    /* Horizontal Scrollable Pill Rail */
    .pill-rail-wrap {
      min-width: 0;
      max-width: 100%;
    }

    .pill-rail-scroll {
      display: flex;
      align-items: center;
      gap: var(--space-1-5);
      overflow-x: auto;
      scrollbar-width: none;
      -ms-overflow-style: none;
      -webkit-overflow-scrolling: touch;
      padding: 2px 0;
    }

    .pill-rail-scroll::-webkit-scrollbar {
      display: none;
    }

    .filter-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      flex-shrink: 0;
      min-height: 34px;
      padding: 6px 12px;
      border-radius: var(--radius-full);
      border: 1px solid var(--border-hairline);
      background-color: var(--surface-subtle);
      color: var(--ink-secondary);
      font-family: var(--font-sans);
      font-size: var(--text-xs);
      font-weight: 500;
      white-space: nowrap;
      cursor: pointer;
      transition:
        background-color var(--dur-fast) var(--ease-spring),
        border-color var(--dur-fast) var(--ease-spring),
        color var(--dur-fast) var(--ease-spring),
        transform var(--dur-fast) var(--ease-spring);
    }

    .filter-pill:hover {
      background-color: var(--surface-elevated);
      border-color: var(--border-strong);
      color: var(--ink-primary);
    }

    .filter-pill:active {
      transform: scale(0.975);
    }

    .filter-pill.active {
      background-color: var(--surface-elevated);
      border-color: var(--border-strong);
      color: var(--ink-primary);
      font-weight: 600;
      box-shadow: var(--border-specular-sm), var(--shadow-xs);
    }

    .filter-pill.copper-active {
      background-color: var(--accent-copper-soft);
      border-color: var(--border-copper);
      color: var(--accent-copper-text);
    }

    .pill-divider {
      width: 1px;
      height: 18px;
      background-color: var(--border-hairline);
      flex-shrink: 0;
      margin: 0 2px;
    }

    /* Telemetry Sub-Bar */
    .telemetry-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      padding-top: var(--space-2-5);
      border-top: 1px solid var(--border-hairline);
      font-size: var(--text-xs);
      color: var(--ink-muted);
    }

    .telemetry-left {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
    }

    .telemetry-left strong {
      color: var(--ink-primary);
      font-weight: 600;
    }

    .telemetry-dot {
      color: var(--border-strong);
    }

    .inline-reset-link {
      font-size: var(--text-xs);
      font-weight: 600;
      color: var(--accent-copper-text);
      padding: 4px 8px;
      border-radius: var(--radius-xs);
      transition: background-color var(--dur-fast) var(--ease-spring);
    }

    .inline-reset-link:hover {
      background-color: var(--accent-copper-soft);
    }

    /* ==========================================================================
       Opportunities Feed & Staggered Motion
       ========================================================================== */
    .radar-feed-container {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      width: 100%;
    }

    .feed-skeletons-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .opportunities-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .job-card-motion {
      animation: studioFadeUp var(--dur-base) var(--ease-spring) both;
    }

    .opportunity-card {
      outline: none;
    }

    .opportunity-card:focus-visible {
      outline: 2px solid var(--accent-copper);
      outline-offset: 2px;
    }

    .job-card-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--space-4);
      align-items: start;
    }

    .job-primary-col {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .job-title-header {
      display: flex;
      align-items: flex-start;
      gap: var(--space-2);
    }

    .role-title {
      margin: 0;
      font-family: var(--font-display);
      font-size: var(--text-md);
      font-weight: 600;
      letter-spacing: var(--tracking-snug);
      color: var(--ink-primary);
      line-height: 1.35;
    }

    .job-company-line {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      font-size: var(--text-sm);
      color: var(--ink-secondary);
    }

    .company-name {
      font-weight: 600;
      color: var(--ink-primary);
    }

    .meta-sep {
      color: var(--ink-muted);
    }

    .meta-inline {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--ink-secondary);
      min-width: 0;
    }

    .location-text {
      max-width: 200px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .time-relative {
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      color: var(--ink-muted);
    }

    .poster-tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: var(--radius-full);
      background-color: var(--semantic-steel-soft);
      border: 1px solid var(--semantic-steel-border);
      color: var(--semantic-steel-text);
      font-size: var(--text-xs);
      font-weight: 500;
    }

    .signals-row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
    }

    .skills-preview-group {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 5px;
      padding-top: 2px;
    }

    .skill-chip {
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 500;
      background-color: var(--surface-subtle);
      border: 1px solid var(--border-hairline);
      border-radius: var(--radius-xs);
      padding: 2px 7px;
      color: var(--ink-secondary);
    }

    .skill-chip.overflow {
      color: var(--ink-muted);
      border-style: dashed;
    }

    /* Right / Signal Column */
    .job-signal-col {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--space-3);
      flex-shrink: 0;
    }

    .card-actions-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .quick-action-btn {
      min-width: 38px;
      min-height: 38px;
      border-radius: var(--radius-sm);
      background-color: var(--surface-subtle);
      border: 1px solid var(--border-hairline);
      box-shadow: var(--border-specular-sm);
      color: var(--ink-secondary);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      text-decoration: none;
      transition:
        background-color var(--dur-fast) var(--ease-spring),
        border-color var(--dur-fast) var(--ease-spring),
        color var(--dur-fast) var(--ease-spring),
        transform var(--dur-fast) var(--ease-spring);
    }

    .quick-action-btn:hover:not(:disabled) {
      background-color: var(--surface-elevated);
      border-color: var(--border-strong);
      color: var(--ink-primary);
    }

    .quick-action-btn:active:not(:disabled) {
      transform: scale(0.96);
    }

    .quick-action-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .quick-action-btn.bookmark-btn.saved {
      color: var(--semantic-emerald-text);
      background-color: var(--semantic-emerald-soft);
      border-color: var(--semantic-emerald-border);
    }

    .quick-action-btn.apply-btn:hover {
      color: var(--accent-copper-text);
      border-color: var(--border-copper);
    }

    /* ==========================================================================
       Pagination Bar
       ========================================================================== */
    .radar-pagination-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      flex-wrap: wrap;
      padding: var(--space-3) var(--space-4);
      background-color: var(--surface-elevated);
      border: 1px solid var(--border-hairline);
      box-shadow: var(--border-specular-sm);
      border-radius: var(--radius-md);
      margin-top: var(--space-1);
    }

    .pagination-info {
      font-size: var(--text-xs);
      color: var(--ink-muted);
    }

    .pagination-buttons {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .page-indicator {
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      font-weight: 600;
      color: var(--ink-primary);
      padding: 0 6px;
    }

    /* ==========================================================================
       Mobile & Telegram Mini App Precision (<= 767px, 360x800)
       ========================================================================== */
    @media (max-width: 767px) {
      .feed-hero {
        padding: var(--space-4);
      }

      .radar-command-bar {
        position: static;
        padding: var(--space-3);
      }

      .command-search-row {
        flex-direction: column;
        align-items: stretch;
      }

      .search-box-wrap {
        flex: none;
        width: 100%;
      }

      .search-input {
        height: 44px;
        font-size: var(--text-base);
      }

      .filters-select-group {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        width: 100%;
      }

      .filter-select {
        height: 44px;
        width: 100%;
        min-width: 0;
      }

      .filter-pill {
        min-height: 44px;
        padding: 8px 14px;
      }

      .job-card-grid {
        grid-template-columns: minmax(0, 1fr);
        gap: var(--space-3);
      }

      .job-signal-col {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        padding-top: var(--space-2-5);
        border-top: 1px solid var(--border-hairline);
      }

      .quick-action-btn {
        min-width: 44px;
        min-height: 44px;
      }

      .location-text {
        max-width: 140px;
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
  private readonly destroyRef = inject(DestroyRef);

  private readonly fetchTrigger$ = new Subject<void>();

  readonly Math = Math;

  readonly isLoading = signal<boolean>(false);
  readonly jobs = signal<JobSummary[]>([]);
  readonly total = signal<number>(0);
  readonly currentPage = signal<number>(1);
  readonly limit = 20;
  readonly savingJobIds = signal<Set<number>>(new Set());

  // Server-backed filter states
  readonly selectedSegment = signal<string>('');
  readonly selectedSourceType = signal<'ALL' | 'SOCIAL' | 'BOARDS'>('ALL');
  selectedTrack: JobTrack | '' = '';
  selectedWorkplace = '';
  selectedMinScore = '0';
  searchKeyword = '';

  // Page-level filter & sort signals
  readonly directContactOnly = signal<boolean>(false);
  readonly statusFilter = signal<StatusFilter>('ALL');
  readonly sortBy = signal<SortOption>('score');

  // Drawer state
  readonly isDrawerOpen = signal<boolean>(false);
  readonly selectedJob = signal<JobSummary | null>(null);

  readonly totalPages = computed(() => Math.ceil(this.total() / this.limit));

  readonly directContactOnPage = computed(
    () => this.jobs().filter((j) => this.hasDirectContact(j)).length
  );

  readonly displayedJobs = computed<JobSummary[]>(() => {
    let list = [...this.jobs()];

    if (this.directContactOnly()) {
      list = list.filter((j) => this.hasDirectContact(j));
    }

    const st = this.statusFilter();
    if (st !== 'ALL') {
      list = list.filter((j) => j.tracker_status === st);
    }

    const sortMode = this.sortBy();
    if (sortMode === 'recent') {
      list.sort((a, b) => {
        const ta = new Date(a.published_at || a.first_seen_at).getTime();
        const tb = new Date(b.published_at || b.first_seen_at).getTime();
        return tb - ta;
      });
    } else if (sortMode === 'direct') {
      list.sort((a, b) => {
        const da = this.hasDirectContact(a) ? 1 : 0;
        const db = this.hasDirectContact(b) ? 1 : 0;
        if (db !== da) return db - da;
        return b.match_score - a.match_score;
      });
    } else {
      list.sort((a, b) => b.match_score - a.match_score);
    }

    return list;
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
    this.fetchTrigger$
      .pipe(
        switchMap(() => {
          this.isLoading.set(true);
          return this.api.getJobs(this.buildQueryParams()).pipe(
            catchError((err: unknown) => {
              console.error('Failed to load opportunities:', err);
              this.toast.show('Failed to fetch opportunities', 'error');
              this.isLoading.set(false);
              return of(null);
            })
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((res) => {
        if (!res) return;
        this.jobs.set(res.items);
        this.total.set(res.total);
        this.isLoading.set(false);
      });

    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        this.selectedSegment.set(params['segment'] || '');
        this.searchKeyword = params['keyword'] || '';
        this.currentPage.set(1);
        this.fetchJobs();
      });
  }

  private buildQueryParams(): Record<string, string | number | boolean | null | undefined> {
    const queryParams: Record<string, string | number | boolean | null | undefined> = {
      page: this.currentPage(),
      limit: this.limit,
    };

    if (this.selectedSegment()) {
      queryParams['segment'] = this.selectedSegment();
    }

    if (this.selectedTrack) {
      queryParams['track'] = this.selectedTrack;
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

    return queryParams;
  }

  fetchJobs(): void {
    this.fetchTrigger$.next();
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

  toggleDirectContactFilter(): void {
    this.telegram.haptic('selection');
    this.directContactOnly.update((v) => !v);
  }

  toggleStatusFilter(target: 'SAVED' | 'APPLIED'): void {
    this.telegram.haptic('selection');
    this.statusFilter.update((cur) => (cur === target ? 'ALL' : target));
  }

  setSort(sort: SortOption): void {
    this.telegram.haptic('selection');
    this.sortBy.set(sort);
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

  clearLocalPageFilters(): void {
    this.telegram.haptic('selection');
    this.directContactOnly.set(false);
    this.statusFilter.set('ALL');
  }

  resetFilters(): void {
    this.telegram.haptic('selection');
    this.selectedSegment.set('');
    this.selectedSourceType.set('ALL');
    this.selectedTrack = '';
    this.selectedWorkplace = '';
    this.selectedMinScore = '0';
    this.searchKeyword = '';
    this.directContactOnly.set(false);
    this.statusFilter.set('ALL');
    this.sortBy.set('score');
    this.currentPage.set(1);
    this.fetchJobs();
  }

  hasLocalPageFilter(): boolean {
    return this.directContactOnly() || this.statusFilter() !== 'ALL';
  }

  hasActiveFilters(): boolean {
    return (
      this.selectedSegment() !== '' ||
      this.selectedSourceType() !== 'ALL' ||
      this.selectedTrack !== '' ||
      this.selectedWorkplace !== '' ||
      this.selectedMinScore !== '0' ||
      this.searchKeyword.trim() !== '' ||
      this.hasLocalPageFilter()
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
    if (this.selectedJob()?.id === evt.jobId) {
      this.selectedJob.update((cur) => (cur ? { ...cur, tracker_status: evt.status } : cur));
    }
  }

  toggleSave(job: JobSummary, event: Event): void {
    event.stopPropagation();
    if (this.savingJobIds().has(job.id)) return;

    const prevStatus: ApplicationStatus = job.tracker_status || 'DISCOVERED';
    const newStatus: ApplicationStatus = prevStatus === 'SAVED' ? 'DISCOVERED' : 'SAVED';
    this.telegram.haptic('medium');

    this.savingJobIds.update((set) => {
      const next = new Set(set);
      next.add(job.id);
      return next;
    });

    this.jobs.update((list) =>
      list.map((j) => (j.id === job.id ? { ...j, tracker_status: newStatus } : j))
    );
    if (this.selectedJob()?.id === job.id) {
      this.selectedJob.update((cur) => (cur ? { ...cur, tracker_status: newStatus } : cur));
    }

    this.api
      .updateJobStatus(job.id, newStatus)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.clearSavingJobId(job.id);
          this.toast.show(
            newStatus === 'SAVED' ? 'Saved to Tracker' : 'Removed from Saved',
            'info',
            1800
          );
        },
        error: () => {
          this.clearSavingJobId(job.id);
          this.jobs.update((list) =>
            list.map((j) => (j.id === job.id ? { ...j, tracker_status: prevStatus } : j))
          );
          if (this.selectedJob()?.id === job.id) {
            this.selectedJob.update((cur) => (cur ? { ...cur, tracker_status: prevStatus } : cur));
          }
          this.toast.show('Failed to update bookmark', 'error');
        },
      });
  }

  private clearSavingJobId(jobId: number): void {
    this.savingJobIds.update((set) => {
      const next = new Set(set);
      next.delete(jobId);
      return next;
    });
  }

  onDirectApply(job: JobSummary, event: Event): void {
    event.stopPropagation();
    if (job.original_application_url && this.telegram.isTelegram()) {
      event.preventDefault();
      this.telegram.haptic('medium');
      this.telegram.openExternalLink(job.original_application_url);
    }
  }

  hasDirectContact(job: JobSummary): boolean {
    return Boolean(job.direct_email || job.whatsapp_contact || job.apply_form_url);
  }

  getDirectContactLabel(job: JobSummary): string {
    if (job.direct_email) return 'Direct Email';
    if (job.whatsapp_contact) return 'WhatsApp Direct';
    return 'Direct Contact';
  }

  roundScore(score: number): number {
    return Math.round(score);
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

  formatTrackOrSegment(job: JobSummary): string {
    switch (job.job_track) {
      case 'FRONTEND_EGYPT':
        return 'Egypt Frontend';
      case 'FRONTEND_REMOTE_GCC':
        return 'Remote GCC';
      case 'WEB_ANGULAR':
        return 'Web / Angular';
      case 'FRONTEND_INTERN':
        return 'Frontend Intern';
      case 'NO_EXP_REMOTE':
        return 'No-Exp Remote';
      default:
        return job.opportunity_segment === 'REMOTE_GCC_ABROAD'
          ? 'Remote Abroad'
          : job.opportunity_segment === 'EGYPT'
            ? 'Egypt'
            : 'Frontend';
    }
  }

  formatStatus(status: ApplicationStatus): string {
    return status.charAt(0) + status.slice(1).toLowerCase();
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
