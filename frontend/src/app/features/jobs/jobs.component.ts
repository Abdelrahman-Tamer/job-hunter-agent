import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { TelegramService } from '../../core/services/telegram.service';
import { IconComponent, IconName } from '../../core/components/icon/icon.component';
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
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
    <div class="jobs-view">
      <!-- Search & Filters Toolbar -->
      <section class="panel filters-panel" aria-label="Search and filter jobs">
        <div class="search-bar">
          <div class="search-input-wrap">
            <app-icon name="search" [size]="16" class="search-icon"></app-icon>
            <input
              type="search"
              [(ngModel)]="searchKeyword"
              (keyup.enter)="applyFilters()"
              placeholder="Search role, skills (Angular, TypeScript, Node, React)..."
              class="form-input search-input"
              aria-label="Search keywords"
            />
          </div>
          <button (click)="applyFilters()" class="btn btn-primary search-btn">
            <app-icon name="search" [size]="14"></app-icon>
            <span>Search</span>
          </button>
        </div>

        <!-- Quick Filter Chips -->
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

        <div class="filters-grid" role="group" aria-label="Filter options">
          <select [(ngModel)]="selectedEligibility" (change)="applyFilters()" class="form-select" aria-label="Eligibility filter">
            <option value="">All Eligibility</option>
            <option value="EGYPT_ELIGIBLE">Egypt Eligible</option>
            <option value="REMOTE_WORLDWIDE">Remote Worldwide</option>
            <option value="REMOTE_REGION_POSSIBLE">Region Possible</option>
            <option value="RELOCATION_REQUIRED">Relocation Required</option>
          </select>

          <select [(ngModel)]="selectedWorkplace" (change)="applyFilters()" class="form-select" aria-label="Workplace mode filter">
            <option value="">All Work Modes</option>
            <option value="REMOTE">Remote</option>
            <option value="HYBRID">Hybrid</option>
            <option value="ON_SITE">On-site</option>
          </select>

          <select [(ngModel)]="selectedSeniority" (change)="applyFilters()" class="form-select" aria-label="Seniority filter">
            <option value="">All Seniorities</option>
            <option value="GRADUATE">Graduate / Entry</option>
            <option value="JUNIOR">Junior</option>
            <option value="MID">Mid-level</option>
            <option value="SENIOR">Senior</option>
          </select>

          <select [(ngModel)]="minScore" (change)="applyFilters()" class="form-select" aria-label="Minimum score threshold">
            <option [ngValue]="0">Min Score: Any</option>
            <option [ngValue]="60">Min Score: 60%+</option>
            <option [ngValue]="70">Min Score: 70%+ (Strong)</option>
            <option [ngValue]="80">Min Score: 80%+ (Top Match)</option>
          </select>
        </div>
      </section>

      <!-- Jobs Grid -->
      <section class="jobs-list-container" aria-label="Job listings">
        <div *ngIf="isLoading()" class="loading-state card">
          <app-icon name="refresh" [size]="24" class="spin spin-accent"></app-icon>
          <p>Loading verified opportunities...</p>
        </div>

        <div *ngIf="!isLoading() && jobs().length === 0" class="empty-state card">
          <app-icon name="search" [size]="32" class="empty-icon"></app-icon>
          <h3>No matching jobs found</h3>
          <p>Try clearing filters or switching quick presets to discover more roles.</p>
          <button (click)="resetFilters()" class="btn btn-secondary btn-sm">
            <span>Reset Filters</span>
          </button>
        </div>

        <div class="jobs-grid" *ngIf="!isLoading() && jobs().length > 0">
          <article *ngFor="let job of jobs()" class="job-card" [class.excellent]="job.match_score >= 80">
            <!-- Card Header -->
            <div class="job-card-header">
              <div class="company-loc-row">
                <span class="company-avatar">{{ job.company.charAt(0) }}</span>
                <div class="company-info-block">
                  <span class="company-name-text">{{ job.company }}</span>
                  <span class="location-chip">
                    <app-icon name="map-pin" [size]="11"></app-icon>
                    {{ job.raw_location || 'Remote' }}
                  </span>
                </div>
              </div>

              <div class="score-pill" [class.score-top]="job.match_score >= 70">
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

            <!-- Tech Skills -->
            <div class="skills-row" *ngIf="job.required_skills?.length">
              <span *ngFor="let skill of job.required_skills.slice(0, 5)" class="skill-tag">{{ skill }}</span>
            </div>

            <!-- Published Date -->
            <div class="job-card-meta">
              <span class="date-text">
                <app-icon name="calendar" [size]="12"></app-icon>
                <span>{{ job.published_at ? (job.published_at | date:'mediumDate') : (job.first_seen_at | date:'mediumDate') }}</span>
              </span>
            </div>

            <!-- Actions Row -->
            <div class="job-card-actions">
              <a
                [href]="job.original_application_url"
                target="_blank"
                rel="noopener noreferrer"
                (click)="onOpenLink($event, job.original_application_url)"
                class="btn btn-primary btn-sm action-btn apply-btn"
                title="Open job application"
              >
                <span>View Role</span>
                <app-icon name="external-link" [size]="12"></app-icon>
              </a>

              <button
                (click)="openDetail(job.id)"
                class="btn btn-secondary btn-sm action-btn"
                title="View match analysis"
              >
                <app-icon name="info" [size]="12"></app-icon>
                <span>Match Details</span>
              </button>

              <button
                (click)="toggleSave(job)"
                class="btn btn-outline btn-sm action-btn"
                [class.btn-saved]="job.tracker_status === 'SAVED'"
                title="Save for later"
              >
                <app-icon name="bookmark" [size]="12"></app-icon>
                <span>{{ job.tracker_status === 'SAVED' ? 'Saved' : 'Save' }}</span>
              </button>

              <button
                (click)="toggleApplied(job)"
                class="btn btn-outline btn-sm action-btn"
                [class.btn-applied]="job.tracker_status === 'APPLIED'"
                title="Track in pipeline"
              >
                <app-icon name="check-square" [size]="12"></app-icon>
                <span>{{ job.tracker_status === 'APPLIED' ? 'Applied ✓' : 'Track Applied' }}</span>
              </button>
            </div>
          </article>
        </div>
      </section>

      <!-- Match Breakdown Detail Modal -->
      <div
        *ngIf="selectedJobDetail()"
        class="modal-backdrop"
        (click)="closeDetail()"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-job-title"
      >
        <div class="modal-dialog" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <div>
              <h2 id="modal-job-title">{{ selectedJobDetail()?.title }}</h2>
              <p class="modal-subtitle">{{ selectedJobDetail()?.company }} • {{ selectedJobDetail()?.raw_location || 'Remote' }}</p>
            </div>
            <button (click)="closeDetail()" class="btn-close" aria-label="Close dialog">
              <app-icon name="x" [size]="18"></app-icon>
            </button>
          </div>

          <div class="modal-body">
            <!-- Score Breakdown Card -->
            <div class="breakdown-card" *ngIf="selectedJobDetail()?.score_breakdown as b">
              <div class="breakdown-header">
                <h3>Score Breakdown</h3>
                <span class="breakdown-total">{{ selectedJobDetail()?.match_score }}% Match</span>
              </div>
              <ul class="breakdown-list">
                <li *ngFor="let entry of b | keyvalue">
                  <span class="factor-name">{{ entry.key }}</span>
                  <span class="factor-val">{{ entry.value }}</span>
                </li>
              </ul>
            </div>

            <!-- Match Reasons -->
            <div class="reason-block" *ngIf="selectedJobDetail()?.match_reasons?.length">
              <h3>Positive Matching Factors</h3>
              <ul>
                <li *ngFor="let r of selectedJobDetail()?.match_reasons">
                  <app-icon name="check" [size]="14" class="icon-match-check"></app-icon>
                  <span>{{ r }}</span>
                </li>
              </ul>
            </div>

            <!-- Missing Requirements / Gaps -->
            <div class="gaps-block" *ngIf="selectedJobDetail()?.skill_gaps?.length">
              <h3>Missing Requirements</h3>
              <ul>
                <li *ngFor="let g of selectedJobDetail()?.skill_gaps">
                  <app-icon name="x" [size]="14" class="icon-gap-x"></app-icon>
                  <span>{{ g }}</span>
                </li>
              </ul>
            </div>
          </div>

          <div class="modal-footer">
            <button (click)="closeDetail()" class="btn btn-secondary btn-sm">Close</button>
            <a
              *ngIf="selectedJobDetail()?.original_application_url as url"
              [href]="url"
              target="_blank"
              rel="noopener noreferrer"
              class="btn btn-primary btn-sm"
            >
              <span>Open Application</span>
              <app-icon name="external-link" [size]="13"></app-icon>
            </a>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .jobs-view {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      width: 100%;
    }

    /* Filters Panel */
    .filters-panel {
      background-color: var(--color-bg-surface-glass);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      padding: var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      border-radius: var(--radius-lg);
      border: 1px solid var(--color-border-default);
      box-shadow: var(--shadow-sm);
    }
    .search-bar {
      display: flex;
      gap: var(--space-2-5);
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
      padding-left: 36px;
    }
    .search-btn {
      flex-shrink: 0;
      gap: 6px;
    }

    /* Quick Chips */
    .quick-chips-row {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .quick-chip-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      border-radius: var(--radius-pill);
      font-size: var(--text-2xs);
      font-weight: 600;
      background: var(--color-bg-surface-elevated-glass);
      border: 1px solid var(--color-border-subtle);
      color: var(--color-text-secondary);
      cursor: pointer;
      transition: all var(--motion-fast);
    }
    .quick-chip-btn:hover {
      color: var(--color-text-primary);
      border-color: var(--color-border-hover);
    }
    .quick-chip-btn.active {
      color: #ffffff;
      background: var(--color-brand-primary);
      border-color: transparent;
      box-shadow: 0 1px 4px rgba(37, 99, 235, 0.35);
    }

    .filters-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: var(--space-2-5);
    }

    /* Jobs Grid */
    .jobs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: var(--space-3-5);
      width: 100%;
      min-width: 0;
    }
    .job-card {
      background-color: var(--color-bg-surface-glass);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 1px solid var(--color-border-default);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      box-shadow: var(--shadow-sm);
      transition: border-color var(--motion-fast), box-shadow var(--motion-fast), transform var(--motion-fast);
      min-width: 0;
      max-width: 100%;
      box-sizing: border-box;
      overflow: hidden;
    }
    .job-card:hover {
      border-color: var(--color-border-hover);
      box-shadow: var(--shadow-md);
      transform: translateY(-2px);
    }
    .job-card.excellent {
      border-color: rgba(16, 185, 129, 0.4);
    }

    .job-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: var(--space-2);
      min-width: 0;
    }
    .company-loc-row {
      display: flex;
      align-items: center;
      gap: var(--space-2-5);
      min-width: 0;
      flex: 1;
    }
    .company-avatar {
      flex-shrink: 0;
    }
    .company-info-block {
      display: flex;
      flex-direction: column;
      line-height: 1.25;
      min-width: 0;
      flex: 1;
    }
    .company-name-text {
      font-size: var(--text-xs);
      font-weight: 700;
      color: var(--color-text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
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
      max-width: 100%;
    }

    .score-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 9px;
      border-radius: var(--radius-pill);
      font-size: var(--text-xs);
      font-weight: 700;
      font-family: var(--font-mono);
      background-color: var(--color-brand-subtle);
      border: 1px solid var(--color-brand-border);
      color: var(--color-brand-accent);
      white-space: nowrap;
      flex-shrink: 0;
    }
    .score-pill.score-top {
      background-color: var(--color-success-bg);
      border-color: var(--color-success-border);
      color: var(--color-success-text);
    }

    .job-title {
      font-size: var(--text-base);
      font-weight: 700;
      color: var(--color-text-primary);
      margin: 0;
      line-height: 1.35;
      letter-spacing: -0.015em;
      overflow-wrap: break-word;
      word-break: break-word;
    }

    .badges-row {
      display: flex;
      gap: var(--space-1-5);
      flex-wrap: wrap;
    }
    .skills-row {
      display: flex;
      gap: 5px;
      flex-wrap: wrap;
    }
    .skill-tag {
      font-size: var(--text-2xs);
      font-family: var(--font-mono);
      color: var(--color-text-muted);
      background: var(--color-bg-surface-elevated);
      padding: 1.5px 6px;
      border-radius: var(--radius-xs);
      border: 1px solid var(--color-border-subtle);
    }

    .job-card-meta {
      display: flex;
      align-items: center;
      font-size: var(--text-2xs);
      color: var(--color-text-muted);
    }
    .date-text {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .job-card-actions {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: var(--space-2);
      margin-top: var(--space-1);
    }
    .action-btn {
      padding: 6px 8px;
      font-size: var(--text-2xs);
    }

    .btn-saved {
      background-color: var(--color-warning-bg);
      border-color: var(--color-warning-border);
      color: var(--color-warning-text);
      font-weight: 700;
    }
    .btn-applied {
      background-color: var(--color-success-bg);
      border-color: var(--color-success-border);
      color: var(--color-success-text);
      font-weight: 700;
    }

    /* Modal Styling */
    .btn-close {
      background: transparent;
      border: none;
      color: var(--color-text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px;
      border-radius: var(--radius-sm);
    }
    .btn-close:hover {
      color: var(--color-text-primary);
      background-color: rgba(255, 255, 255, 0.08);
    }
    .modal-subtitle {
      font-size: var(--text-xs);
      color: var(--color-text-muted);
      margin-top: 2px;
    }
    .breakdown-card {
      background-color: var(--color-bg-surface-elevated);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md);
      padding: var(--space-3-5);
      margin-bottom: var(--space-4);
    }
    .breakdown-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-2);
    }
    .breakdown-header h3 {
      font-size: var(--text-sm);
      margin: 0;
    }
    .breakdown-total {
      font-size: var(--text-base);
      font-weight: 700;
      font-family: var(--font-mono);
      color: var(--color-brand-accent);
    }
    .breakdown-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: var(--space-1-5);
    }
    .breakdown-list li {
      display: flex;
      justify-content: space-between;
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
      border-bottom: 1px solid var(--color-border-subtle);
      padding-bottom: 4px;
    }
    .breakdown-list li:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }
    .factor-name {
      text-transform: capitalize;
    }
    .factor-val {
      font-family: var(--font-mono);
      font-weight: 600;
    }
    .reason-block, .gaps-block {
      margin-bottom: var(--space-4);
    }
    .reason-block h3, .gaps-block h3 {
      font-size: var(--text-xs);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      margin-bottom: var(--space-2);
    }
    .reason-block h3 { color: var(--color-success-text); }
    .gaps-block h3 { color: var(--color-warning-text); }

    .reason-block ul, .gaps-block ul {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .reason-block li, .gaps-block li {
      display: flex;
      align-items: flex-start;
      gap: 7px;
      font-size: var(--text-xs);
      line-height: 1.4;
    }
    .icon-match-check { color: var(--color-success-text); flex-shrink: 0; margin-top: 2px; }
    .icon-gap-x { color: var(--color-warning-text); flex-shrink: 0; margin-top: 2px; }

    .loading-state, .empty-state {
      padding: var(--space-10) var(--space-4);
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2-5);
    }
    .spin {
      animation: spin 1s linear infinite;
    }
    .spin-accent {
      color: var(--color-brand-accent);
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    @media (max-width: 768px) {
      .filters-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--space-2);
      }
      .jobs-grid {
        grid-template-columns: minmax(0, 1fr);
      }
      .job-card-actions {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `],
})
export class JobsComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly telegram = inject(TelegramService);

  jobs = signal<JobSummary[]>([]);
  isLoading = signal<boolean>(false);
  selectedJobDetail = signal<JobDetail | null>(null);

  searchKeyword = '';
  selectedEligibility = '';
  selectedWorkplace = '';
  selectedSeniority = '';
  minScore = 0;
  activeQuickChip = signal<string>('all');

  readonly quickChips: QuickChip[] = [
    { id: 'all', label: 'All Roles', icon: 'layers' },
    { id: 'remote', label: 'Remote Worldwide', icon: 'globe', eligibility: 'REMOTE_WORLDWIDE' },
    { id: 'egypt', label: 'Egypt Eligible', icon: 'map-pin', eligibility: 'EGYPT_ELIGIBLE' },
    { id: 'top_match', label: '70%+ Match', icon: 'sparkles', minScore: 70 },
  ];

  ngOnInit(): void {
    this.fetchJobs();
  }

  selectQuickChip(id: string): void {
    this.telegram.haptic('selection');
    this.activeQuickChip.set(id);

    const chip = this.quickChips.find((c) => c.id === id);
    if (chip) {
      this.selectedEligibility = chip.eligibility || '';
      this.minScore = chip.minScore || 0;
    }
    this.fetchJobs();
  }

  applyFilters(): void {
    this.activeQuickChip.set('');
    this.fetchJobs();
  }

  resetFilters(): void {
    this.searchKeyword = '';
    this.selectedEligibility = '';
    this.selectedWorkplace = '';
    this.selectedSeniority = '';
    this.minScore = 0;
    this.activeQuickChip.set('all');
    this.fetchJobs();
  }

  fetchJobs(): void {
    this.isLoading.set(true);
    const params: Record<string, string | number> = { limit: 50 };

    if (this.searchKeyword.trim()) params['keyword'] = this.searchKeyword.trim();
    if (this.selectedEligibility) params['eligibility'] = this.selectedEligibility;
    if (this.selectedWorkplace) params['workplace'] = this.selectedWorkplace;
    if (this.selectedSeniority) params['seniority'] = this.selectedSeniority;
    if (this.minScore > 0) params['min_score'] = this.minScore;

    this.api.getJobs(params).subscribe({
      next: (res) => {
        this.jobs.set(res.items);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  setStatus(jobId: number, status: ApplicationStatus): void {
    this.telegram.haptic('selection');
    this.api.updateJobStatus(jobId, status).subscribe({
      next: () => {
        this.jobs.update((items) =>
          items.map((j) => (j.id === jobId ? { ...j, tracker_status: status } : j))
        );
      },
    });
  }

  openDetail(jobId: number): void {
    this.telegram.haptic('light');
    this.api.getJobDetail(jobId).subscribe({
      next: (detail: JobDetail) => this.selectedJobDetail.set(detail),
    });
  }

  closeDetail(): void {
    this.selectedJobDetail.set(null);
  }

  onOpenLink(event: MouseEvent, url: string): void {
    if (this.telegram.isTelegram()) {
      event.preventDefault();
      this.telegram.openLink(url);
    }
  }

  toggleSave(job: JobSummary): void {
    const next: ApplicationStatus = job.tracker_status === 'SAVED' ? 'DISCOVERED' : 'SAVED';
    this.setStatus(job.id, next);
  }

  toggleApplied(job: JobSummary): void {
    const next: ApplicationStatus = job.tracker_status === 'APPLIED' ? 'DISCOVERED' : 'APPLIED';
    this.setStatus(job.id, next);
  }

  roundScore(score: number): number {
    return Math.round(score);
  }

  formatEligibility(e?: string): string {
    if (!e) return 'Worldwide';
    switch (e) {
      case 'EGYPT_ELIGIBLE': return 'Egypt Eligible';
      case 'REMOTE_WORLDWIDE': return 'Worldwide Remote';
      case 'REMOTE_REGION_POSSIBLE': return 'Region Remote';
      case 'RELOCATION_REQUIRED': return 'Relocation';
      default: return e.replace(/_/g, ' ');
    }
  }

  formatWorkplace(w?: string): string {
    if (!w || w === 'UNKNOWN') return '';
    switch (w) {
      case 'REMOTE': return 'Remote';
      case 'HYBRID': return 'Hybrid';
      case 'ON_SITE': return 'On-site';
      default: return w;
    }
  }

  formatSeniority(s?: string): string {
    if (!s || s === 'UNKNOWN') return '';
    switch (s) {
      case 'GRADUATE': return 'Entry / Grad';
      case 'JUNIOR': return 'Junior';
      case 'MID': return 'Mid-level';
      case 'SENIOR': return 'Senior';
      default: return s;
    }
  }

  formatSource(src?: string): string {
    if (!src) return '';
    switch (src) {
      case 'greenhouse_canonical': return 'Canonical';
      case 'remoteok': return 'RemoteOK';
      case 'weworkremotely': return 'WeWorkRemotely';
      case 'jobspy': return 'JobSpy';
      default: return src.replace(/_/g, ' ');
    }
  }
}
