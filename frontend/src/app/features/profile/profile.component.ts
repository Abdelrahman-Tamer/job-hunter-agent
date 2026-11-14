import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { TelegramService } from '../../core/services/telegram.service';
import { IconComponent } from '../../core/components/icon/icon.component';
import { CandidateProfile, ParsedCVResult } from '../../core/models/job.model';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
    <div class="profile-view">
      <!-- Header -->
      <header class="profile-header">
        <div>
          <h1>Candidate Profile</h1>
          <p class="subtitle">Your background, technical skills, and target criteria used to match opportunities</p>
        </div>
      </header>

      <!-- Alert -->
      <div *ngIf="successMessage()" class="alert-box" role="status">
        <app-icon name="check-circle" [size]="16" class="alert-icon"></app-icon>
        <span class="alert-text">{{ successMessage() }}</span>
        <button (click)="successMessage.set('')" class="alert-close" aria-label="Dismiss">
          <app-icon name="x" [size]="14"></app-icon>
        </button>
      </div>

      <div class="profile-grid">
        <!-- Main Profile Form -->
        <section class="panel profile-form-panel" aria-labelledby="core-info-title">
          <div class="panel-header">
            <h2 id="core-info-title">Candidate Details</h2>
          </div>

          <div class="form-row-2">
            <div class="form-group">
              <label for="fullName">Full Name</label>
              <input id="fullName" type="text" [(ngModel)]="fullName" placeholder="e.g. Abdelrahman Emam" class="form-input" />
            </div>
            <div class="form-group">
              <label for="baseCountry">Base Country</label>
              <input id="baseCountry" type="text" [ngModel]="profile()?.country" readonly class="form-input readonly-input" />
            </div>
          </div>

          <div class="form-group">
            <label for="profSummary">Professional Summary</label>
            <textarea
              id="profSummary"
              [(ngModel)]="professionalSummary"
              rows="3"
              placeholder="Frontend Engineer specializing in Angular and modern TypeScript..."
              class="form-textarea"
            ></textarea>
          </div>

          <div class="form-row-2">
            <div class="form-group">
              <label for="eduInst">University / Institution</label>
              <input id="eduInst" type="text" [(ngModel)]="educationInst" class="form-input" />
            </div>
            <div class="form-group">
              <label for="expYears">Years of Experience</label>
              <input id="expYears" type="number" step="0.5" [(ngModel)]="experienceYears" placeholder="e.g. 1.0" class="form-input" />
            </div>
          </div>

          <div class="form-row-2">
            <div class="form-group">
              <label for="degreeTitle">Degree Title</label>
              <input id="degreeTitle" type="text" [(ngModel)]="degreeTitle" class="form-input" />
            </div>
            <div class="form-group">
              <label for="gradYear">Graduation Year</label>
              <input id="gradYear" type="number" [(ngModel)]="gradYear" class="form-input" />
            </div>
          </div>

          <div class="form-row-2">
            <div class="form-group">
              <label for="linkedin">LinkedIn</label>
              <input id="linkedin" type="text" [(ngModel)]="linkedinUrl" class="form-input" />
            </div>
            <div class="form-group">
              <label for="github">GitHub</label>
              <input id="github" type="text" [(ngModel)]="githubUrl" placeholder="https://github.com/..." class="form-input" />
            </div>
          </div>

          <!-- Verified Confirmed Skills -->
          <div class="skills-block">
            <div class="skills-header">
              <div class="skills-title">
                <app-icon name="check-circle" [size]="15" class="icon-verified"></app-icon>
                <h3>Verified Confirmed Skills (Earns up to 25 pts)</h3>
              </div>
              <span class="badge badge-green">{{ confirmedSkills().length }}</span>
            </div>
            <p class="skills-hint">Verified from your CV or portfolio. Direct contributor to job match score.</p>
            <div class="chips-wrap">
              <span *ngFor="let s of confirmedSkills(); let i = index" class="skill-chip confirmed">
                <span>{{ s }}</span>
                <button (click)="removeSkill('confirmed', i)" class="chip-delete" aria-label="Remove skill">
                  <app-icon name="x" [size]="12"></app-icon>
                </button>
              </span>
            </div>
            <div class="add-chip-row">
              <input
                type="text"
                [(ngModel)]="newConfirmedSkill"
                (keyup.enter)="addSkill('confirmed')"
                placeholder="Add verified skill (RxJS, Tailwind)..."
                class="form-input add-chip-input"
              />
              <button (click)="addSkill('confirmed')" class="btn btn-secondary btn-sm">
                <span>Add</span>
              </button>
            </div>
          </div>

          <!-- Target Skills -->
          <div class="skills-block">
            <div class="skills-header">
              <div class="skills-title">
                <app-icon name="sparkles" [size]="15" class="icon-target"></app-icon>
                <h3>Target Skills (Learning Goals)</h3>
              </div>
              <span class="badge badge-blue">{{ targetSkills().length }}</span>
            </div>
            <p class="skills-hint">Skills you target or aspire to work with. Kept separate from confirmed score.</p>
            <div class="chips-wrap">
              <span *ngFor="let s of targetSkills(); let i = index" class="skill-chip target">
                <span>{{ s }}</span>
                <button (click)="removeSkill('target', i)" class="chip-delete" aria-label="Remove target skill">
                  <app-icon name="x" [size]="12"></app-icon>
                </button>
              </span>
            </div>
            <div class="add-chip-row">
              <input
                type="text"
                [(ngModel)]="newTargetSkill"
                (keyup.enter)="addSkill('target')"
                placeholder="Add target skill..."
                class="form-input add-chip-input"
              />
              <button (click)="addSkill('target')" class="btn btn-secondary btn-sm">
                <span>Add</span>
              </button>
            </div>
          </div>

          <!-- Form Actions -->
          <div class="panel-footer-actions">
            <button (click)="saveProfile()" class="btn btn-primary">
              <span>Save Profile</span>
            </button>
            <button (click)="exportProfile()" class="btn btn-outline">
              <app-icon name="file-text" [size]="14"></app-icon>
              <span>Export JSON</span>
            </button>
          </div>
        </section>

        <!-- CV Upload & Local Parser Panel -->
        <section class="panel cv-parser-panel" aria-labelledby="cv-upload-title">
          <div class="panel-header">
            <h2 id="cv-upload-title">Local CV Parser</h2>
          </div>
          <p class="panel-hint">Supports PDF, DOCX, and text. Extracted 100% locally on your machine.</p>

          <!-- Dropzone -->
          <div
            class="dropzone"
            [class.dragover]="isDragging"
            (dragover)="onDragOver($event)"
            (dragleave)="isDragging = false"
            (drop)="onDrop($event)"
          >
            <app-icon name="upload-cloud" [size]="36" class="dropzone-icon"></app-icon>
            <div class="dropzone-text">
              <p class="dropzone-lead">
                <strong>Drag & drop CV file here</strong>
              </p>
              <p class="dropzone-sub">PDF, DOCX, TXT</p>
            </div>
            <label class="btn btn-secondary btn-sm file-picker-label">
              <span>Browse File</span>
              <input type="file" (change)="onFileSelected($event)" accept=".pdf,.docx,.txt" class="hidden-input" />
            </label>
          </div>

          <div *ngIf="selectedFileName" class="selected-file-pill">
            <app-icon name="file-text" [size]="14"></app-icon>
            <span class="file-name">{{ selectedFileName }}</span>
            <button (click)="clearSelectedFile()" class="chip-delete" aria-label="Clear file">
              <app-icon name="x" [size]="12"></app-icon>
            </button>
          </div>

          <!-- Plain Text Fallback -->
          <div class="text-fallback">
            <label for="rawText">Or paste raw CV text:</label>
            <textarea
              id="rawText"
              [(ngModel)]="rawCvText"
              rows="4"
              placeholder="Paste plain text CV here..."
              class="form-textarea"
            ></textarea>
          </div>

          <button
            (click)="triggerParse()"
            [disabled]="isParsing() || (!selectedFile && !rawCvText)"
            class="btn btn-primary parse-btn"
          >
            <app-icon [name]="isParsing() ? 'refresh' : 'sparkles'" [size]="15" [class.spin]="isParsing()"></app-icon>
            <span>{{ isParsing() ? 'Extracting...' : 'Extract & Parse CV' }}</span>
          </button>
        </section>
      </div>

      <!-- CV Review Modal -->
      <div
        *ngIf="parsedCvResult()"
        class="modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-title"
      >
        <div class="modal-dialog review-modal">
          <div class="modal-header">
            <h2 id="review-title">Review Extracted CV Facts</h2>
            <button (click)="parsedCvResult.set(null)" class="alert-close" aria-label="Close">
              <app-icon name="x" [size]="18"></app-icon>
            </button>
          </div>

          <div class="modal-body">
            <p class="modal-desc">Review the facts extracted from your CV before applying them to your profile.</p>

            <div class="review-section">
              <h4>Confirmed Skills</h4>
              <div class="chips-wrap">
                <span *ngFor="let s of reviewData.confirmed_skills; let i = index" class="skill-chip confirmed">
                  <span>{{ s }}</span>
                  <button (click)="removeReviewSkill(i)" class="chip-delete">&times;</button>
                </span>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button (click)="confirmAndSaveProfile()" [disabled]="isSaving()" class="btn btn-primary">
              <app-icon [name]="isSaving() ? 'refresh' : 'check'" [size]="14" [class.spin]="isSaving()"></app-icon>
              <span>{{ isSaving() ? 'Saving...' : 'Confirm & Apply to Profile' }}</span>
            </button>
            <button (click)="parsedCvResult.set(null)" class="btn btn-secondary">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .profile-view {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      width: 100%;
    }

    .profile-header h1 {
      font-size: var(--text-2xl);
      letter-spacing: -0.025em;
      margin-bottom: 2px;
    }
    .subtitle {
      font-size: var(--text-sm);
      color: var(--color-text-secondary);
      margin: 0;
    }

    /* Alert */
    .alert-box {
      display: flex;
      align-items: center;
      gap: var(--space-2-5);
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-md);
      background-color: var(--color-success-bg);
      border: 1px solid var(--color-success-border);
      color: var(--color-success-text);
      font-size: var(--text-sm);
    }
    .alert-icon {
      color: var(--color-success-text);
    }
    .alert-text {
      flex: 1;
    }
    .alert-close {
      background: transparent;
      border: none;
      color: var(--color-success-text);
      cursor: pointer;
      display: flex;
      align-items: center;
    }

    /* Grid Layout */
    .profile-grid {
      display: grid;
      grid-template-columns: 2fr 1.2fr;
      gap: var(--space-4);
      width: 100%;
    }

    .panel-header {
      border-bottom: 1px solid var(--color-border-subtle);
      padding-bottom: var(--space-3);
      margin-bottom: var(--space-4);
    }
    .panel-header h2 {
      font-size: var(--text-base);
      font-weight: 600;
      margin: 0;
    }
    .panel-hint {
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
      margin-bottom: var(--space-4);
    }

    .form-row-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-3);
      margin-bottom: var(--space-3-5);
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 5px;
      margin-bottom: var(--space-3-5);
    }
    .form-group label {
      font-size: var(--text-xs);
      font-weight: 600;
      color: var(--color-text-secondary);
    }
    .readonly-input {
      background-color: var(--color-bg-surface-elevated);
      color: var(--color-text-muted);
      cursor: not-allowed;
    }

    /* Skills Blocks */
    .skills-block {
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md);
      padding: var(--space-3-5);
      background-color: var(--color-bg-surface-elevated-glass);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      margin-bottom: var(--space-4);
    }
    .skills-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2px;
    }
    .skills-title {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .skills-title h3 {
      font-size: var(--text-sm);
      margin: 0;
    }
    .icon-verified { color: var(--color-success-text); }
    .icon-target { color: var(--color-brand-accent); }
    .skills-hint {
      font-size: var(--text-2xs);
      color: var(--color-text-muted);
      margin-bottom: var(--space-3);
    }
    .chips-wrap {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: var(--space-3);
    }
    .skill-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 8px;
      border-radius: var(--radius-pill);
      font-size: var(--text-xs);
      font-weight: 500;
      border: 1px solid var(--color-border-default);
      background: var(--color-bg-surface-muted);
      color: var(--color-text-primary);
    }
    .skill-chip.confirmed {
      border-color: var(--color-success-border);
      color: var(--color-success-text);
      background-color: var(--color-success-bg);
    }
    .skill-chip.target {
      border-color: var(--color-brand-border);
      color: var(--color-brand-accent);
      background-color: var(--color-brand-subtle);
    }
    .chip-delete {
      background: transparent;
      border: none;
      color: inherit;
      cursor: pointer;
      display: flex;
      align-items: center;
      padding: 0;
      opacity: 0.7;
    }
    .chip-delete:hover {
      opacity: 1;
    }
    .add-chip-row {
      display: flex;
      gap: var(--space-2);
    }
    .add-chip-input {
      font-size: var(--text-xs);
      padding: 6px 10px;
    }

    .panel-footer-actions {
      display: flex;
      gap: var(--space-3);
      border-top: 1px solid var(--color-border-subtle);
      padding-top: var(--space-4);
      margin-top: var(--space-2);
    }

    /* Dropzone */
    .dropzone {
      border: 2px dashed var(--color-border-default);
      border-radius: var(--radius-lg);
      padding: var(--space-6) var(--space-4);
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2-5);
      background-color: var(--color-bg-surface-elevated-glass);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      transition: border-color var(--motion-fast), background-color var(--motion-fast);
      cursor: pointer;
    }
    .dropzone:hover, .dropzone.dragover {
      border-color: var(--color-brand-accent);
      background-color: var(--color-brand-subtle);
    }
    .dropzone-icon {
      color: var(--color-text-muted);
    }
    .dropzone-lead {
      font-size: var(--text-sm);
      color: var(--color-text-primary);
      margin: 0;
    }
    .dropzone-sub {
      font-size: var(--text-2xs);
      color: var(--color-text-muted);
      margin: 0;
    }
    .file-picker-label {
      cursor: pointer;
      margin-top: var(--space-1);
    }
    .hidden-input {
      display: none;
    }
    .selected-file-pill {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      background: var(--color-brand-subtle);
      border: 1px solid var(--color-brand-border);
      border-radius: var(--radius-sm);
      font-size: var(--text-xs);
      color: var(--color-brand-accent);
      margin-top: var(--space-2-5);
    }
    .selected-file-pill .file-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .text-fallback {
      margin-top: var(--space-4);
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .text-fallback label {
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
    }
    .parse-btn {
      width: 100%;
      margin-top: var(--space-3-5);
    }

    .modal-desc {
      font-size: var(--text-sm);
      color: var(--color-text-secondary);
      margin-bottom: var(--space-4);
    }
    .review-section h4 {
      font-size: var(--text-xs);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: var(--space-2);
    }

    .spin {
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* Mobile */
    @media (max-width: 768px) {
      .profile-grid {
        grid-template-columns: 1fr;
      }
      .form-row-2 {
        grid-template-columns: 1fr;
        gap: 0;
      }
      .panel-footer-actions {
        flex-direction: column;
      }
      .panel-footer-actions .btn {
        width: 100%;
      }
    }
  `],
})
export class ProfileComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly telegram = inject(TelegramService);

  profile = signal<CandidateProfile | null>(null);
  confirmedSkills = signal<string[]>([]);
  targetSkills = signal<string[]>([]);
  projects = signal<any[]>([]);
  experiences = signal<any[]>([]);

  fullName: string = '';
  professionalSummary: string = '';
  educationInst: string = '';
  degreeTitle: string = '';
  gradYear: number = 2026;
  experienceYears: number = 1.0;
  linkedinUrl: string = '';
  githubUrl: string = '';

  newConfirmedSkill: string = '';
  newTargetSkill: string = '';

  selectedFile: File | null = null;
  selectedFileName: string = '';
  rawCvText: string = '';
  isDragging: boolean = false;
  isParsing = signal<boolean>(false);
  isSaving = signal<boolean>(false);
  successMessage = signal<string>('');
  parsedCvResult = signal<ParsedCVResult | null>(null);

  reviewData: any = {};

  ngOnInit(): void {
    this.loadProfile();
  }

  loadProfile(): void {
    this.api.getProfile().subscribe({
      next: (p) => {
        this.profile.set(p);
        this.fullName = p.full_name || '';
        this.professionalSummary = p.professional_summary || '';
        this.educationInst = p.education_institution || '';
        this.degreeTitle = p.degree_title || '';
        this.gradYear = p.graduation_year || 2026;
        this.experienceYears = p.experience_years ?? 1.0;
        this.linkedinUrl = p.linkedin_url || '';
        this.githubUrl = p.github_url || '';
        this.confirmedSkills.set([...(p.confirmed_skills || [])]);
        this.targetSkills.set([...(p.target_skills || [])]);
        this.projects.set(p.projects || []);
        this.experiences.set(p.experiences || []);
      },
    });
  }

  addSkill(type: 'confirmed' | 'target'): void {
    if (type === 'confirmed') {
      const s = this.newConfirmedSkill.trim();
      if (s && !this.confirmedSkills().includes(s)) {
        this.confirmedSkills.update((list) => [...list, s]);
        this.newConfirmedSkill = '';
      }
    } else {
      const s = this.newTargetSkill.trim();
      if (s && !this.targetSkills().includes(s)) {
        this.targetSkills.update((list) => [...list, s]);
        this.newTargetSkill = '';
      }
    }
  }

  removeSkill(type: 'confirmed' | 'target', index: number): void {
    this.telegram.haptic('light');
    if (type === 'confirmed') {
      this.confirmedSkills.update((list) => list.filter((_, i) => i !== index));
    } else {
      this.targetSkills.update((list) => list.filter((_, i) => i !== index));
    }
  }

  saveProfile(): void {
    this.telegram.haptic('medium');
    this.api
      .updateProfile({
        full_name: this.fullName,
        professional_summary: this.professionalSummary,
        education_institution: this.educationInst,
        degree_title: this.degreeTitle,
        graduation_year: this.gradYear,
        experience_years: this.experienceYears,
        linkedin_url: this.linkedinUrl,
        github_url: this.githubUrl,
        confirmed_skills: this.confirmedSkills(),
        target_skills: this.targetSkills(),
      })
      .subscribe({
        next: () => {
          this.telegram.haptic('success');
          this.successMessage.set('Profile successfully saved and active in matching algorithm.');
          setTimeout(() => this.successMessage.set(''), 4000);
          this.loadProfile();
        },
      });
  }

  exportProfile(): void {
    this.telegram.haptic('light');
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(this.profile(), null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', 'candidate_profile.json');
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
      this.selectedFileName = file.name;
    }
  }

  clearSelectedFile(): void {
    this.selectedFile = null;
    this.selectedFileName = '';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = true;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
    if (event.dataTransfer?.files?.length) {
      this.selectedFile = event.dataTransfer.files[0];
      this.selectedFileName = this.selectedFile.name;
    }
  }

  triggerParse(): void {
    this.telegram.haptic('medium');
    this.isParsing.set(true);

    const obs = this.selectedFile
      ? this.api.uploadCvFile(this.selectedFile)
      : this.api.uploadCvText(this.rawCvText);

    obs.subscribe({
      next: (result: ParsedCVResult) => {
        this.telegram.haptic('success');
        this.isParsing.set(false);
        this.parsedCvResult.set(result);
        this.reviewData = {
          full_name: result.personal_info.full_name || this.fullName || 'Abdelrahman Emam',
          professional_summary: result.professional_summary || this.professionalSummary || '',
          education_institution: result.educations?.[0]?.institution || this.educationInst || 'Egyptian E-Learning University (EELU)',
          degree_title: result.educations?.[0]?.degree || this.degreeTitle || 'B.Sc. Computer and Information Technology',
          graduation_year: result.educations?.[0]?.graduation_year || this.gradYear || 2026,
          experience_years: result.experience_years ?? this.experienceYears ?? 1.0,
          linkedin_url: result.personal_info.linkedin_url || this.linkedinUrl || 'https://www.linkedin.com/in/abd-el-rahman-emam',
          github_url: result.personal_info.github_url || this.githubUrl || '',
          confirmed_skills: [...result.confirmed_skills],
          target_skills: [...result.target_skills],
          learning_or_exposure_skills: [...result.learning_or_exposure_skills],
          experiences: result.experiences || [],
          educations: result.educations || [],
          projects: result.projects || [],
          certifications: result.certifications || [],
          languages: result.languages || [],
          soft_skills: result.soft_skills || [],
        };
      },
      error: (err: any) => {
        this.isParsing.set(false);
        this.successMessage.set('Failed to parse CV: ' + (err.error?.detail || err.message));
      },
    });
  }

  removeReviewSkill(index: number): void {
    this.telegram.haptic('light');
    this.reviewData.confirmed_skills.splice(index, 1);
  }

  confirmAndSaveProfile(): void {
    this.isSaving.set(true);
    this.telegram.haptic('medium');
    this.api.confirmCvData(this.reviewData).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.parsedCvResult.set(null);
        this.selectedFile = null;
        this.selectedFileName = '';
        this.rawCvText = '';
        this.telegram.haptic('success');
        this.successMessage.set('CV confirmed! Your verified skills, experience, and education are now active in job matching.');
        setTimeout(() => this.successMessage.set(''), 4000);
        this.loadProfile();
      },
      error: (err: any) => {
        this.isSaving.set(false);
        this.successMessage.set('Error saving profile: ' + (err.error?.detail || err.message));
      },
    });
  }
}
