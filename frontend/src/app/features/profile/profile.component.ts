import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { CandidateProfile, ParsedCVResult } from '../../core/models/job.model';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="profile-view">
      <header class="profile-header">
        <h1>👤 Candidate Profile & CV Management</h1>
        <p class="subtitle">
          Manage your verified candidate profile. Confirmed skills earn up to 25 points in job matching.
        </p>
      </header>

      <div *ngIf="successMessage()" class="alert success-alert">
        <span>✅ {{ successMessage() }}</span>
        <button (click)="successMessage.set('')" class="close-alert">&times;</button>
      </div>

      <div class="profile-layout">
        <!-- Main Profile Form -->
        <section class="panel profile-form">
          <h2>Core Candidate Facts</h2>

          <div class="form-row">
            <div class="form-group">
              <label>Full Name</label>
              <input type="text" [(ngModel)]="fullName" placeholder="e.g. Abdelrahman Emam" class="input-control" />
            </div>
            <div class="form-group">
              <label>Base Country</label>
              <input type="text" [ngModel]="profile()?.country" readonly class="input-control readonly" />
            </div>
          </div>

          <div class="form-group">
            <label>Professional Summary</label>
            <textarea
              [(ngModel)]="professionalSummary"
              rows="3"
              placeholder="Summary of frontend/engineering background..."
              class="textarea-control"
            ></textarea>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>University / Institution</label>
              <input type="text" [(ngModel)]="educationInst" class="input-control" />
            </div>
            <div class="form-group">
              <label>Years of Professional Experience</label>
              <input type="number" step="0.5" [(ngModel)]="experienceYears" placeholder="e.g. 1.0" class="input-control" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Degree Title</label>
              <input type="text" [(ngModel)]="degreeTitle" placeholder="e.g. B.Sc. Computer and Information Technology" class="input-control" />
            </div>
            <div class="form-group">
              <label>Graduation Year</label>
              <input type="number" [(ngModel)]="gradYear" placeholder="e.g. 2026" class="input-control" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>LinkedIn URL</label>
              <input type="text" [(ngModel)]="linkedinUrl" class="input-control" />
            </div>
            <div class="form-group">
              <label>GitHub URL</label>
              <input type="text" [(ngModel)]="githubUrl" placeholder="https://github.com/..." class="input-control" />
            </div>
          </div>

          <!-- Strict Skill Boundaries -->
          <div class="skills-section">
            <div class="skills-header">
              <h3>Verified Confirmed Skills (Earns up to 25 pts)</h3>
              <span class="count-badge">{{ confirmedSkills().length }} skills</span>
            </div>
            <p class="section-hint">Verified from your uploaded CV or portfolio. Direct contributor to match score.</p>
            <div class="chips-container">
              <span *ngFor="let s of confirmedSkills(); let i = index" class="chip confirmed">
                {{ s }} <button (click)="removeSkill('confirmed', i)" class="remove-chip">&times;</button>
              </span>
            </div>
            <div class="add-skill-row">
              <input type="text" [(ngModel)]="newConfirmedSkill" (keyup.enter)="addSkill('confirmed')" placeholder="Add verified skill (e.g. RxJS)..." class="input-control small" />
              <button (click)="addSkill('confirmed')" class="btn secondary-btn">Add Verified</button>
            </div>
          </div>

          <div class="skills-section">
            <div class="skills-header">
              <h3>Target Skills (Learning Goals)</h3>
              <span class="count-badge">{{ targetSkills().length }} skills</span>
            </div>
            <p class="section-hint">Skills you target or aspire to work with. Does not artificially inflate confirmed score.</p>
            <div class="chips-container">
              <span *ngFor="let s of targetSkills(); let i = index" class="chip target">
                {{ s }} <button (click)="removeSkill('target', i)" class="remove-chip">&times;</button>
              </span>
            </div>
            <div class="add-skill-row">
              <input type="text" [(ngModel)]="newTargetSkill" (keyup.enter)="addSkill('target')" placeholder="Add target skill..." class="input-control small" />
              <button (click)="addSkill('target')" class="btn secondary-btn">Add Target</button>
            </div>
          </div>

          <!-- Projects & Experience Highlights -->
          <div *ngIf="projects().length > 0" class="sub-section">
            <h3>Verified Projects ({{ projects().length }})</h3>
            <div class="cards-list">
              <div *ngFor="let p of projects()" class="sub-card">
                <strong>{{ p.name }}</strong>
                <p class="tech-row" *ngIf="p.technologies?.length">
                  <small>{{ p.technologies.join(', ') }}</small>
                </p>
                <ul *ngIf="p.bullets?.length">
                  <li *ngFor="let b of p.bullets.slice(0, 2)">{{ b }}</li>
                </ul>
              </div>
            </div>
          </div>

          <div *ngIf="experiences().length > 0" class="sub-section">
            <h3>Work & Trainee Experience ({{ experiences().length }})</h3>
            <div class="cards-list">
              <div *ngFor="let exp of experiences()" class="sub-card">
                <strong>{{ exp.role }}</strong> • <span>{{ exp.company }}</span>
                <small class="date-text" *ngIf="exp.start_date || exp.end_date">({{ exp.start_date }} - {{ exp.end_date }})</small>
                <ul *ngIf="exp.bullets?.length">
                  <li *ngFor="let b of exp.bullets.slice(0, 2)">{{ b }}</li>
                </ul>
              </div>
            </div>
          </div>

          <div class="form-actions">
            <button (click)="saveProfile()" class="btn primary-btn">Save Changes</button>
            <button (click)="exportProfile()" class="btn secondary-btn">Export Profile JSON</button>
          </div>
        </section>

        <!-- CV Upload & Local Extraction Panel -->
        <section class="panel cv-import-panel">
          <h2>📄 Upload & Parse CV Locally</h2>
          <p class="panel-hint">
            Supports <strong>PDF</strong>, <strong>DOCX</strong>, and plain text. Text is extracted 100% locally on your system without transmitting your CV to external AI providers.
          </p>

          <!-- File Upload Dropzone -->
          <div class="upload-dropzone" [class.dragging]="isDragging" (dragover)="onDragOver($event)" (dragleave)="isDragging=false" (drop)="onDrop($event)">
            <input type="file" #fileInput (change)="onFileSelected($event)" accept=".pdf,.docx,.txt" class="hidden-file-input" />
            <div class="dropzone-content" (click)="fileInput.click()">
              <span class="upload-icon">📁</span>
              <strong>Click to upload or drag & drop</strong>
              <small>PDF or DOCX (max 10MB)</small>
            </div>
          </div>

          <div *ngIf="selectedFileName" class="selected-file-badge">
            <span>📄 {{ selectedFileName }}</span>
            <button (click)="clearSelectedFile()" class="clear-btn">&times;</button>
          </div>

          <div class="or-divider"><span>OR PASTE RAW TEXT</span></div>

          <textarea
            [(ngModel)]="rawCvText"
            rows="5"
            placeholder="Paste your plain CV text here..."
            class="textarea-control"
          ></textarea>

          <button
            (click)="triggerParse()"
            [disabled]="isParsing() || (!selectedFile && !rawCvText.trim())"
            class="btn primary-btn full-width parse-btn"
          >
            {{ isParsing() ? '⏳ Parsing CV Locally...' : '🔍 Parse CV Locally' }}
          </button>
        </section>
      </div>

      <!-- REVIEW SCREEN / MODAL BEFORE SAVING -->
      <div *ngIf="parsedCvResult()" class="modal-backdrop" (click)="parsedCvResult.set(null)">
        <div class="modal-card review-modal" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>📋 Review Extracted CV Data Before Saving</h2>
            <button (click)="parsedCvResult.set(null)" class="close-btn">&times;</button>
          </div>

          <div class="modal-body">
            <div class="review-notice">
              <p>
                <strong>Privacy Protected:</strong> Text was parsed locally. Inspect, adjust, or remove any information before updating your profile.
              </p>
            </div>

            <div class="review-section">
              <h3>Personal & Professional Details</h3>
              <div class="review-grid">
                <div>
                  <label>Full Name</label>
                  <input type="text" [(ngModel)]="reviewData.full_name" class="input-control" />
                </div>
                <div>
                  <label>University</label>
                  <input type="text" [(ngModel)]="reviewData.education_institution" class="input-control" />
                </div>
                <div>
                  <label>Degree Title</label>
                  <input type="text" [(ngModel)]="reviewData.degree_title" class="input-control" />
                </div>
                <div>
                  <label>Graduation Year</label>
                  <input type="number" [(ngModel)]="reviewData.graduation_year" class="input-control" />
                </div>
                <div>
                  <label>Estimated Experience Years</label>
                  <input type="number" step="0.5" [(ngModel)]="reviewData.experience_years" class="input-control" />
                </div>
                <div>
                  <label>LinkedIn</label>
                  <input type="text" [(ngModel)]="reviewData.linkedin_url" class="input-control" />
                </div>
                <div>
                  <label>GitHub</label>
                  <input type="text" [(ngModel)]="reviewData.github_url" class="input-control" />
                </div>
              </div>
            </div>

            <div class="review-section">
              <h3>Professional Summary</h3>
              <textarea [(ngModel)]="reviewData.professional_summary" rows="3" class="textarea-control"></textarea>
            </div>

            <!-- Confirmed Skills Review -->
            <div class="review-section">
              <div class="skills-header">
                <h3>Detected Confirmed Skills ({{ reviewData.confirmed_skills.length }})</h3>
                <small>Click &times; to remove any skill you don't wish to confirm</small>
              </div>
              <div class="chips-container">
                <span *ngFor="let s of reviewData.confirmed_skills; let i = index" class="chip confirmed">
                  {{ s }} <button (click)="removeReviewSkill(i)" class="remove-chip">&times;</button>
                </span>
              </div>
            </div>

            <!-- Target Skills Review -->
            <div class="review-section">
              <h3>Target Skills</h3>
              <div class="chips-container">
                <span *ngFor="let s of reviewData.target_skills" class="chip target">{{ s }}</span>
              </div>
            </div>

            <!-- Projects Review -->
            <div class="review-section" *ngIf="reviewData.projects.length">
              <h3>Detected Projects ({{ reviewData.projects.length }})</h3>
              <div *ngFor="let p of reviewData.projects" class="review-sub-card">
                <strong>{{ p.name }}</strong>
                <p><small>{{ p.technologies?.join(', ') }}</small></p>
              </div>
            </div>

            <!-- Experience Review -->
            <div class="review-section" *ngIf="reviewData.experiences.length">
              <h3>Detected Experience ({{ reviewData.experiences.length }})</h3>
              <div *ngFor="let exp of reviewData.experiences" class="review-sub-card">
                <strong>{{ exp.role }}</strong> • {{ exp.company }} ({{ exp.start_date }} - {{ exp.end_date }})
              </div>
            </div>

            <!-- Certifications Review -->
            <div class="review-section" *ngIf="reviewData.certifications.length">
              <h3>Certifications ({{ reviewData.certifications.length }})</h3>
              <div *ngFor="let c of reviewData.certifications" class="review-sub-card">
                <strong>{{ c.name }}</strong> <span *ngIf="c.score">({{ c.score }})</span>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button (click)="parsedCvResult.set(null)" class="btn secondary-btn">Cancel</button>
            <button (click)="confirmAndSaveProfile()" [disabled]="isSaving()" class="btn success-btn">
              {{ isSaving() ? 'Saving...' : '✅ Confirm & Save to Profile' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .profile-view { display: flex; flex-direction: column; gap: 20px; }
    .profile-header h1 { margin: 0 0 4px 0; font-size: 1.5rem; color: #0f172a; }
    .subtitle { margin: 0; color: #64748b; font-size: 0.95rem; }

    .alert { padding: 12px 16px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; }
    .success-alert { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; font-weight: 500; }
    .close-alert { background: none; border: none; font-size: 1.2rem; cursor: pointer; color: inherit; }

    .profile-layout {
      display: grid;
      grid-template-columns: 3fr 2fr;
      gap: 24px;
    }
    @media (max-width: 960px) {
      .profile-layout { grid-template-columns: 1fr; }
    }

    .panel {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 24px;
    }
    .panel h2 { margin: 0 0 16px 0; font-size: 1.2rem; color: #0f172a; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; }

    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 14px; }
    @media (max-width: 600px) { .form-row { grid-template-columns: 1fr; } }

    .form-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
    .form-group label { font-size: 0.85rem; font-weight: 600; color: #475569; }
    .input-control {
      padding: 9px 12px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 0.9rem;
    }
    .input-control.readonly { background: #f8fafc; color: #64748b; }
    .input-control.small { max-width: 260px; }

    .skills-section, .sub-section {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
    }
    .skills-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
    .skills-header h3, .sub-section h3 { margin: 0; font-size: 0.95rem; color: #1e293b; }
    .count-badge { font-size: 0.75rem; background: #e2e8f0; padding: 2px 8px; border-radius: 12px; font-weight: 600; color: #475569; }
    .section-hint { margin: 0 0 12px 0; font-size: 0.8rem; color: #64748b; }

    .chips-container { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
    .chip {
      font-size: 0.8rem;
      padding: 4px 10px;
      border-radius: 20px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .chip.confirmed { background: #dcfce7; color: #166534; font-weight: 600; }
    .chip.target { background: #dbeafe; color: #1e40af; font-weight: 600; }
    .remove-chip { background: none; border: none; cursor: pointer; font-size: 1rem; color: #64748b; line-height: 1; }

    .add-skill-row { display: flex; gap: 8px; }

    .cards-list { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }
    .sub-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; font-size: 0.85rem; }
    .sub-card strong { color: #1e293b; }
    .tech-row { margin: 4px 0; color: #2563eb; }
    .date-text { color: #64748b; margin-left: 6px; }
    .sub-card ul { margin: 6px 0 0 0; padding-left: 18px; color: #475569; }

    .form-actions { display: flex; gap: 12px; margin-top: 20px; }
    .btn { padding: 9px 18px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.9rem; }
    .primary-btn { background: #2563eb; color: #fff; border: none; }
    .primary-btn:hover:not(:disabled) { background: #1d4ed8; }
    .secondary-btn { background: #f1f5f9; border: 1px solid #cbd5e1; color: #1e293b; }
    .success-btn { background: #16a34a; color: #fff; border: none; }
    .success-btn:hover:not(:disabled) { background: #15803d; }
    .full-width { width: 100%; }

    .panel-hint { font-size: 0.85rem; color: #64748b; margin-bottom: 14px; }
    .textarea-control {
      width: 100%;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 10px;
      font-family: inherit;
      font-size: 0.85rem;
      box-sizing: border-box;
      margin-bottom: 12px;
    }

    .upload-dropzone {
      border: 2px dashed #cbd5e1;
      border-radius: 8px;
      background: #f8fafc;
      padding: 24px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
      margin-bottom: 14px;
    }
    .upload-dropzone:hover, .upload-dropzone.dragging { border-color: #2563eb; background: #eff6ff; }
    .hidden-file-input { display: none; }
    .dropzone-content { display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .upload-icon { font-size: 2rem; }
    .dropzone-content small { color: #64748b; }

    .selected-file-badge {
      display: flex; justify-content: space-between; align-items: center;
      background: #e0f2fe; color: #0369a1; padding: 6px 12px; border-radius: 6px; font-size: 0.85rem;
      margin-bottom: 12px; font-weight: 500;
    }
    .clear-btn { background: none; border: none; cursor: pointer; font-size: 1.1rem; color: #0369a1; }

    .or-divider { text-align: center; margin: 12px 0; border-bottom: 1px solid #e2e8f0; line-height: 0.1em; }
    .or-divider span { background: #fff; padding: 0 10px; color: #94a3b8; font-size: 0.75rem; font-weight: 600; }

    /* Modal / Review Screen */
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,0.6);
      display: flex; align-items: center; justify-content: center; z-index: 1000;
    }
    .modal-card.review-modal {
      background: #fff; border-radius: 12px; max-width: 750px; width: 95%; max-height: 90vh;
      display: flex; flex-direction: column; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.2);
    }
    .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 18px 24px; border-bottom: 1px solid #f1f5f9; }
    .modal-header h2 { margin: 0; font-size: 1.15rem; color: #0f172a; }
    .close-btn { font-size: 1.5rem; background: none; border: none; cursor: pointer; color: #64748b; }
    .modal-body { padding: 20px 24px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 16px; }
    .modal-footer { padding: 16px 24px; border-top: 1px solid #f1f5f9; display: flex; justify-content: flex-end; gap: 12px; }

    .review-notice { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 10px 14px; font-size: 0.85rem; color: #1e40af; }
    .review-notice p { margin: 0; }
    .review-section { border-bottom: 1px solid #f1f5f9; padding-bottom: 14px; }
    .review-section:last-child { border-bottom: none; }
    .review-section h3 { margin: 0 0 10px 0; font-size: 0.95rem; color: #1e293b; }
    .review-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 600px) { .review-grid { grid-template-columns: 1fr; } }
    .review-sub-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; margin-bottom: 8px; font-size: 0.85rem; }
    .review-sub-card p { margin: 4px 0 0 0; }
  `],
})
export class ProfileComponent implements OnInit {
  private readonly api = inject(ApiService);

  profile = signal<CandidateProfile | null>(null);
  confirmedSkills = signal<string[]>([]);
  targetSkills = signal<string[]>([]);
  projects = signal<any[]>([]);
  experiences = signal<any[]>([]);

  fullName: string = '';
  professionalSummary: string = '';
  educationInst: string = '';
  experienceYears: number | null = null;
  degreeTitle: string = '';
  gradYear: number | null = null;
  linkedinUrl: string = '';
  githubUrl: string = '';

  newConfirmedSkill: string = '';
  newTargetSkill: string = '';

  selectedFile: File | null = null;
  selectedFileName: string = '';
  rawCvText: string = '';
  isDragging = false;
  isParsing = signal<boolean>(false);
  isSaving = signal<boolean>(false);
  successMessage = signal<string>('');

  parsedCvResult = signal<ParsedCVResult | null>(null);

  // Review screen bound state
  reviewData: any = {
    full_name: '',
    professional_summary: '',
    education_institution: '',
    degree_title: '',
    graduation_year: null,
    experience_years: null,
    linkedin_url: '',
    github_url: '',
    confirmed_skills: [],
    target_skills: [],
    learning_or_exposure_skills: [],
    experiences: [],
    educations: [],
    projects: [],
    certifications: [],
    languages: [],
    soft_skills: [],
  };

  ngOnInit(): void {
    this.loadProfile();
  }

  loadProfile(): void {
    this.api.getProfile().subscribe({
      next: (p) => {
        this.profile.set(p);
        this.fullName = p.full_name || '';
        this.professionalSummary = p.professional_summary || '';
        this.confirmedSkills.set(p.confirmed_skills || []);
        this.targetSkills.set(p.target_skills || []);
        this.educationInst = p.education_institution || '';
        this.experienceYears = p.experience_years;
        this.degreeTitle = p.degree_title || '';
        this.gradYear = p.graduation_year;
        this.linkedinUrl = p.linkedin_url || '';
        this.githubUrl = p.github_url || '';
        this.projects.set(p.projects || []);
        this.experiences.set(p.experiences || []);
      },
    });
  }

  onFileSelected(event: any): void {
    const file = event.target.files?.[0];
    if (file) {
      this.selectedFile = file;
      this.selectedFileName = file.name;
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = true;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      this.selectedFile = file;
      this.selectedFileName = file.name;
    }
  }

  clearSelectedFile(): void {
    this.selectedFile = null;
    this.selectedFileName = '';
  }

  triggerParse(): void {
    this.isParsing.set(true);
    const obs = this.selectedFile
      ? this.api.uploadCvFile(this.selectedFile)
      : this.api.uploadCvText(this.rawCvText);

    obs.subscribe({
      next: (result) => {
        this.isParsing.set(false);
        this.parsedCvResult.set(result);

        // Populate review model
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
      error: (err) => {
        this.isParsing.set(false);
        alert('Failed to parse CV: ' + (err.error?.detail || err.message));
      },
    });
  }

  removeReviewSkill(index: number): void {
    this.reviewData.confirmed_skills.splice(index, 1);
  }

  confirmAndSaveProfile(): void {
    this.isSaving.set(true);
    this.api.confirmCvData(this.reviewData).subscribe({
      next: (res) => {
        this.isSaving.set(false);
        this.parsedCvResult.set(null);
        this.selectedFile = null;
        this.selectedFileName = '';
        this.rawCvText = '';
        this.successMessage.set('CV confirmed! Your verified skills, experience, and education are now active in job matching.');
        this.loadProfile();
      },
      error: (err) => {
        this.isSaving.set(false);
        alert('Error saving profile: ' + (err.error?.detail || err.message));
      },
    });
  }

  addSkill(type: 'confirmed' | 'target'): void {
    if (type === 'confirmed' && this.newConfirmedSkill.trim()) {
      this.confirmedSkills.update((list) => [...list, this.newConfirmedSkill.trim()]);
      this.newConfirmedSkill = '';
    } else if (type === 'target' && this.newTargetSkill.trim()) {
      this.targetSkills.update((list) => [...list, this.newTargetSkill.trim()]);
      this.newTargetSkill = '';
    }
  }

  removeSkill(type: 'confirmed' | 'target', index: number): void {
    if (type === 'confirmed') {
      this.confirmedSkills.update((list) => list.filter((_, i) => i !== index));
    } else {
      this.targetSkills.update((list) => list.filter((_, i) => i !== index));
    }
  }

  saveProfile(): void {
    this.api
      .updateProfile({
        full_name: this.fullName,
        professional_summary: this.professionalSummary,
        education_institution: this.educationInst,
        experience_years: this.experienceYears,
        degree_title: this.degreeTitle || null,
        graduation_year: this.gradYear,
        linkedin_url: this.linkedinUrl,
        github_url: this.githubUrl,
        confirmed_skills: this.confirmedSkills(),
        target_skills: this.targetSkills(),
      })
      .subscribe({
        next: () => {
          this.successMessage.set('Profile changes saved successfully.');
          this.loadProfile();
        },
      });
  }

  exportProfile(): void {
    this.api.getProfile().subscribe({
      next: (p) => {
        const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'candidate-profile.json';
        a.click();
      },
    });
  }
}
