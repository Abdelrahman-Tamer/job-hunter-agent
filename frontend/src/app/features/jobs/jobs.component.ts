import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { TelegramService } from '../../core/services/telegram.service';
import { IconComponent } from '../../core/components/icon/icon.component';
import { JobDetail, JobSummary, ApplicationStatus } from '../../core/models/job.model';

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
              placeholder="Search role, skills (Angular, TypeScript, Node)..."
              class="form-input search-input"
              aria-label="Search keywords"
            />
          </div>
          <button (click)="applyFilters()" class="btn btn-primary search-btn">
            <span>Search</span>
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
            <option [ngValue]="85">Min Score: 85%+ (Top Match)</option>
          </select>
        </div>
      </section>

      <!-- Jobs Grid -->
      <section class="jobs-list-container" aria-label="Job listings">
        <div *ngIf="isLoading()" class="loading-state">
          <app-icon name="refresh" [size]="24" class="spin"></app-icon>
          <p>Loading verified opportunities...</p>
        </div>

        <div *ngIf="!isLoading() && jobs().length === 0" class="empty-state card">
          <app-icon name="search" [size]="32" class="empty-icon"></app-icon>
          <h3>No matching jobs found</h3>
          <p>Broaden your filters or keyword query to discover more opportunities.</p>
        </div>

        <div class="jobs-grid" *ngIf="!isLoading() && jobs().length > 0">
          <article *ngFor="let job of jobs()" class="job-card" [class.excellent]="job.match_score >= 85">
            <!-- Card Header -->
            <div class="job-card-header">
              <div class="company-loc-row">
                <span class="company-chip">
                  <app-icon name="building" [size]="13"></app-icon>
                  {{ job.company }}
                </span>
                <span class="location-chip">
                  <app-icon name="map-pin" [size]="13"></app-icon>
                  {{ job.raw_location || 'Remote' }}
                </span>
              </div>
              <div class="score-pill" [class.score-top]="job.match_score >= 85">
                <app-icon name="sparkles" [size]="12"></app-icon>
                <span>{{ job.match_score }}% Match</span>
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
                {{ job.eligibility }}
              </span>
              <span class="badge">{{ job.workplace_type }}</span>
              <span class="badge">{{ job.seniority }}</span>
              <span class="badge">{{ job.source_name }}</span>
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
                class="btn btn-primary btn-sm"
              >
                <span>Apply</span>
                <app-icon name="external-link" [size]="13"></app-icon>
              </a>

              <button (click)="openDetail(job.id)" class="btn btn-secondary btn-sm">
                <app-icon name="info" [size]="13"></app-icon>
                <span>Why Match?</span>
              </button>

              <button
                (click)="setStatus(job.id, 'SAVED')"
                class="btn btn-outline btn-sm"
                [class.btn-saved]="job.tracker_status === 'SAVED'"
                title="Save Job"
              >
                <app-icon [name]="job.tracker_status === 'SAVED' ? 'bookmark' : 'bookmark'" [size]="13"></app-icon>
                <span>{{ job.tracker_status === 'SAVED' ? 'Saved' : 'Save' }}</span>
              </button>

              <button
                (click)="setStatus(job.id, 'APPLIED')"
                class="btn btn-outline btn-sm"
                [class.btn-applied]="job.tracker_status === 'APPLIED'"
                title="Mark Applied"
              >
                <app-icon name="check-square" [size]="13"></app-icon>
                <span>{{ job.tracker_status === 'APPLIED' ? 'Applied' : 'Apply' }}</span>
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
                <span class="breakdown-total">{{ selectedJobDetail()?.match_score }}%</span>
              </div>
              <ul class="breakdown-list">
                <li *ngFor="let entry of b | keyvalue">
                  <span>{{ entry.key }}</span>
                  <strong>{{ entry.value }} pts</strong>
                </li>
              </ul>
            </div>

            <!-- Match Reasons -->
            <div class="reason-block" *ngIf="selectedJobDetail()?.match_reasons?.length">
              <h4>Match Strengths</h4>
              <ul>
                <li *ngFor="let r of selectedJobDetail()?.match_reasons">{{ r }}</li>
              </ul>
            </div>

            <!-- Gaps -->
            <div class="gaps-block" *ngIf="selectedJobDetail()?.skill_gaps?.length">
              <h4>Requirements Gaps</h4>
              <ul>
                <li *ngFor="let g of selectedJobDetail()?.skill_gaps">{{ g }}</li>
              </ul>
            </div>

            <!-- Raw Description Snippet -->
            <div class="desc-preview" *ngIf="selectedJobDetail()?.description_text">
              <h4>Job Description</h4>
              <div class="desc-box">{{ selectedJobDetail()?.description_text }}</div>
            </div>
          </div>

          <div class="modal-footer">
            <a
              *ngIf="selectedJobDetail()?.original_application_url"
              [href]="selectedJobDetail()?.original_application_url"
              target="_blank"
              rel="noopener noreferrer"
              class="btn btn-primary"
            >
              <span>Open Application</span>
              <app-icon name="external-link" [size]="14"></app-icon>
            </a>
            <button (click)="closeDetail()" class="btn btn-secondary">
              Close
            </button>
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
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      padding: var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
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
    }
    .filters-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: var(--space-2-5);
    }

    /* Jobs Grid */
    .jobs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
      gap: var(--space-3-5);
    }
    .job-card {
      background-color: var(--color-bg-surface-glass);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid var(--color-border-default);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      box-shadow: var(--shadow-xs);
      transition: border-color var(--motion-fast), box-shadow var(--motion-fast), transform var(--motion-fast);
    }
    .job-card:hover {
      border-color: var(--color-border-hover);
      box-shadow: var(--shadow-md);
      transform: translateY(-2px);
    }
    .job-card.excellent {
      border-color: rgba(16, 185, 129, 0.35);
    }

    .job-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--space-2);
    }
    .company-loc-row {
      display: flex;
      align-items: center;
      gap: var(--space-2-5);
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
    }
    .company-chip, .location-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .score-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 8px;
      border-radius: var(--radius-pill);
      font-size: var(--text-xs);
      font-weight: 700;
      font-family: var(--font-mono);
      background-color: var(--color-brand-subtle);
      border: 1px solid var(--color-brand-border);
      color: var(--color-brand-accent);
      white-space: nowrap;
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
      padding: 1px 6px;
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
    .btn-saved {
      background-color: var(--color-brand-subtle);
      border-color: var(--color-brand-border);
      color: var(--color-brand-accent);
    }
    .btn-applied {
      background-color: var(--color-success-bg);
      border-color: var(--color-success-border);
      color: var(--color-success-text);
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
      background-color: rgba(255, 255, 255, 0.05);
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
    .reason-block, .gaps-block {
      margin-bottom: var(--space-4);
    }
    .reason-block h4, .gaps-block h4, .desc-preview h4 {
      font-size: var(--text-xs);
      color: var(--color-text-primary);
      margin-bottom: var(--space-2);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .reason-block ul, .gaps-block ul {
      padding-inline-start: var(--space-4);
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .desc-box {
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
      background-color: var(--color-bg-surface-elevated);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-sm);
      padding: var(--space-3);
      max-height: 140px;
      overflow-y: auto;
      white-space: pre-wrap;
      line-height: 1.5;
    }

    .loading-state, .empty-state {
      padding: var(--space-10) var(--space-4);
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2);
      color: var(--color-text-muted);
    }
    .empty-icon {
      color: var(--color-text-muted);
      opacity: 0.4;
    }
    .spin {
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* Mobile / Telegram Mini App */
    @media (max-width: 768px) {
      .filters-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: var(--space-2);
      }
      .jobs-grid {
        grid-template-columns: 1fr;
      }
      .job-card-actions {
        grid-template-columns: 1fr 1fr;
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

  searchKeyword: string = '';
  selectedEligibility: string = '';
  selectedWorkplace: string = '';
  selectedSeniority: string = '';
  minScore: number = 0;

  ngOnInit(): void {
    this.applyFilters();
  }

  applyFilters(): void {
    this.telegram.haptic('light');
    this.isLoading.set(true);
    const params: Record<string, string | number> = {};
    if (this.searchKeyword) params['keyword'] = this.searchKeyword;
    if (this.selectedEligibility) params['eligibility'] = this.selectedEligibility;
    if (this.selectedWorkplace) params['workplace_type'] = this.selectedWorkplace;
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

  openDetail(jobId: number): void {
    this.telegram.haptic('light');
    this.api.getJobDetail(jobId).subscribe({
      next: (detail) => this.selectedJobDetail.set(detail),
    });
  }

  closeDetail(): void {
    this.selectedJobDetail.set(null);
  }

  setStatus(jobId: number, status: ApplicationStatus): void {
    this.telegram.haptic('selection');
    this.api.updateJobStatus(jobId, status).subscribe({
      next: () => {
        this.telegram.haptic('success');
        this.applyFilters();
      },
    });
  }

  onOpenLink(event: MouseEvent, url: string): void {
    if (this.telegram.isTelegram()) {
      event.preventDefault();
      this.telegram.haptic('light');
      this.telegram.openUrl(url);
    }
  }
}
