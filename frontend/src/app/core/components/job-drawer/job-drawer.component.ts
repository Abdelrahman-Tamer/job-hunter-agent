import { Component, EventEmitter, Input, Output, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { TelegramService } from '../../services/telegram.service';
import { IconComponent } from '../icon/icon.component';
import { JobDetail, JobSummary, ApplicationStatus } from '../../models/job.model';

@Component({
  selector: 'app-job-drawer',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <div
      class="drawer-backdrop"
      (click)="onBackdropClick($event)"
      [class.open]="isOpen"
      role="dialog"
      aria-modal="true"
      [attr.aria-label]="job?.title || 'Job details'"
    >
      <div class="drawer-container" (click)="$event.stopPropagation()">
        <!-- Drawer Header -->
        <header class="drawer-header">
          <div class="header-brand-wrap">
            <span class="drawer-company-avatar">{{ job?.company?.charAt(0) || 'J' }}</span>
            <div class="header-titles">
              <span class="company-subtext">{{ job?.company }}</span>
              <h2 class="drawer-title">{{ job?.title }}</h2>
            </div>
          </div>

          <div class="header-actions-row">
            <button
              (click)="copyJobLink()"
              class="btn-icon-control"
              [title]="copied() ? 'Copied!' : 'Copy link'"
              aria-label="Copy job application link"
            >
              <app-icon [name]="copied() ? 'check' : 'copy'" [size]="16"></app-icon>
            </button>
            <button
              (click)="close()"
              class="btn-icon-control btn-close"
              aria-label="Close drawer"
            >
              <app-icon name="x" [size]="18"></app-icon>
            </button>
          </div>
        </header>

        <!-- Drawer Body Content -->
        <div class="drawer-body">
          <!-- Loading Detail Indicator -->
          <div *ngIf="isLoadingDetail()" class="loading-bar-wrap">
            <div class="loading-bar"></div>
          </div>

          <!-- Match Score & Key Telemetry Banner -->
          <section class="telemetry-banner" aria-label="Match score and telemetry">
            <div class="match-score-card" [class.excellent]="(job?.match_score || 0) >= 80" [class.strong]="(job?.match_score || 0) >= 70 && (job?.match_score || 0) < 80">
              <div class="score-circle">
                <span class="score-num">{{ roundScore(job?.match_score || 0) }}%</span>
                <span class="score-sub">Match</span>
              </div>
              <div class="score-meta">
                <span class="score-badge-text">
                  <app-icon name="sparkles" [size]="12"></app-icon>
                  {{ (job?.match_score || 0) >= 80 ? 'Top Tier Match' : (job?.match_score || 0) >= 70 ? 'Strong Candidate Fit' : 'Relevant Opportunity' }}
                </span>
                <span class="score-explanation">
                  {{ jobDetail()?.eligibility_reason || 'Verified match calculated against your candidate profile.' }}
                </span>
              </div>
            </div>

            <!-- Key Tags Grid -->
            <div class="key-tags-grid">
              <div class="tag-card">
                <span class="tag-label">Eligibility</span>
                <span class="tag-value text-green">
                  <app-icon name="globe" [size]="12"></app-icon>
                  {{ formatEligibility(job?.eligibility) }}
                </span>
              </div>
              <div class="tag-card">
                <span class="tag-label">Workplace</span>
                <span class="tag-value">
                  <app-icon name="building" [size]="12"></app-icon>
                  {{ formatWorkplace(job?.workplace_type) }}
                </span>
              </div>
              <div class="tag-card">
                <span class="tag-label">Seniority</span>
                <span class="tag-value">
                  <app-icon name="user" [size]="12"></app-icon>
                  {{ formatSeniority(job?.seniority) }}
                </span>
              </div>
              <div class="tag-card" *ngIf="job?.raw_location">
                <span class="tag-label">Location</span>
                <span class="tag-value text-muted-truncate">
                  <app-icon name="map-pin" [size]="12"></app-icon>
                  {{ job?.raw_location }}
                </span>
              </div>
            </div>
          </section>

          <!-- Application Stage Switcher -->
          <section class="pipeline-stage-section" aria-label="Pipeline stage management">
            <div class="section-heading-row">
              <div class="section-title-wrap">
                <app-icon name="bookmark" [size]="14"></app-icon>
                <h3>Pipeline Status</h3>
              </div>
              <span class="current-status-pill" [attr.data-status]="currentStatus()">
                {{ formatStatus(currentStatus()) }}
              </span>
            </div>

            <div class="stages-pill-group" role="radiogroup" aria-label="Change stage">
              <button
                *ngFor="let s of availableStages"
                (click)="setJobStatus(s.status)"
                [class.selected]="currentStatus() === s.status"
                class="stage-select-btn"
                [attr.data-stage]="s.status"
              >
                <span>{{ s.label }}</span>
              </button>
            </div>
          </section>

          <!-- Skills Alignment Matrix -->
          <section class="skills-matrix-section" aria-label="Skills alignment">
            <div class="section-heading-row">
              <div class="section-title-wrap">
                <app-icon name="check-circle" [size]="14" class="text-green"></app-icon>
                <h3>Matched Skills</h3>
              </div>
              <span class="skill-count">{{ matchedSkills().length }} aligned</span>
            </div>

            <div class="skills-pill-wrap" *ngIf="matchedSkills().length > 0">
              <span *ngFor="let skill of matchedSkills()" class="skill-pill matched">
                <app-icon name="check" [size]="11"></app-icon>
                <span>{{ skill }}</span>
              </span>
            </div>

            <!-- Skill Gaps / Learning Points -->
            <div class="gap-block" *ngIf="skillGaps().length > 0">
              <div class="section-heading-row gap-head">
                <div class="section-title-wrap">
                  <app-icon name="info" [size]="13" class="text-amber"></app-icon>
                  <h4>Requirements to Review</h4>
                </div>
                <span class="skill-count text-amber">{{ skillGaps().length }} to note</span>
              </div>
              <div class="skills-pill-wrap">
                <span *ngFor="let gap of skillGaps()" class="skill-pill gap">
                  <span>{{ gap }}</span>
                </span>
              </div>
            </div>
          </section>

          <!-- Job Description Body -->
          <section class="description-section" aria-label="Job description">
            <div class="section-heading-row">
              <div class="section-title-wrap">
                <app-icon name="file-text" [size]="14"></app-icon>
                <h3>Role Description</h3>
              </div>
              <span class="source-tag">Source: {{ job?.source_name }}</span>
            </div>

            <div class="description-content" *ngIf="jobDetail()?.description_text; else fallbackDesc">
              <p *ngFor="let paragraph of getParagraphs(jobDetail()?.description_text)">
                {{ paragraph }}
              </p>
            </div>
            <ng-template #fallbackDesc>
              <div class="description-content">
                <p>Curated software engineering opportunity matched by BottaJobs AI Agent.</p>
                <p>Click "Apply on Company Site" below to view the official posting and complete your submission.</p>
              </div>
            </ng-template>
          </section>
        </div>

        <!-- Sticky Drawer Footer Action Bar -->
        <footer class="drawer-footer">
          <div class="footer-left-info">
            <span class="first-seen" *ngIf="job?.first_seen_at">
              Discovered {{ job?.first_seen_at | date:'mediumDate' }}
            </span>
          </div>

          <div class="footer-buttons">
            <button
              (click)="toggleSave()"
              class="btn btn-secondary btn-save"
              [class.saved]="currentStatus() === 'SAVED'"
            >
              <app-icon [name]="currentStatus() === 'SAVED' ? 'check' : 'bookmark'" [size]="14"></app-icon>
              <span>{{ currentStatus() === 'SAVED' ? 'Saved' : 'Save Role' }}</span>
            </button>

            <a
              *ngIf="job?.original_application_url"
              [href]="job?.original_application_url"
              target="_blank"
              rel="noopener noreferrer"
              (click)="onApplyClick($event)"
              class="btn btn-primary btn-apply"
            >
              <span>Apply on Company Site</span>
              <app-icon name="external-link" [size]="14"></app-icon>
            </a>
          </div>
        </footer>
      </div>
    </div>
  `,
  styles: [`
    .drawer-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(4, 6, 12, 0.65);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      z-index: 200;
      display: flex;
      justify-content: flex-end;
      opacity: 0;
      pointer-events: none;
      transition: opacity var(--motion-base);
    }
    .drawer-backdrop.open {
      opacity: 1;
      pointer-events: auto;
    }

    .drawer-container {
      width: 100%;
      max-width: 620px;
      height: 100%;
      background: var(--color-bg-surface);
      border-left: 1px solid var(--color-border-default);
      box-shadow: -8px 0 32px rgba(0, 0, 0, 0.45);
      display: flex;
      flex-direction: column;
      transform: translateX(100%);
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      overflow: hidden;
    }
    .drawer-backdrop.open .drawer-container {
      transform: translateX(0);
    }

    /* Drawer Header */
    .drawer-header {
      padding: var(--space-4) var(--space-5);
      background: var(--color-bg-surface-elevated-glass);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--color-border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      flex-shrink: 0;
    }
    .header-brand-wrap {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      min-width: 0;
      flex: 1;
    }
    .drawer-company-avatar {
      width: 40px;
      height: 40px;
      border-radius: var(--radius-md);
      background: linear-gradient(135deg, rgba(37, 99, 235, 0.25) 0%, rgba(96, 165, 250, 0.15) 100%);
      border: 1px solid var(--color-brand-border);
      color: var(--color-brand-accent);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: var(--text-base);
      flex-shrink: 0;
      text-transform: uppercase;
    }
    .header-titles {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .company-subtext {
      font-size: var(--text-xs);
      font-weight: 600;
      color: var(--color-text-secondary);
      letter-spacing: 0.02em;
    }
    .drawer-title {
      font-size: var(--text-base);
      font-weight: 700;
      color: var(--color-text-primary);
      margin: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      letter-spacing: -0.02em;
    }
    .header-actions-row {
      display: flex;
      align-items: center;
      gap: var(--space-1-5);
      flex-shrink: 0;
    }
    .btn-icon-control {
      width: 34px;
      height: 34px;
      border-radius: var(--radius-md);
      background: transparent;
      border: 1px solid var(--color-border-subtle);
      color: var(--color-text-secondary);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all var(--motion-fast);
    }
    .btn-icon-control:hover {
      background: var(--color-bg-surface-elevated);
      color: var(--color-text-primary);
      border-color: var(--color-border-hover);
    }

    /* Drawer Body */
    .drawer-body {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-5);
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
    }

    .loading-bar-wrap {
      width: 100%;
      height: 3px;
      background: var(--color-bg-surface-elevated);
      border-radius: var(--radius-pill);
      overflow: hidden;
    }
    .loading-bar {
      width: 100%;
      height: 100%;
      background: var(--color-brand-primary);
      animation: pulseBar 1.2s infinite ease-in-out;
    }
    @keyframes pulseBar {
      0% { transform: translateX(-100%); }
      50% { transform: translateX(0%); }
      100% { transform: translateX(100%); }
    }

    /* Telemetry Banner */
    .telemetry-banner {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .match-score-card {
      background: var(--color-bg-surface-elevated-glass);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid var(--color-border-default);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
      display: flex;
      align-items: center;
      gap: var(--space-4);
      box-shadow: var(--shadow-xs);
    }
    .match-score-card.excellent {
      border-color: var(--color-success-border);
      background: linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(16, 20, 31, 0.6) 100%);
    }
    .match-score-card.strong {
      border-color: var(--color-brand-border);
      background: linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(16, 20, 31, 0.6) 100%);
    }

    .score-circle {
      width: 60px;
      height: 60px;
      border-radius: var(--radius-full);
      background: var(--color-bg-surface-muted);
      border: 2px solid var(--color-border-hover);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .excellent .score-circle {
      border-color: var(--color-success);
      box-shadow: 0 0 12px rgba(16, 185, 129, 0.25);
    }
    .strong .score-circle {
      border-color: var(--color-brand-primary);
      box-shadow: 0 0 12px rgba(37, 99, 235, 0.25);
    }

    .score-num {
      font-size: var(--text-base);
      font-weight: 800;
      font-family: var(--font-mono);
      line-height: 1;
      color: var(--color-text-primary);
    }
    .excellent .score-num { color: var(--color-success-text); }
    .strong .score-num { color: var(--color-brand-accent); }

    .score-sub {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted);
      margin-top: 2px;
    }
    .score-meta {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .score-badge-text {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: var(--text-xs);
      font-weight: 700;
      color: var(--color-text-primary);
    }
    .score-explanation {
      font-size: var(--text-2xs);
      color: var(--color-text-secondary);
      line-height: 1.4;
    }

    /* Key Tags Grid */
    .key-tags-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-2-5);
    }
    .tag-card {
      background: var(--color-bg-surface-elevated);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md);
      padding: var(--space-2-5) var(--space-3);
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .tag-label {
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 600;
      color: var(--color-text-muted);
      letter-spacing: 0.04em;
    }
    .tag-value {
      font-size: var(--text-xs);
      font-weight: 600;
      color: var(--color-text-primary);
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .text-green { color: var(--color-success-text); }
    .text-amber { color: var(--color-warning-text); }
    .text-muted-truncate {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Section Headings */
    .section-heading-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-3);
      padding-bottom: var(--space-1-5);
      border-bottom: 1px solid var(--color-border-subtle);
    }
    .section-title-wrap {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .section-title-wrap h3, .section-title-wrap h4 {
      font-size: var(--text-sm);
      font-weight: 700;
      color: var(--color-text-primary);
      margin: 0;
    }
    .source-tag, .skill-count {
      font-size: var(--text-2xs);
      color: var(--color-text-muted);
      font-family: var(--font-mono);
    }

    /* Pipeline Stage Picker */
    .pipeline-stage-section {
      background: var(--color-bg-surface-elevated-glass);
      border: 1px solid var(--color-border-default);
      border-radius: var(--radius-lg);
      padding: var(--space-3-5);
    }
    .current-status-pill {
      font-size: var(--text-2xs);
      font-family: var(--font-mono);
      font-weight: 700;
      padding: 2px 8px;
      border-radius: var(--radius-pill);
      background: var(--color-brand-subtle);
      color: var(--color-brand-accent);
      border: 1px solid var(--color-brand-border);
    }
    .stages-pill-group {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1-5);
    }
    .stage-select-btn {
      padding: 5px 11px;
      font-size: var(--text-xs);
      font-weight: 600;
      border-radius: var(--radius-pill);
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border-subtle);
      color: var(--color-text-secondary);
      cursor: pointer;
      transition: all var(--motion-fast);
    }
    .stage-select-btn:hover {
      border-color: var(--color-border-hover);
      color: var(--color-text-primary);
    }
    .stage-select-btn.selected {
      background: var(--color-brand-primary);
      color: #ffffff;
      border-color: var(--color-brand-primary);
      box-shadow: 0 1px 4px rgba(37, 99, 235, 0.4);
    }

    /* Skills Alignment */
    .skills-matrix-section {
      display: flex;
      flex-direction: column;
      gap: var(--space-2-5);
    }
    .skills-pill-wrap {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1-5);
    }
    .skill-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 9px;
      border-radius: var(--radius-pill);
      font-size: var(--text-xs);
      font-weight: 600;
    }
    .skill-pill.matched {
      background: var(--color-success-bg);
      border: 1px solid var(--color-success-border);
      color: var(--color-success-text);
    }
    .skill-pill.gap {
      background: var(--color-bg-surface-elevated);
      border: 1px solid var(--color-border-subtle);
      color: var(--color-text-secondary);
    }
    .gap-block {
      margin-top: var(--space-3);
    }
    .gap-head {
      margin-bottom: var(--space-2);
    }

    /* Description Content */
    .description-content {
      font-size: var(--text-sm);
      line-height: 1.65;
      color: var(--color-text-secondary);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      max-width: 100%;
      word-break: break-word;
    }

    /* Sticky Footer */
    .drawer-footer {
      padding: var(--space-4) var(--space-5);
      background: var(--color-bg-surface-elevated-glass);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-top: 1px solid var(--color-border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      flex-shrink: 0;
    }
    .footer-left-info {
      font-size: var(--text-2xs);
      color: var(--color-text-muted);
    }
    .footer-buttons {
      display: flex;
      align-items: center;
      gap: var(--space-2-5);
    }
    .btn-apply {
      padding: 9px 18px;
      font-weight: 600;
    }
    .btn-save.saved {
      background: var(--color-success-bg);
      border-color: var(--color-success-border);
      color: var(--color-success-text);
    }

    @media (max-width: 768px) {
      .drawer-container {
        max-width: 100%;
        height: 92vh;
        align-self: flex-end;
        border-radius: var(--radius-xl) var(--radius-xl) 0 0;
        border-left: none;
        border-top: 1px solid var(--color-border-default);
        transform: translateY(100%);
      }
      .drawer-backdrop.open .drawer-container {
        transform: translateY(0);
      }
      .drawer-header {
        padding: var(--space-3) var(--space-4);
      }
      .drawer-body {
        padding: var(--space-4);
      }
      .drawer-footer {
        padding: var(--space-3) var(--space-4);
        flex-direction: column-reverse;
        align-items: stretch;
      }
      .footer-buttons {
        width: 100%;
      }
      .footer-buttons .btn {
        flex: 1;
      }
    }
  `],
})
export class JobDrawerComponent implements OnInit {
  @Input() isOpen = false;
  @Input() job: JobSummary | JobDetail | null = null;
  @Output() closeDrawer = new EventEmitter<void>();
  @Output() statusUpdated = new EventEmitter<{ jobId: number; status: ApplicationStatus }>();

  private readonly api = inject(ApiService);
  private readonly telegram = inject(TelegramService);

  readonly isLoadingDetail = signal<boolean>(false);
  readonly jobDetail = signal<JobDetail | null>(null);
  readonly copied = signal<boolean>(false);
  readonly currentStatus = signal<ApplicationStatus>('DISCOVERED');

  readonly availableStages: { status: ApplicationStatus; label: string }[] = [
    { status: 'DISCOVERED', label: 'Discovered' },
    { status: 'SAVED', label: 'Saved' },
    { status: 'APPLIED', label: 'Applied' },
    { status: 'INTERVIEW', label: 'Interview' },
    { status: 'OFFER', label: 'Offer' },
    { status: 'ARCHIVED', label: 'Archived' },
  ];

  ngOnInit(): void {
    if (this.job) {
      this.initJobData();
    }
  }

  ngOnChanges(): void {
    if (this.job) {
      this.initJobData();
    }
  }

  private initJobData(): void {
    if (!this.job) return;
    this.currentStatus.set(this.job.tracker_status || 'DISCOVERED');

    // If it's already a full JobDetail
    if ('description_text' in this.job && this.job.description_text) {
      this.jobDetail.set(this.job as JobDetail);
    } else {
      this.loadDetail(this.job.id);
    }
  }

  private loadDetail(jobId: number): void {
    this.isLoadingDetail.set(true);
    this.api.getJobDetail(jobId).subscribe({
      next: (detail) => {
        this.jobDetail.set(detail);
        if (detail.tracker_status) {
          this.currentStatus.set(detail.tracker_status);
        }
        this.isLoadingDetail.set(false);
      },
      error: (err) => {
        console.warn('Could not load detailed job info:', err);
        this.isLoadingDetail.set(false);
      },
    });
  }

  close(): void {
    this.telegram.haptic('selection');
    this.closeDrawer.emit();
  }

  onBackdropClick(e: MouseEvent): void {
    this.close();
  }

  setJobStatus(status: ApplicationStatus): void {
    if (!this.job) return;
    this.telegram.haptic('medium');
    this.currentStatus.set(status);

    this.api.updateJobStatus(this.job.id, status).subscribe({
      next: () => {
        this.statusUpdated.emit({ jobId: this.job!.id, status });
      },
      error: (e) => console.error('Failed to update job status:', e),
    });
  }

  toggleSave(): void {
    const nextStatus = this.currentStatus() === 'SAVED' ? 'DISCOVERED' : 'SAVED';
    this.setJobStatus(nextStatus);
  }

  copyJobLink(): void {
    if (!this.job?.original_application_url) return;
    navigator.clipboard.writeText(this.job.original_application_url);
    this.telegram.haptic('selection');
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  onApplyClick(e: MouseEvent): void {
    if (this.job?.original_application_url) {
      this.telegram.haptic('medium');
      this.telegram.openExternalLink(this.job.original_application_url);
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
      case 'ENTRY': return 'Entry-level';
      default: return s || 'Engineer';
    }
  }

  formatStatus(st: string): string {
    return st.charAt(0) + st.slice(1).toLowerCase();
  }

  matchedSkills(): string[] {
    const req = this.job?.required_skills || [];
    const gaps = this.jobDetail()?.skill_gaps || [];
    return req.filter((s) => !gaps.includes(s));
  }

  skillGaps(): string[] {
    return this.jobDetail()?.skill_gaps || [];
  }

  getParagraphs(text?: string | null): string[] {
    if (!text) return [];
    return text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }
}
