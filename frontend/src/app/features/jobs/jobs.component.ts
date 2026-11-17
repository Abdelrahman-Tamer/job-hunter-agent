import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { TelegramService } from '../../core/services/telegram.service';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent, IconName } from '../../core/components/icon/icon.component';
import { JobDrawerComponent } from '../../core/components/job-drawer/job-drawer.component';
import { JobDetail, JobSummary, ApplicationStatus } from '../../core/models/job.model';

interface QuickChip {
  id: string;
  label: string;
  icon: IconName;
  track?: string;
  eligibility?: string;
  minScore?: number;
}

@Component({
  selector: 'app-jobs',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, JobDrawerComponent],
  template: `
    <div class="jobs-view">
      <!-- 3-Track Architectural Segmented Navigation Bar -->
      <nav class="track-segmented-bar" role="tablist" aria-label="Job track specialization">
        <button
          type="button"
          role="tab"
          [attr.aria-selected]="selectedTrack === ''"
          class="track-segment-btn"
          [class.active]="selectedTrack === ''"
          (click)="setTrackFilter('')"
        >
          <span class="segment-icon">⚡</span>
          <div class="segment-meta">
            <span class="segment-title">All Tracks</span>
            <span class="segment-sub">All Opportunities</span>
          </div>
        </button>

        <button
          type="button"
          role="tab"
          [attr.aria-selected]="selectedTrack === 'WEB_ANGULAR'"
          class="track-segment-btn track-web"
          [class.active]="selectedTrack === 'WEB_ANGULAR'"
          (click)="setTrackFilter('WEB_ANGULAR')"
        >
          <span class="segment-icon">🌐</span>
          <div class="segment-meta">
            <span class="segment-title">Web & Angular</span>
            <span class="segment-sub">Frontend Specialist</span>
          </div>
        </button>

        <button
          type="button"
          role="tab"
          [attr.aria-selected]="selectedTrack === 'NO_EXP_REMOTE'"
          class="track-segment-btn track-remote"
          [class.active]="selectedTrack === 'NO_EXP_REMOTE'"
          (click)="setTrackFilter('NO_EXP_REMOTE')"
        >
          <span class="segment-icon">💼</span>
          <div class="segment-meta">
            <span class="segment-title">No-Exp Remote</span>
            <span class="segment-sub">Data, Support & VA</span>
          </div>
        </button>

        <button
          type="button"
          role="tab"
          [attr.aria-selected]="selectedTrack === 'SOFTWARE_INTERN'"
          class="track-segment-btn track-intern"
          [class.active]="selectedTrack === 'SOFTWARE_INTERN'"
          (click)="setTrackFilter('SOFTWARE_INTERN')"
        >
          <span class="segment-icon">🎓</span>
          <div class="segment-meta">
            <span class="segment-title">Software Interns</span>
            <span class="segment-sub">Frontend, Backend, AI</span>
          </div>
        </button>
      </nav>

      <!-- Search & Filters Command Bar -->
      <section class="filters-workbench" aria-label="Search and filter workbench">
        <!-- Unified Top Search Row -->
        <div class="search-command-row">
          <div class="search-input-wrap">
            <app-icon name="search" [size]="14" class="search-icon"></app-icon>
            <input
              type="search"
              [(ngModel)]="searchKeyword"
              (keyup.enter)="applyFilters()"
              placeholder="Search by role or keywords (Angular, TypeScript, RxJS, Node)..."
              class="form-input search-input"
              aria-label="Search jobs"
            />
            <button
              *ngIf="searchKeyword"
              (click)="clearSearch()"
              class="clear-search-btn"
              aria-label="Clear search"
            >
              <app-icon name="x" [size]="13"></app-icon>
            </button>
          </div>

          <div class="search-actions-group">
            <button (click)="applyFilters()" class="btn btn-primary search-btn">
              <span>Filter</span>
            </button>

            <!-- View Switcher -->
            <div class="view-switcher" role="group" aria-label="View toggle">
              <button
                (click)="setViewMode('grid')"
                [class.active]="viewMode() === 'grid'"
                class="view-btn"
                title="Grid view"
                aria-label="Grid view"
              >
                <app-icon name="grid" [size]="13"></app-icon>
              </button>
              <button
                (click)="setViewMode('list')"
                [class.active]="viewMode() === 'list'"
                class="view-btn"
                title="Compact list view"
                aria-label="List view"
              >
                <app-icon name="list" [size]="13"></app-icon>
              </button>
            </div>
          </div>
        </div>

        <!-- Filter Chips & Dropdowns Bar -->
        <div class="filter-controls-row">
          <!-- Quick Filter Segment -->
          <div class="quick-chips-group" role="group" aria-label="Quick filters">
            <button
              *ngFor="let chip of quickChips"
              (click)="selectQuickChip(chip.id)"
              [class.active]="activeQuickChip() === chip.id"
              class="chip-pill"
            >
              <app-icon [name]="chip.icon" [size]="11"></app-icon>
              <span>{{ chip.label }}</span>
            </button>
          </div>

          <!-- Dropdowns -->
          <div class="dropdowns-group">
            <select [(ngModel)]="selectedTrack" (change)="applyFilters()" class="form-select select-compact" aria-label="Filter track">
              <option value="">All Tracks</option>
              <option value="WEB_ANGULAR">🌐 Web & Angular</option>
              <option value="NO_EXP_REMOTE">💼 No-Exp Remote</option>
              <option value="SOFTWARE_INTERN">🎓 Software Interns</option>
            </select>

            <select [(ngModel)]="selectedEligibility" (change)="applyFilters()" class="form-select select-compact" aria-label="Filter geography">
              <option value="">All Regions</option>
              <option value="EGYPT_ELIGIBLE">Egypt Eligible</option>
              <option value="REMOTE_WORLDWIDE">Remote Worldwide</option>
              <option value="REMOTE_REGION_POSSIBLE">Region Possible</option>
            </select>

            <select [(ngModel)]="selectedWorkplace" (change)="applyFilters()" class="form-select select-compact" aria-label="Filter workplace">
              <option value="">Work Mode</option>
              <option value="REMOTE">Remote</option>
              <option value="HYBRID">Hybrid</option>
              <option value="ON_SITE">On-site</option>
            </select>

            <select [(ngModel)]="selectedSeniority" (change)="applyFilters()" class="form-select select-compact" aria-label="Filter seniority">
              <option value="">Seniority</option>
              <option value="GRADUATE">Graduate</option>
              <option value="JUNIOR">Junior</option>
              <option value="MID">Mid-level</option>
              <option value="SENIOR">Senior</option>
            </select>

            <select [(ngModel)]="minScore" (change)="applyFilters()" class="form-select select-compact" aria-label="Filter min score">
              <option [ngValue]="0">Score: Any</option>
              <option [ngValue]="60">60%+ Match</option>
              <option [ngValue]="70">70%+ Strong</option>
              <option [ngValue]="80">80%+ Top</option>
            </select>
          </div>
        </div>
      </section>

      <!-- Results Count & Active Filter Indicator -->
      <div class="results-meta-strip">
        <span class="count-indicator">
          <strong>{{ jobs().length }}</strong> verified opportunities shown (of {{ totalCount() }} total)
        </span>
        <button *ngIf="hasActiveFilters()" (click)="resetFilters()" class="btn btn-ghost btn-sm reset-btn">
          <app-icon name="x" [size]="11"></app-icon>
          <span>Reset Filters</span>
        </button>
      </div>

      <!-- Main Results Display -->
      <section class="results-display-area" aria-label="Job listings">
        <!-- Skeleton Loading State -->
        <div *ngIf="isLoading()" class="skeleton-grid">
          <div *ngFor="let i of [1, 2, 3, 4, 5, 6]" class="skeleton-box">
            <div class="skeleton-line-top"></div>
            <div class="skeleton-line-middle"></div>
            <div class="skeleton-line-bottom"></div>
          </div>
        </div>

        <!-- Empty State -->
        <div *ngIf="!isLoading() && jobs().length === 0" class="empty-state-box">
          <app-icon name="search" [size]="32" class="empty-icon"></app-icon>
          <h3>No matching opportunities found</h3>
          <p>Try clearing filters or switching search criteria to discover more roles.</p>
          <button (click)="resetFilters()" class="btn btn-secondary btn-sm">
            <span>Reset All Filters</span>
          </button>
        </div>

        <!-- GRID VIEW: Clean Architectural Cards -->
        <div class="jobs-grid-layout" *ngIf="!isLoading() && jobs().length > 0 && viewMode() === 'grid'">
          <article
            *ngFor="let job of jobs()"
            class="job-grid-card"
            [class.card-excellent]="job.match_score >= 80"
            (click)="inspectJob(job)"
            tabindex="0"
            (keyup.enter)="inspectJob(job)"
            role="button"
            [attr.aria-label]="'Inspect ' + job.title + ' at ' + job.company"
          >
            <!-- Header Line -->
            <div class="card-head">
              <div class="company-brand-meta">
                <span class="company-avatar">{{ job.company.charAt(0) }}</span>
                <div class="company-name-wrap">
                  <span class="company-title">{{ job.company }}</span>
                  <span class="loc-subtext">
                    <app-icon name="map-pin" [size]="10"></app-icon>
                    {{ job.raw_location || 'Remote Worldwide' }}
                  </span>
                </div>
              </div>

              <span class="match-score-badge" [class.high-match]="job.match_score >= 70">
                {{ roundScore(job.match_score) }}%
              </span>
            </div>

            <!-- Role Title -->
            <h3 class="card-job-title">{{ job.title }}</h3>

            <!-- Tags Line -->
            <div class="card-tags-line">
              <span class="badge badge-purple" *ngIf="job.job_track === 'WEB_ANGULAR'">🌐 Web & Angular</span>
              <span class="badge badge-amber" *ngIf="job.job_track === 'NO_EXP_REMOTE'">💼 No-Exp Remote</span>
              <span class="badge badge-cyan" *ngIf="job.job_track === 'SOFTWARE_INTERN'">🎓 Software Intern</span>
              <span
                class="badge"
                [class.badge-green]="job.eligibility === 'EGYPT_ELIGIBLE' || job.eligibility === 'REMOTE_WORLDWIDE'"
                [class.badge-blue]="job.eligibility === 'REMOTE_REGION_POSSIBLE'"
              >
                {{ formatEligibility(job.eligibility) }}
              </span>
              <span class="badge" *ngIf="formatWorkplace(job.workplace_type)">{{ formatWorkplace(job.workplace_type) }}</span>
              <span class="badge" *ngIf="formatSeniority(job.seniority)">{{ formatSeniority(job.seniority) }}</span>
            </div>

            <!-- Footer Line -->
            <div class="card-footer-line" (click)="$event.stopPropagation()">
              <button
                (click)="toggleSaveJob(job)"
                class="save-btn"
                [class.active-saved]="job.tracker_status === 'SAVED'"
                title="Save role"
              >
                <app-icon [name]="job.tracker_status === 'SAVED' ? 'check' : 'bookmark'" [size]="13"></app-icon>
                <span>{{ job.tracker_status === 'SAVED' ? 'Saved' : 'Save' }}</span>
              </button>

              <div class="footer-actions">
                <button (click)="inspectJob(job)" class="btn btn-secondary btn-sm inspect-btn">
                  <app-icon name="eye" [size]="12"></app-icon>
                  <span>Inspect</span>
                </button>
                <a
                  [href]="job.original_application_url"
                  target="_blank"
                  rel="noopener noreferrer"
                  (click)="onOpenLink($event, job.original_application_url)"
                  class="btn btn-primary btn-sm apply-btn"
                >
                  <span>Apply</span>
                  <app-icon name="external-link" [size]="11"></app-icon>
                </a>
              </div>
            </div>
          </article>
        </div>

        <!-- LIST / TABLE VIEW: Linear-Style High Density -->
        <div class="jobs-table-container" *ngIf="!isLoading() && jobs().length > 0 && viewMode() === 'list'">
          <table class="dense-table" aria-label="Jobs table">
            <thead>
              <tr>
                <th scope="col">Role & Company</th>
                <th scope="col">Match</th>
                <th scope="col">Eligibility</th>
                <th scope="col">Workplace</th>
                <th scope="col">Seniority</th>
                <th scope="col" class="th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr
                *ngFor="let job of jobs()"
                class="dense-table-row"
                (click)="inspectJob(job)"
                tabindex="0"
                (keyup.enter)="inspectJob(job)"
              >
                <td class="td-role-info">
                  <div class="role-brand-box">
                    <span class="company-avatar">{{ job.company.charAt(0) }}</span>
                    <div class="role-desc-wrap">
                      <span class="table-role-title">{{ job.title }}</span>
                      <span class="table-company-sub">
                        {{ job.company }} ·
                        <span class="badge badge-purple" *ngIf="job.job_track === 'WEB_ANGULAR'">🌐 Web & Angular</span>
                        <span class="badge badge-amber" *ngIf="job.job_track === 'NO_EXP_REMOTE'">💼 No-Exp Remote</span>
                        <span class="badge badge-cyan" *ngIf="job.job_track === 'SOFTWARE_INTERN'">🎓 Software Intern</span>
                        <span *ngIf="job.job_track">·</span>
                        <app-icon name="map-pin" [size]="10"></app-icon>
                        {{ job.raw_location || 'Remote' }}
                      </span>
                    </div>
                  </div>
                </td>

                <td>
                  <span class="match-score-badge" [class.high-match]="job.match_score >= 70">
                    {{ roundScore(job.match_score) }}%
                  </span>
                </td>

                <td>
                  <span
                    class="badge"
                    [class.badge-green]="job.eligibility === 'EGYPT_ELIGIBLE' || job.eligibility === 'REMOTE_WORLDWIDE'"
                    [class.badge-blue]="job.eligibility === 'REMOTE_REGION_POSSIBLE'"
                  >
                    {{ formatEligibility(job.eligibility) }}
                  </span>
                </td>

                <td>
                  <span class="meta-text-table">{{ formatWorkplace(job.workplace_type) }}</span>
                </td>

                <td>
                  <span class="meta-text-table">{{ formatSeniority(job.seniority) }}</span>
                </td>

                <td class="td-actions" (click)="$event.stopPropagation()">
                  <button
                    (click)="toggleSaveJob(job)"
                    class="icon-action-btn"
                    [class.saved-icon]="job.tracker_status === 'SAVED'"
                    title="Bookmark"
                    aria-label="Save"
                  >
                    <app-icon [name]="job.tracker_status === 'SAVED' ? 'check' : 'bookmark'" [size]="12"></app-icon>
                  </button>
                  <button (click)="inspectJob(job)" class="btn btn-secondary btn-sm">
                    <app-icon name="eye" [size]="12"></app-icon>
                  </button>
                  <a
                    [href]="job.original_application_url"
                    target="_blank"
                    rel="noopener noreferrer"
                    (click)="onOpenLink($event, job.original_application_url)"
                    class="btn btn-primary btn-sm"
                  >
                    <app-icon name="external-link" [size]="11"></app-icon>
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination Controls -->
        <footer class="pagination-strip" *ngIf="totalPages() > 1 && !isLoading()">
          <button
            [disabled]="currentPage() === 1"
            (click)="goToPage(currentPage() - 1)"
            class="btn btn-secondary btn-sm"
            aria-label="Previous page"
          >
            <app-icon name="chevron-left" [size]="12"></app-icon>
            <span>Previous</span>
          </button>

          <span class="page-indicator">
            Page <strong>{{ currentPage() }}</strong> of <strong>{{ totalPages() }}</strong>
          </span>

          <button
            [disabled]="currentPage() === totalPages()"
            (click)="goToPage(currentPage() + 1)"
            class="btn btn-secondary btn-sm"
            aria-label="Next page"
          >
            <span>Next</span>
            <app-icon name="chevron-right" [size]="12"></app-icon>
          </button>
        </footer>
      </section>

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
    .jobs-view {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      width: 100%;
    }

    /* Segmented Track Navigation Hub */
    .track-segmented-bar {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: var(--space-2);
      width: 100%;
    }

    .track-segment-btn {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border-radius: var(--radius-md);
      background: var(--color-bg-surface-glass);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid var(--color-border-subtle);
      color: var(--color-text-secondary);
      cursor: pointer;
      text-align: left;
      transition: all var(--motion-fast);
      position: relative;
      user-select: none;
    }

    .track-segment-btn:hover {
      border-color: var(--color-border-hover);
      color: var(--color-text-primary);
      background: var(--color-bg-surface-hover);
    }

    .track-segment-btn:active {
      transform: scale(0.985);
    }

    .track-segment-btn.active {
      background: var(--color-bg-surface);
      border-color: var(--color-brand-primary);
      color: var(--color-text-primary);
      box-shadow: 0 0 0 1px var(--color-brand-border), var(--shadow-xs);
    }

    .track-segment-btn.track-web.active {
      border-color: #60a5fa;
      box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.4), var(--shadow-xs);
    }

    .track-segment-btn.track-remote.active {
      border-color: #34d399;
      box-shadow: 0 0 0 1px rgba(52, 211, 153, 0.4), var(--shadow-xs);
    }

    .track-segment-btn.track-intern.active {
      border-color: #c084fc;
      box-shadow: 0 0 0 1px rgba(192, 132, 252, 0.4), var(--shadow-xs);
    }

    .segment-icon {
      font-size: 18px;
      line-height: 1;
      flex-shrink: 0;
    }

    .segment-meta {
      display: flex;
      flex-direction: column;
      gap: 1px;
      min-width: 0;
    }

    .segment-title {
      font-size: 12.5px;
      font-weight: 700;
      color: var(--color-text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .segment-sub {
      font-size: 10px;
      color: var(--color-text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Filters Workbench */
    .filters-workbench {
      background: var(--color-bg-surface-glass);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md);
      padding: var(--space-3);
      display: flex;
      flex-direction: column;
      gap: var(--space-2-5);
    }

    /* Top Search Row */
    .search-command-row {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      width: 100%;
    }
    .search-input-wrap {
      position: relative;
      flex: 1;
      display: flex;
      align-items: center;
    }
    .search-icon {
      position: absolute;
      left: 10px;
      color: var(--color-text-muted);
      pointer-events: none;
    }
    .search-input {
      padding-left: 36px;
      padding-right: 32px;
      height: 40px;
      min-height: 40px;
      font-size: var(--text-sm);
      border-radius: var(--radius-md);
    }
    .clear-search-btn {
      position: absolute;
      right: 10px;
      background: transparent;
      border: none;
      color: var(--color-text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      padding: 4px;
    }
    .clear-search-btn:hover { color: var(--color-text-primary); }

    .search-actions-group {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-shrink: 0;
    }
    .search-btn {
      height: 40px;
      min-height: 40px;
      padding: 0 16px;
      font-size: var(--text-sm);
    }

    /* View Switcher */
    .view-switcher {
      display: flex;
      align-items: center;
      background: var(--color-bg-surface-elevated);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md);
      padding: 2px;
      gap: 2px;
    }
    .view-btn {
      background: transparent;
      border: none;
      width: 36px;
      height: 36px;
      min-height: 36px;
      padding: 0;
      border-radius: var(--radius-sm);
      color: var(--color-text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color var(--motion-fast), color var(--motion-fast);
    }
    .view-btn:hover { color: var(--color-text-primary); }
    .view-btn.active {
      background: var(--color-bg-surface);
      color: var(--color-brand-accent);
      box-shadow: var(--shadow-xs);
    }

    /* Bottom Filter Row */
    .filter-controls-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      flex-wrap: wrap;
    }
    .quick-chips-group {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .chip-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 34px;
      padding: 6px 13px;
      border-radius: var(--radius-sm);
      font-size: 12px;
      font-weight: 600;
      background: var(--color-bg-surface-elevated);
      border: 1px solid var(--color-border-subtle);
      color: var(--color-text-secondary);
      cursor: pointer;
      transition: background-color var(--motion-fast), border-color var(--motion-fast), color var(--motion-fast);
    }
    .chip-pill:hover {
      border-color: var(--color-border-hover);
      color: var(--color-text-primary);
    }
    .chip-pill.active {
      background: var(--color-brand-primary);
      color: #ffffff;
      border-color: var(--color-brand-primary);
    }

    .dropdowns-group {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .select-compact {
      width: auto;
      min-width: 120px;
      height: 34px;
      min-height: 34px;
      padding: 6px 26px 6px 10px;
      font-size: 12px;
      border-radius: var(--radius-sm);
    }

    /* Results Meta Strip */
    .results-meta-strip {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 4px;
    }
    .count-indicator {
      font-size: 11px;
      color: var(--color-text-secondary);
    }
    .count-indicator strong {
      color: var(--color-text-primary);
    }
    .reset-btn {
      font-size: 11px;
      padding: 2px 6px;
    }

    /* Skeletons */
    .skeleton-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: var(--space-3);
    }
    .skeleton-box {
      background: var(--color-bg-surface-glass);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md);
      padding: var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-2-5);
    }
    .skeleton-line-top {
      width: 40%;
      height: 12px;
      background: var(--color-bg-surface-elevated);
      border-radius: var(--radius-xs);
    }
    .skeleton-line-middle {
      width: 80%;
      height: 14px;
      background: var(--color-bg-surface-elevated);
      border-radius: var(--radius-xs);
    }
    .skeleton-line-bottom {
      width: 60%;
      height: 10px;
      background: var(--color-bg-surface-elevated);
      border-radius: var(--radius-xs);
    }

    /* Empty State */
    .empty-state-box {
      background: var(--color-bg-surface-glass);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md);
      padding: var(--space-8) var(--space-4);
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2);
    }
    .empty-icon {
      color: var(--color-text-muted);
      opacity: 0.5;
    }

    /* Grid Layout */
    .jobs-grid-layout {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: var(--space-3);
    }

    .job-grid-card {
      background: var(--color-bg-surface-glass);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md);
      padding: var(--space-3-5);
      display: flex;
      flex-direction: column;
      gap: var(--space-2-5);
      cursor: pointer;
      /* Silky non-jumpy hover */
      transition: background-color var(--motion-fast), border-color var(--motion-fast);
    }
    .job-grid-card:hover {
      background-color: var(--color-bg-surface-hover);
      border-color: var(--color-border-hover);
    }
    .job-grid-card.card-excellent {
      border-color: rgba(16, 185, 129, 0.25);
    }

    .card-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-2);
    }
    .company-brand-meta {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-width: 0;
      flex: 1;
    }
    .company-name-wrap {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .company-title {
      font-size: 11px;
      font-weight: 700;
      color: var(--color-text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .loc-subtext {
      font-size: 10px;
      color: var(--color-text-muted);
      display: inline-flex;
      align-items: center;
      gap: 3px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .match-score-badge {
      font-size: 11px;
      font-family: var(--font-mono);
      font-weight: 700;
      padding: 2px 6px;
      border-radius: var(--radius-xs);
      background: var(--color-brand-subtle);
      color: var(--color-brand-accent);
      border: 1px solid var(--color-brand-border);
      flex-shrink: 0;
    }
    .match-score-badge.high-match {
      background: var(--color-success-bg);
      color: var(--color-success-text);
      border-color: var(--color-success-border);
    }

    .card-job-title {
      font-size: var(--text-sm);
      font-weight: 700;
      color: var(--color-text-primary);
      margin: 0;
      line-height: 1.35;
    }

    .card-tags-line {
      display: flex;
      gap: 5px;
      flex-wrap: wrap;
    }

    .card-footer-line {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: var(--space-2);
      border-top: 1px solid var(--color-border-subtle);
      margin-top: 2px;
    }
    .save-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      min-height: 32px;
      padding: 5px 12px;
      font-size: 12px;
      font-weight: 600;
      border-radius: var(--radius-sm);
      background: transparent;
      border: 1px solid var(--color-border-subtle);
      color: var(--color-text-muted);
      cursor: pointer;
      transition: background-color var(--motion-fast), color var(--motion-fast);
    }
    .save-btn:hover {
      color: var(--color-text-primary);
      background: var(--color-bg-surface-elevated);
    }
    .save-btn.active-saved {
      background: var(--color-success-bg);
      color: var(--color-success-text);
      border-color: var(--color-success-border);
    }

    .footer-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* Dense Linear-Style Table */
    .jobs-table-container {
      background: var(--color-bg-surface-glass);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md);
      overflow-x: auto;
    }
    .dense-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }
    .dense-table th {
      padding: 8px 12px;
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 700;
      color: var(--color-text-muted);
      letter-spacing: 0.05em;
      border-bottom: 1px solid var(--color-border-subtle);
      background: var(--color-bg-surface-elevated);
    }
    .dense-table td {
      padding: 8px 12px;
      border-bottom: 1px solid var(--color-border-subtle);
      vertical-align: middle;
      font-size: 11px;
    }
    .dense-table-row {
      cursor: pointer;
      transition: background-color var(--motion-fast);
    }
    .dense-table-row:hover {
      background-color: var(--color-bg-surface-hover);
    }

    .role-brand-box {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .role-desc-wrap {
      display: flex;
      flex-direction: column;
    }
    .table-role-title {
      font-weight: 700;
      color: var(--color-text-primary);
      font-size: var(--text-xs);
    }
    .table-company-sub {
      color: var(--color-text-muted);
      font-size: 10px;
      display: inline-flex;
      align-items: center;
      gap: 3px;
    }
    .meta-text-table {
      color: var(--color-text-secondary);
      font-weight: 500;
    }
    .td-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      justify-content: flex-end;
    }
    .th-actions {
      text-align: right;
    }
    .icon-action-btn {
      padding: 4px;
      border-radius: var(--radius-xs);
      background: transparent;
      border: 1px solid var(--color-border-subtle);
      color: var(--color-text-muted);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .icon-action-btn:hover { color: var(--color-text-primary); }
    .icon-action-btn.saved-icon {
      background: var(--color-success-bg);
      color: var(--color-success-text);
      border-color: var(--color-success-border);
    }

    /* Pagination */
    .pagination-strip {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-3);
      padding: var(--space-2) 0;
    }
    .page-indicator {
      font-size: 11px;
      color: var(--color-text-secondary);
    }

    @media (max-width: 768px) {
      .track-segmented-bar {
        display: flex;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        padding-bottom: 2px;
        gap: 6px;
      }
      .track-segmented-bar::-webkit-scrollbar {
        display: none;
      }
      .track-segment-btn {
        flex: 0 0 auto;
        min-width: 140px;
        padding: 8px 10px;
      }
      .search-command-row {
        flex-direction: column;
        align-items: stretch;
      }
      .filter-controls-row {
        flex-direction: column;
        align-items: stretch;
      }
      .dropdowns-group {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        width: 100%;
      }
      .select-compact {
        width: 100%;
      }
      .jobs-grid-layout {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 480px) {
      .track-segment-btn {
        min-width: 130px;
        padding: 6px 8px;
        gap: 6px;
      }
      .segment-icon {
        font-size: 15px;
      }
      .segment-title {
        font-size: 11.5px;
      }
      .segment-sub {
        font-size: 9px;
      }
      .dropdowns-group {
        grid-template-columns: 1fr;
      }
      .search-actions-group {
        width: 100%;
        justify-content: space-between;
      }
      .search-btn {
        flex: 1;
      }
    }
  `],
})
export class JobsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly telegram = inject(TelegramService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);

  readonly jobs = signal<JobSummary[]>([]);
  readonly totalCount = signal<number>(0);
  readonly isLoading = signal<boolean>(false);
  readonly currentPage = signal<number>(1);
  readonly totalPages = signal<number>(1);
  readonly limit = 18;

  readonly viewMode = signal<'grid' | 'list'>('grid');

  searchKeyword: string = '';
  selectedTrack: string = '';
  selectedEligibility: string = '';
  selectedWorkplace: string = '';
  selectedSeniority: string = '';
  minScore: number = 0;

  readonly activeQuickChip = signal<string>('ALL');

  // Drawer state
  readonly isDrawerOpen = signal<boolean>(false);
  readonly selectedJob = signal<JobSummary | null>(null);

  readonly quickChips: QuickChip[] = [
    { id: 'ALL', label: 'All Tracks', icon: 'layers' },
    { id: 'TRACK_WEB', label: '🌐 Web & Angular', icon: 'zap', track: 'WEB_ANGULAR' },
    { id: 'TRACK_REMOTE', label: '💼 No-Exp Remote', icon: 'globe', track: 'NO_EXP_REMOTE' },
    { id: 'TRACK_INTERN', label: '🎓 Software Interns', icon: 'star', track: 'SOFTWARE_INTERN' },
    { id: 'TOP_MATCH', label: 'Top Match (70%+)', icon: 'star', minScore: 70 },
  ];

  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      if (params['track']) {
        this.selectedTrack = params['track'];
        if (params['track'] === 'WEB_ANGULAR') this.activeQuickChip.set('TRACK_WEB');
        else if (params['track'] === 'NO_EXP_REMOTE') this.activeQuickChip.set('TRACK_REMOTE');
        else if (params['track'] === 'SOFTWARE_INTERN') this.activeQuickChip.set('TRACK_INTERN');
      }
      this.loadJobs();
    });
  }

  setTrackFilter(track: string): void {
    this.telegram.haptic('selection');
    this.selectedTrack = track;
    if (track === 'WEB_ANGULAR') this.activeQuickChip.set('TRACK_WEB');
    else if (track === 'NO_EXP_REMOTE') this.activeQuickChip.set('TRACK_REMOTE');
    else if (track === 'SOFTWARE_INTERN') this.activeQuickChip.set('TRACK_INTERN');
    else this.activeQuickChip.set('ALL');
    this.currentPage.set(1);
    this.loadJobs();
  }

  loadJobs(): void {
    this.isLoading.set(true);
    const params: Record<string, string | number> = {
      page: this.currentPage(),
      limit: this.limit,
    };

    if (this.selectedTrack) {
      params['track'] = this.selectedTrack;
    }
    if (this.searchKeyword.trim()) {
      params['search'] = this.searchKeyword.trim();
    }
    if (this.selectedEligibility) {
      params['eligibility'] = this.selectedEligibility;
    }
    if (this.selectedWorkplace) {
      params['workplace_type'] = this.selectedWorkplace;
    }
    if (this.selectedSeniority) {
      params['seniority'] = this.selectedSeniority;
    }
    if (this.minScore > 0) {
      params['min_score'] = this.minScore;
    }

    this.api.getJobs(params).subscribe({
      next: (res) => {
        this.jobs.set(res.items);
        this.totalCount.set(res.total);
        this.totalPages.set(Math.ceil(res.total / this.limit) || 1);
        this.isLoading.set(false);
      },
      error: (e) => {
        console.error('Failed to load jobs', e);
        this.isLoading.set(false);
      },
    });
  }

  applyFilters(): void {
    this.currentPage.set(1);
    this.loadJobs();
  }

  clearSearch(): void {
    this.searchKeyword = '';
    this.applyFilters();
  }

  selectQuickChip(chipId: string): void {
    this.activeQuickChip.set(chipId);
    this.telegram.haptic('selection');

    if (chipId === 'ALL') {
      this.selectedTrack = '';
      this.selectedEligibility = '';
      this.selectedWorkplace = '';
      this.selectedSeniority = '';
      this.minScore = 0;
    } else if (chipId === 'TRACK_WEB') {
      this.selectedTrack = 'WEB_ANGULAR';
    } else if (chipId === 'TRACK_REMOTE') {
      this.selectedTrack = 'NO_EXP_REMOTE';
    } else if (chipId === 'TRACK_INTERN') {
      this.selectedTrack = 'SOFTWARE_INTERN';
    } else if (chipId === 'TOP_MATCH') {
      this.minScore = 70;
    } else if (chipId === 'EGYPT_WORLDWIDE') {
      this.selectedEligibility = 'EGYPT_ELIGIBLE';
    } else if (chipId === 'REMOTE') {
      this.selectedWorkplace = 'REMOTE';
    } else if (chipId === 'MID_SENIOR') {
      this.selectedSeniority = 'MID';
    }

    this.applyFilters();
  }

  setViewMode(mode: 'grid' | 'list'): void {
    this.viewMode.set(mode);
    this.telegram.haptic('selection');
  }

  hasActiveFilters(): boolean {
    return (
      !!this.searchKeyword ||
      !!this.selectedTrack ||
      !!this.selectedEligibility ||
      !!this.selectedWorkplace ||
      !!this.selectedSeniority ||
      this.minScore > 0
    );
  }

  resetFilters(): void {
    this.searchKeyword = '';
    this.selectedTrack = '';
    this.selectedEligibility = '';
    this.selectedWorkplace = '';
    this.selectedSeniority = '';
    this.minScore = 0;
    this.activeQuickChip.set('ALL');
    this.currentPage.set(1);
    this.loadJobs();
    this.toast.show('Filters reset', 'info', 1500);
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
      this.loadJobs();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  inspectJob(job: JobSummary): void {
    this.telegram.haptic('selection');
    this.selectedJob.set(job);
    this.isDrawerOpen.set(true);
  }

  closeDrawer(): void {
    this.isDrawerOpen.set(false);
  }

  toggleSaveJob(job: JobSummary): void {
    const newStatus: ApplicationStatus = job.tracker_status === 'SAVED' ? 'DISCOVERED' : 'SAVED';
    this.telegram.haptic('medium');

    this.api.updateJobStatus(job.id, newStatus).subscribe({
      next: () => {
        job.tracker_status = newStatus;
        this.toast.show(
          newStatus === 'SAVED' ? `Saved: ${job.title}` : `Removed from Saved`,
          newStatus === 'SAVED' ? 'success' : 'info'
        );
      },
      error: () => this.toast.show('Failed to save status', 'error'),
    });
  }

  onJobStatusUpdated(event: { jobId: number; status: ApplicationStatus }): void {
    const job = this.jobs().find((j) => j.id === event.jobId);
    if (job) {
      job.tracker_status = event.status;
    }
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
}
