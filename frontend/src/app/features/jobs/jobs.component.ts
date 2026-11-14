import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { TelegramService } from '../../core/services/telegram.service';
import { JobDetail, JobSummary, ApplicationStatus } from '../../core/models/job.model';

@Component({
  selector: 'app-jobs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="jobs-view">
      <!-- Search & Filters Toolbar -->
      <section class="filters-toolbar">
        <div class="search-box">
          <input
            type="text"
            [(ngModel)]="searchKeyword"
            (keyup.enter)="applyFilters()"
            placeholder="Search role, skills (Angular, TypeScript)..."
            class="input-control"
          />
          <button (click)="applyFilters()" class="btn filter-btn">Search</button>
        </div>

        <div class="filters-row">
          <select [(ngModel)]="selectedEligibility" (change)="applyFilters()" class="select-control">
            <option value="">All Eligibility</option>
            <option value="EGYPT_ELIGIBLE">🇪🇬 Egypt Eligible</option>
            <option value="REMOTE_WORLDWIDE">🌐 Remote Worldwide</option>
            <option value="REMOTE_REGION_POSSIBLE">⚠️ Region Possible</option>
            <option value="RELOCATION_REQUIRED">✈️ Relocation Required</option>
          </select>

          <select [(ngModel)]="selectedWorkplace" (change)="applyFilters()" class="select-control">
            <option value="">All Work Modes</option>
            <option value="REMOTE">Remote</option>
            <option value="HYBRID">Hybrid</option>
            <option value="ON_SITE">On-site</option>
          </select>

          <select [(ngModel)]="selectedSeniority" (change)="applyFilters()" class="select-control">
            <option value="">All Seniorities</option>
            <option value="GRADUATE">Graduate / Entry</option>
            <option value="JUNIOR">Junior</option>
            <option value="MID">Mid-level</option>
            <option value="SENIOR">Senior</option>
          </select>

          <select [(ngModel)]="minScore" (change)="applyFilters()" class="select-control">
            <option [ngValue]="0">Min Score: Any</option>
            <option [ngValue]="60">Min Score: 60+</option>
            <option [ngValue]="70">Min Score: 70+ (Strong)</option>
            <option [ngValue]="85">Min Score: 85+ (Excellent)</option>
          </select>
        </div>
      </section>

      <!-- Jobs Grid -->
      <section class="jobs-grid">
        <div *ngIf="isLoading()" class="loading-state">
          <p>⏳ Loading matching opportunities...</p>
        </div>

        <div *ngIf="!isLoading() && jobs().length === 0" class="empty-state">
          <h3>No matching jobs found</h3>
          <p>Try broadening your filters or keyword query.</p>
        </div>

        <div *ngFor="let job of jobs()" class="job-card" [class.excellent]="job.match_score >= 85">
          <div class="card-top">
            <div class="title-company">
              <h3>{{ job.title }}</h3>
              <p class="company-name">🏢 {{ job.company }} • 🌍 {{ job.raw_location || 'Remote' }}</p>
            </div>
            <div class="score-display">
              <span class="score-num">{{ job.match_score }}</span>
              <span class="score-label">/ 100</span>
            </div>
          </div>

          <div class="badges-row">
            <span class="badge elig-badge" [class.eg]="job.eligibility === 'EGYPT_ELIGIBLE'" [class.world]="job.eligibility === 'REMOTE_WORLDWIDE'">
              {{ job.eligibility }}
            </span>
            <span class="badge mode-badge">{{ job.workplace_type }}</span>
            <span class="badge sen-badge">{{ job.seniority }}</span>
            <span class="badge source-badge">{{ job.source_name }}</span>
          </div>

          <div class="tech-tags" *ngIf="job.required_skills?.length">
            <span *ngFor="let skill of job.required_skills.slice(0, 5)" class="tech-tag">#{{ skill }}</span>
          </div>

          <div class="date-row">
            <small *ngIf="job.published_at">🗓️ Published: {{ job.published_at | date:'yyyy-MM-dd' }}</small>
            <small *ngIf="!job.published_at">🔍 Discovered: {{ job.first_seen_at | date:'yyyy-MM-dd' }}</small>
          </div>

          <div class="actions-row">
            <a [href]="job.original_application_url" target="_blank" rel="noopener" (click)="onOpenLink($event, job.original_application_url)" class="btn apply-btn">
              Apply ↗
            </a>
            <button (click)="openDetail(job.id)" class="btn secondary-btn">
              Why Match?
            </button>
            <button (click)="setStatus(job.id, 'SAVED')" class="btn icon-btn" title="Save Job">
              ⭐ Save
            </button>
            <button (click)="setStatus(job.id, 'APPLIED')" class="btn icon-btn" title="Mark as Applied">
              ✅ Applied
            </button>
          </div>
        </div>
      </section>

      <!-- Detail Modal -->
      <div *ngIf="selectedJobDetail()" class="modal-backdrop" (click)="closeDetail()">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>{{ selectedJobDetail()?.title }}</h2>
            <button (click)="closeDetail()" class="close-btn">&times;</button>
          </div>
          <div class="modal-body">
            <p><strong>Company:</strong> {{ selectedJobDetail()?.company }}</p>
            <p><strong>Eligibility:</strong> {{ selectedJobDetail()?.eligibility }} ({{ selectedJobDetail()?.eligibility_reason }})</p>

            <h3>Match Breakdown ({{ selectedJobDetail()?.match_score }} / 100)</h3>
            <ul class="breakdown-list">
              <li>Role Relevance: {{ selectedJobDetail()?.score_breakdown?.['role_relevance'] }} / 20</li>
              <li>Confirmed Skills Overlap: {{ selectedJobDetail()?.score_breakdown?.['confirmed_skills'] }} / 25</li>
              <li>Seniority & Experience: {{ selectedJobDetail()?.score_breakdown?.['experience_seniority'] }} / 20</li>
              <li>Work Eligibility: {{ selectedJobDetail()?.score_breakdown?.['work_eligibility'] }} / 20</li>
              <li>Employment Type: {{ selectedJobDetail()?.score_breakdown?.['employment_type'] }} / 10</li>
              <li>Freshness: {{ selectedJobDetail()?.score_breakdown?.['freshness_evidence'] }} / 5</li>
            </ul>

            <div *ngIf="selectedJobDetail()?.match_reasons?.length">
              <h4>Match Reasons:</h4>
              <ul>
                <li *ngFor="let r of selectedJobDetail()?.match_reasons">{{ r }}</li>
              </ul>
            </div>

            <div *ngIf="selectedJobDetail()?.skill_gaps?.length">
              <h4>Notes & Gaps:</h4>
              <ul>
                <li *ngFor="let g of selectedJobDetail()?.skill_gaps">{{ g }}</li>
              </ul>
            </div>

            <h4>Description Preview:</h4>
            <div class="desc-box">
              {{ selectedJobDetail()?.description_text?.slice(0, 1000) }}...
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .jobs-view { display: flex; flex-direction: column; gap: 16px; width: 100%; box-sizing: border-box; }
    .filters-toolbar {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      box-sizing: border-box;
      width: 100%;
    }
    .search-box { display: flex; gap: 8px; width: 100%; }
    .input-control {
      flex: 1;
      min-width: 0;
      padding: 9px 12px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 0.9rem;
      box-sizing: border-box;
    }
    .filter-btn {
      background: #2563eb;
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 0 16px;
      font-weight: 600;
      cursor: pointer;
      font-size: 0.9rem;
      white-space: nowrap;
    }
    .filters-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      width: 100%;
    }
    .select-control {
      padding: 7px 10px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 0.82rem;
      background: #fff;
      color: #334155;
      box-sizing: border-box;
    }

    .jobs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
      gap: 14px;
      width: 100%;
      box-sizing: border-box;
    }
    .loading-state, .empty-state {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 32px 16px;
      text-align: center;
      color: #64748b;
      grid-column: 1 / -1;
    }

    .job-card {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 10px;
      box-sizing: border-box;
      box-shadow: 0 1px 3px rgba(0,0,0,0.02);
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .job-card:hover { transform: translateY(-2px); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .job-card.excellent { border-left: 4px solid #10b981; }

    .card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
    .title-company h3 { margin: 0 0 4px 0; font-size: 1rem; color: #0f172a; line-height: 1.3; }
    .company-name { margin: 0; font-size: 0.82rem; color: #64748b; }
    .score-display { text-align: right; background: #f8fafc; padding: 4px 8px; border-radius: 6px; border: 1px solid #e2e8f0; flex-shrink: 0; }
    .score-num { font-weight: 700; font-size: 1.05rem; color: #2563eb; }
    .score-label { font-size: 0.72rem; color: #94a3b8; }

    .badges-row { display: flex; gap: 5px; flex-wrap: wrap; }
    .badge { font-size: 0.72rem; padding: 2px 7px; border-radius: 4px; font-weight: 500; }
    .elig-badge { background: #e2e8f0; color: #334155; }
    .elig-badge.eg { background: #dcfce7; color: #166534; }
    .elig-badge.world { background: #dbeafe; color: #1e40af; }
    .mode-badge { background: #f1f5f9; color: #475569; }
    .sen-badge { background: #fef3c7; color: #92400e; }
    .source-badge { background: #f3e8ff; color: #6b21a8; }

    .tech-tags { display: flex; gap: 5px; flex-wrap: wrap; }
    .tech-tag { font-size: 0.72rem; color: #64748b; }
    .date-row { font-size: 0.72rem; color: #94a3b8; }

    .actions-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
    .btn { font-size: 0.8rem; padding: 7px 12px; border-radius: 6px; cursor: pointer; text-decoration: none; font-weight: 500; text-align: center; }
    .apply-btn { background: #2563eb; color: #fff; border: none; }
    .secondary-btn { background: #f1f5f9; color: #1e293b; border: 1px solid #cbd5e1; }
    .icon-btn { background: #fff; color: #334155; border: 1px solid #cbd5e1; }

    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,0.6);
      display: flex; align-items: center; justify-content: center; z-index: 1000;
      padding: 12px;
      box-sizing: border-box;
    }
    .modal-card {
      background: #fff; border-radius: 12px; max-width: 600px; width: 100%; max-height: 85vh;
      overflow-y: auto; padding: 20px; box-sizing: border-box;
    }
    .modal-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px; margin-bottom: 14px; }
    .modal-header h2 { margin: 0; font-size: 1.15rem; color: #0f172a; }
    .close-btn { font-size: 1.5rem; background: none; border: none; cursor: pointer; line-height: 1; color: #64748b; }
    .breakdown-list { list-style: none; padding: 0; margin: 0 0 14px 0; }
    .breakdown-list li { padding: 4px 0; border-bottom: 1px dashed #f1f5f9; font-size: 0.85rem; }
    .desc-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; font-size: 0.82rem; max-height: 180px; overflow-y: auto; white-space: pre-wrap; line-height: 1.4; }

    /* Mobile & Telegram Mini App Optimizations (<= 768px) */
    @media (max-width: 768px) {
      .filters-toolbar { padding: 12px; gap: 10px; }
      .filters-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .select-control {
        width: 100%;
        font-size: 0.78rem;
        padding: 8px 6px;
      }
      .jobs-grid {
        grid-template-columns: 1fr;
        gap: 12px;
      }
      .job-card {
        padding: 14px;
      }
      .actions-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        width: 100%;
      }
      .actions-row .btn {
        width: 100%;
        box-sizing: border-box;
        padding: 8px 6px;
        font-size: 0.78rem;
      }
      .modal-card {
        padding: 16px;
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
