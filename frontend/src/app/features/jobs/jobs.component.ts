import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
  eligibility?: string;
  minScore?: number;
}

@Component({
  selector: 'app-jobs',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, JobDrawerComponent],
  template: `
    <div class="jobs-view">
      <!-- Search & Filters Command Center -->
      <section class="panel filters-panel" aria-label="Search and filter jobs">
        <!-- Main Search Bar -->
        <div class="search-bar">
          <div class="search-input-wrap">
            <app-icon name="search" [size]="16" class="search-icon"></app-icon>
            <input
              type="search"
              [(ngModel)]="searchKeyword"
              (keyup.enter)="applyFilters()"
              placeholder="Search roles, tech stack (Angular, TypeScript, Node, RxJS)..."
              class="form-input search-input"
              aria-label="Search keywords"
            />
            <button
              *ngIf="searchKeyword"
              (click)="clearSearch()"
              class="clear-search-btn"
              aria-label="Clear search"
            >
              <app-icon name="x" [size]="14"></app-icon>
            </button>
          </div>

          <button (click)="applyFilters()" class="btn btn-primary search-btn">
            <app-icon name="search" [size]="14"></app-icon>
            <span>Search</span>
          </button>
        </div>

        <!-- Quick Filter Preset Chips + View Mode Toggle -->
        <div class="toolbar-middle-row">
          <div class="quick-chips-row" role="group" aria-label="Quick preset filters">
            <button
              *ngFor="let chip of quickChips"
              (click)="selectQuickChip(chip.id)"
              [class.active]="activeQuickChip() === chip.id"
              class="quick-chip-btn"
            >
              <app-icon [name]="chip.icon" [size]="12"></app-icon>
              <span>{{ chip.label }}</span>
            </button>
          </div>

          <!-- View Mode Toggle (Grid vs Dense Table) -->
          <div class="view-mode-toggle" role="group" aria-label="View layout switcher">
            <button
              (click)="setViewMode('grid')"
              [class.active]="viewMode() === 'grid'"
              class="toggle-mode-btn"
              title="Grid layout"
              aria-label="Grid layout"
            >
              <app-icon name="grid" [size]="14"></app-icon>
            </button>
            <button
              (click)="setViewMode('list')"
              [class.active]="viewMode() === 'list'"
              class="toggle-mode-btn"
              title="Compact list layout"
              aria-label="Compact list layout"
            >
              <app-icon name="list" [size]="14"></app-icon>
            </button>
          </div>
        </div>

        <!-- Advanced Filter Dropdowns -->
        <div class="filters-grid" role="group" aria-label="Filter options">
          <div class="filter-col">
            <label class="filter-micro-label">Eligibility</label>
            <select [(ngModel)]="selectedEligibility" (change)="applyFilters()" class="form-select" aria-label="Eligibility filter">
              <option value="">All Geographies</option>
              <option value="EGYPT_ELIGIBLE">Egypt Eligible</option>
              <option value="REMOTE_WORLDWIDE">Remote Worldwide</option>
              <option value="REMOTE_REGION_POSSIBLE">Region Possible</option>
              <option value="RELOCATION_REQUIRED">Relocation Required</option>
            </select>
          </div>

          <div class="filter-col">
            <label class="filter-micro-label">Workplace</label>
            <select [(ngModel)]="selectedWorkplace" (change)="applyFilters()" class="form-select" aria-label="Workplace filter">
              <option value="">All Work Modes</option>
              <option value="REMOTE">Remote</option>
              <option value="HYBRID">Hybrid</option>
              <option value="ON_SITE">On-site</option>
            </select>
          </div>

          <div class="filter-col">
            <label class="filter-micro-label">Seniority</label>
            <select [(ngModel)]="selectedSeniority" (change)="applyFilters()" class="form-select" aria-label="Seniority filter">
              <option value="">All Seniorities</option>
              <option value="GRADUATE">Graduate / Entry</option>
              <option value="JUNIOR">Junior</option>
              <option value="MID">Mid-level</option>
              <option value="SENIOR">Senior</option>
            </select>
          </div>

          <div class="filter-col">
            <label class="filter-micro-label">Score Threshold</label>
            <select [(ngModel)]="minScore" (change)="applyFilters()" class="form-select" aria-label="Minimum score threshold">
              <option [ngValue]="0">Min Score: Any</option>
              <option [ngValue]="60">Min Score: 60%+</option>
              <option [ngValue]="70">Min Score: 70%+ (Strong)</option>
              <option [ngValue]="80">Min Score: 80%+ (Top Match)</option>
            </select>
          </div>
        </div>
      </section>

      <!-- Active Results Stats Bar -->
      <div class="results-stats-bar">
        <span class="results-count">
          Showing <strong>{{ jobs().length }}</strong> of <strong>{{ totalCount() }}</strong> verified opportunities
        </span>
        <button *ngIf="hasActiveFilters()" (click)="resetFilters()" class="btn btn-ghost btn-sm clear-all-btn">
          <app-icon name="x" [size]="12"></app-icon>
          <span>Reset All Filters</span>
        </button>
      </div>

      <!-- Jobs Display Container -->
      <section class="jobs-display-section" aria-label="Job listings">
        <!-- Skeleton Shimmer Loader (No layout jump) -->
        <div *ngIf="isLoading()" class="skeleton-grid">
          <div *ngFor="let i of [1, 2, 3, 4, 5, 6]" class="skeleton-card">
            <div class="skeleton-header">
              <div class="skeleton skeleton-avatar"></div>
              <div class="skeleton-col">
                <div class="skeleton skeleton-line-sm"></div>
                <div class="skeleton skeleton-line-xs"></div>
              </div>
            </div>
            <div class="skeleton skeleton-title"></div>
            <div class="skeleton-badges">
              <div class="skeleton skeleton-badge"></div>
              <div class="skeleton skeleton-badge"></div>
              <div class="skeleton skeleton-badge"></div>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div *ngIf="!isLoading() && jobs().length === 0" class="empty-state card">
          <app-icon name="search" [size]="36" class="empty-icon"></app-icon>
          <h3>No matching opportunities found</h3>
          <p>Try broadening your search keywords or switching preset filters to discover more roles.</p>
          <button (click)="resetFilters()" class="btn btn-secondary btn-sm">
            <span>Reset All Filters</span>
          </button>
        </div>

        <!-- VIEW MODE 1: GRID VIEW -->
        <div class="jobs-grid" *ngIf="!isLoading() && jobs().length > 0 && viewMode() === 'grid'">
          <article
            *ngFor="let job of jobs()"
            class="job-card"
            [class.excellent]="job.match_score >= 80"
            (click)="inspectJob(job)"
            tabindex="0"
            (keyup.enter)="inspectJob(job)"
            role="button"
            [attr.aria-label]="'Inspect ' + job.title + ' at ' + job.company"
          >
            <!-- Card Header -->
            <div class="job-card-header">
              <div class="company-loc-row">
                <span class="company-avatar">{{ job.company.charAt(0) }}</span>
                <div class="company-info-block">
                  <span class="company-name-text">{{ job.company }}</span>
                  <span class="location-chip">
                    <app-icon name="map-pin" [size]="11"></app-icon>
                    {{ job.raw_location || 'Remote Worldwide' }}
                  </span>
                </div>
              </div>

              <div class="score-pill" [class.score-top]="job.match_score >= 70">
                <app-icon name="sparkles" [size]="11"></app-icon>
                <span>{{ roundScore(job.match_score) }}% match</span>
              </div>
            </div>

            <!-- Job Title -->
            <h3 class="job-title">{{ job.title }}</h3>

            <!-- Tags -->
            <div class="badges-row">
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

            <!-- Card Footer Actions -->
            <div class="job-card-footer" (click)="$event.stopPropagation()">
              <button
                (click)="toggleSaveJob(job)"
                class="btn-card-save"
                [class.saved]="job.tracker_status === 'SAVED'"
                [title]="job.tracker_status === 'SAVED' ? 'Remove from Saved' : 'Save Role'"
                aria-label="Save role"
              >
                <app-icon [name]="job.tracker_status === 'SAVED' ? 'check' : 'bookmark'" [size]="14"></app-icon>
                <span>{{ job.tracker_status === 'SAVED' ? 'Saved' : 'Save' }}</span>
              </button>

              <div class="footer-right-buttons">
                <button (click)="inspectJob(job)" class="btn btn-secondary btn-sm inspect-btn">
                  <app-icon name="eye" [size]="13"></app-icon>
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
                  <app-icon name="external-link" [size]="12"></app-icon>
                </a>
              </div>
            </div>
          </article>
        </div>

        <!-- VIEW MODE 2: DENSE TABLE / LIST VIEW -->
        <div class="jobs-table-card card" *ngIf="!isLoading() && jobs().length > 0 && viewMode() === 'list'">
          <div class="table-scroll">
            <table class="jobs-table" aria-label="Job listings table">
              <thead>
                <tr>
                  <th scope="col">Company & Role</th>
                  <th scope="col">Match Fit</th>
                  <th scope="col">Eligibility</th>
                  <th scope="col">Workplace</th>
                  <th scope="col">Seniority</th>
                  <th scope="col" class="th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  *ngFor="let job of jobs()"
                  class="table-row-item"
                  (click)="inspectJob(job)"
                  tabindex="0"
                  (keyup.enter)="inspectJob(job)"
                >
                  <td class="td-role">
                    <div class="role-cell-wrap">
                      <span class="company-avatar">{{ job.company.charAt(0) }}</span>
                      <div class="role-texts">
                        <span class="table-job-title">{{ job.title }}</span>
                        <span class="table-company-sub">
                          {{ job.company }} ·
                          <app-icon name="map-pin" [size]="10"></app-icon>
                          {{ job.raw_location || 'Remote' }}
                        </span>
                      </div>
                    </div>
                  </td>

                  <td class="td-fit">
                    <div class="score-pill" [class.score-top]="job.match_score >= 70">
                      <span>{{ roundScore(job.match_score) }}%</span>
                    </div>
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
                    <span class="text-sm-table">{{ formatWorkplace(job.workplace_type) }}</span>
                  </td>

                  <td>
                    <span class="text-sm-table">{{ formatSeniority(job.seniority) }}</span>
                  </td>

                  <td class="td-actions" (click)="$event.stopPropagation()">
                    <button
                      (click)="toggleSaveJob(job)"
                      class="btn-icon-cell"
                      [class.saved]="job.tracker_status === 'SAVED'"
                      title="Bookmark"
                      aria-label="Save"
                    >
                      <app-icon [name]="job.tracker_status === 'SAVED' ? 'check' : 'bookmark'" [size]="13"></app-icon>
                    </button>
                    <button (click)="inspectJob(job)" class="btn btn-secondary btn-sm" title="Inspect details">
                      <app-icon name="eye" [size]="12"></app-icon>
                    </button>
                    <a
                      [href]="job.original_application_url"
                      target="_blank"
                      rel="noopener noreferrer"
                      (click)="onOpenLink($event, job.original_application_url)"
                      class="btn btn-primary btn-sm"
                      title="Apply on company site"
                    >
                      <app-icon name="external-link" [size]="12"></app-icon>
                    </a>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Pagination Controls -->
        <footer class="pagination-bar" *ngIf="totalPages() > 1 && !isLoading()">
          <button
            [disabled]="currentPage() === 1"
            (click)="goToPage(currentPage() - 1)"
            class="btn btn-secondary btn-sm"
            aria-label="Previous page"
          >
            <app-icon name="chevron-left" [size]="14"></app-icon>
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
            <app-icon name="chevron-right" [size]="14"></app-icon>
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
      gap: var(--space-4);
      width: 100%;
    }

    /* Filters Command Center Panel */
    .filters-panel {
      display: flex;
      flex-direction: column;
      gap: var(--space-3-5);
      padding: var(--space-5);
    }

    /* Main Search Bar */
    .search-bar {
      display: flex;
      gap: var(--space-2-5);
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
      left: 12px;
      color: var(--color-text-muted);
      pointer-events: none;
    }
    .search-input {
      padding-left: 38px;
      padding-right: 36px;
      height: 42px;
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
      justify-content: center;
      padding: 4px;
    }
    .clear-search-btn:hover {
      color: var(--color-text-primary);
    }
    .search-btn {
      height: 42px;
      padding: 0 20px;
      flex-shrink: 0;
    }

    /* Toolbar Middle Row: Quick Chips & View Mode Toggle */
    .toolbar-middle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      flex-wrap: wrap;
    }
    .quick-chips-row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1-5);
    }
    .quick-chip-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      border-radius: var(--radius-pill);
      font-size: var(--text-xs);
      font-weight: 600;
      background: var(--color-bg-surface-elevated-glass);
      border: 1px solid var(--color-border-subtle);
      color: var(--color-text-secondary);
      cursor: pointer;
      transition: all var(--motion-fast);
    }
    .quick-chip-btn:hover {
      border-color: var(--color-border-hover);
      color: var(--color-text-primary);
    }
    .quick-chip-btn.active {
      background: var(--color-brand-primary);
      color: #ffffff;
      border-color: var(--color-brand-primary);
      box-shadow: 0 1px 4px rgba(37, 99, 235, 0.4);
    }

    /* View Mode Switcher */
    .view-mode-toggle {
      display: flex;
      align-items: center;
      background: var(--color-bg-surface-elevated);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md);
      padding: 2px;
      gap: 2px;
    }
    .toggle-mode-btn {
      background: transparent;
      border: none;
      padding: 5px 8px;
      border-radius: var(--radius-sm);
      color: var(--color-text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all var(--motion-fast);
    }
    .toggle-mode-btn:hover {
      color: var(--color-text-primary);
    }
    .toggle-mode-btn.active {
      background: var(--color-bg-surface);
      color: var(--color-brand-accent);
      box-shadow: var(--shadow-xs);
    }

    /* Advanced Filters Grid */
    .filters-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: var(--space-3);
    }
    .filter-col {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .filter-micro-label {
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 700;
      color: var(--color-text-muted);
      letter-spacing: 0.04em;
    }

    /* Results Stats Bar */
    .results-stats-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 var(--space-1);
    }
    .results-count {
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
    }
    .results-count strong {
      color: var(--color-text-primary);
    }
    .clear-all-btn {
      font-size: var(--text-xs);
      color: var(--color-brand-accent);
      padding: 3px 8px;
    }

    /* Skeleton Loading Grid */
    .skeleton-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: var(--space-3-5);
    }
    .skeleton-card {
      background: var(--color-bg-surface-glass);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .skeleton-header {
      display: flex;
      gap: var(--space-3);
      align-items: center;
    }
    .skeleton-avatar {
      width: 32px;
      height: 32px;
      border-radius: var(--radius-sm);
    }
    .skeleton-col {
      display: flex;
      flex-direction: column;
      gap: 5px;
      flex: 1;
    }
    .skeleton-line-sm {
      width: 50%;
      height: 12px;
    }
    .skeleton-line-xs {
      width: 30%;
      height: 10px;
    }
    .skeleton-title {
      width: 80%;
      height: 16px;
    }
    .skeleton-badges {
      display: flex;
      gap: 6px;
    }
    .skeleton-badge {
      width: 60px;
      height: 18px;
      border-radius: var(--radius-pill);
    }

    /* Jobs Grid */
    .jobs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: var(--space-3-5);
    }

    /* Job Card */
    .job-card {
      background: var(--color-bg-surface-glass);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 1px solid var(--color-border-default);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      box-shadow: var(--shadow-sm);
      transition: all var(--motion-fast);
      cursor: pointer;
      position: relative;
    }
    .job-card:hover {
      border-color: var(--color-border-hover);
      box-shadow: var(--shadow-md);
      transform: translateY(-2px);
    }
    .job-card.excellent {
      border-color: rgba(16, 185, 129, 0.3);
    }

    .job-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: var(--space-2);
    }
    .company-loc-row {
      display: flex;
      align-items: center;
      gap: var(--space-2-5);
      min-width: 0;
      flex: 1;
    }
    .company-info-block {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .company-name-text {
      font-size: var(--text-xs);
      font-weight: 700;
      color: var(--color-text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .location-chip {
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
    .score-top {
      background-color: var(--color-success-bg);
      color: var(--color-success-text);
      border-color: var(--color-success-border);
    }

    .job-title {
      font-size: var(--text-base);
      font-weight: 700;
      color: var(--color-text-primary);
      margin: 0;
      line-height: 1.35;
      letter-spacing: -0.015em;
    }

    .badges-row {
      display: flex;
      gap: var(--space-1-5);
      flex-wrap: wrap;
    }

    .job-card-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      margin-top: var(--space-1);
      padding-top: var(--space-2-5);
      border-top: 1px solid var(--color-border-subtle);
    }
    .btn-card-save {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 5px 10px;
      font-size: var(--text-xs);
      font-weight: 600;
      border-radius: var(--radius-sm);
      background: transparent;
      border: 1px solid var(--color-border-subtle);
      color: var(--color-text-secondary);
      cursor: pointer;
      transition: all var(--motion-fast);
    }
    .btn-card-save:hover {
      background: var(--color-bg-surface-elevated);
      color: var(--color-text-primary);
      border-color: var(--color-border-hover);
    }
    .btn-card-save.saved {
      background: var(--color-success-bg);
      color: var(--color-success-text);
      border-color: var(--color-success-border);
    }
    .footer-right-buttons {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    /* VIEW MODE 2: TABLE / LIST STYLING */
    .jobs-table-card {
      padding: 0;
      overflow: hidden;
    }
    .table-scroll {
      width: 100%;
      overflow-x: auto;
    }
    .jobs-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }
    .jobs-table th {
      padding: var(--space-3) var(--space-4);
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 700;
      color: var(--color-text-muted);
      letter-spacing: 0.05em;
      border-bottom: 1px solid var(--color-border-default);
      background: var(--color-bg-surface-elevated);
    }
    .jobs-table td {
      padding: var(--space-3) var(--space-4);
      border-bottom: 1px solid var(--color-border-subtle);
      vertical-align: middle;
      font-size: var(--text-xs);
    }
    .table-row-item {
      cursor: pointer;
      transition: background-color var(--motion-fast);
    }
    .table-row-item:hover {
      background-color: var(--color-bg-surface-elevated-glass);
    }
    .role-cell-wrap {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }
    .role-texts {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .table-job-title {
      font-weight: 700;
      color: var(--color-text-primary);
      font-size: var(--text-sm);
    }
    .table-company-sub {
      color: var(--color-text-muted);
      font-size: var(--text-2xs);
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .text-sm-table {
      color: var(--color-text-secondary);
      font-weight: 500;
    }
    .td-actions {
      display: flex;
      align-items: center;
      gap: var(--space-1-5);
      justify-content: flex-end;
    }
    .th-actions {
      text-align: right;
    }
    .btn-icon-cell {
      padding: 6px;
      border-radius: var(--radius-sm);
      background: transparent;
      border: 1px solid var(--color-border-subtle);
      color: var(--color-text-muted);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .btn-icon-cell:hover {
      color: var(--color-text-primary);
      border-color: var(--color-border-hover);
    }
    .btn-icon-cell.saved {
      background: var(--color-success-bg);
      color: var(--color-success-text);
      border-color: var(--color-success-border);
    }

    /* Pagination Bar */
    .pagination-bar {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-4);
      margin-top: var(--space-3);
    }
    .page-indicator {
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
    }

    @media (max-width: 768px) {
      .filters-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: var(--space-2-5);
      }
      .toolbar-middle-row {
        flex-direction: column;
        align-items: stretch;
      }
      .view-mode-toggle {
        display: none;
      }
      .jobs-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class JobsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly telegram = inject(TelegramService);
  private readonly toast = inject(ToastService);

  readonly jobs = signal<JobSummary[]>([]);
  readonly totalCount = signal<number>(0);
  readonly isLoading = signal<boolean>(false);
  readonly currentPage = signal<number>(1);
  readonly totalPages = signal<number>(1);
  readonly limit = 18;

  readonly viewMode = signal<'grid' | 'list'>('grid');

  searchKeyword: string = '';
  selectedEligibility: string = '';
  selectedWorkplace: string = '';
  selectedSeniority: string = '';
  minScore: number = 0;

  readonly activeQuickChip = signal<string>('ALL');

  // Drawer state
  readonly isDrawerOpen = signal<boolean>(false);
  readonly selectedJob = signal<JobSummary | null>(null);

  readonly quickChips: QuickChip[] = [
    { id: 'ALL', label: 'All Listings', icon: 'layers' },
    { id: 'TOP_MATCH', label: 'Top Match (70%+)', icon: 'star', minScore: 70 },
    { id: 'EGYPT_WORLDWIDE', label: 'Egypt & Worldwide', icon: 'globe', eligibility: 'EGYPT_ELIGIBLE' },
    { id: 'REMOTE', label: 'Remote Only', icon: 'building' },
    { id: 'MID_SENIOR', label: 'Mid & Senior', icon: 'user' },
  ];

  ngOnInit(): void {
    this.loadJobs();
  }

  loadJobs(): void {
    this.isLoading.set(true);
    const params: Record<string, string | number> = {
      page: this.currentPage(),
      limit: this.limit,
    };

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
      this.selectedEligibility = '';
      this.selectedWorkplace = '';
      this.selectedSeniority = '';
      this.minScore = 0;
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
      !!this.selectedEligibility ||
      !!this.selectedWorkplace ||
      !!this.selectedSeniority ||
      this.minScore > 0
    );
  }

  resetFilters(): void {
    this.searchKeyword = '';
    this.selectedEligibility = '';
    this.selectedWorkplace = '';
    this.selectedSeniority = '';
    this.minScore = 0;
    this.activeQuickChip.set('ALL');
    this.currentPage.set(1);
    this.loadJobs();
    this.toast.show('Filters reset to default view', 'info', 1500);
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
          newStatus === 'SAVED' ? `Role saved: ${job.title}` : `Role removed from Saved`,
          newStatus === 'SAVED' ? 'success' : 'info'
        );
      },
      error: (e) => {
        console.error('Failed to update tracker status:', e);
        this.toast.show('Failed to save status', 'error');
      },
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

  formatSource(src: string): string {
    return src.replace(/_/g, ' ');
  }
}
