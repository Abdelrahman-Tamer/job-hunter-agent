import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { TelegramService } from '../../core/services/telegram.service';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent } from '../../core/components/icon/icon.component';
import { CandidateProfile, ParsedCVResult } from '../../core/models/job.model';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
    <div class="profile-view">
      <!-- Executive Header -->
      <header class="profile-header">
        <div>
          <h1>Candidate Intelligence Profile</h1>
          <p class="subtitle">Your technical background, verified competencies, and targeting criteria used by the matching engine</p>
        </div>
      </header>

      <!-- Success Alert Pill -->
      <div *ngIf="successMessage()" class="alert-box" role="status">
        <app-icon name="check-circle" [size]="16" class="alert-icon"></app-icon>
        <span class="alert-text">{{ successMessage() }}</span>
        <button (click)="successMessage.set('')" class="alert-close" aria-label="Dismiss">
          <app-icon name="x" [size]="14"></app-icon>
        </button>
      </div>

      <!-- Match Readiness Diagnostic Gauge -->
      <section class="readiness-banner card" aria-label="Match readiness meter">
        <div class="gauge-left">
          <div class="readiness-meter-circle">
            <span class="meter-num">{{ calculateCompleteness() }}%</span>
            <span class="meter-sub">Engine Fit</span>
          </div>
          <div class="readiness-text">
            <h3>Candidate Profile Calibrated</h3>
            <p>
              Your verified skills, experience, and educational background directly fuel the daily Telegram digest and match scoring.
            </p>
          </div>
        </div>

        <div class="gauge-actions">
          <button (click)="saveProfile()" class="btn btn-primary">
            <app-icon name="check" [size]="14"></app-icon>
            <span>Save Changes</span>
          </button>
          <button (click)="exportProfile()" class="btn btn-outline" title="Export Profile as JSON">
            <app-icon name="file-text" [size]="14"></app-icon>
            <span>Export JSON</span>
          </button>
        </div>
      </section>

      <div class="profile-grid">
        <!-- Main Candidate Details Form -->
        <section class="panel profile-form-panel" aria-labelledby="core-info-title">
          <div class="panel-header">
            <div class="panel-title-wrap">
              <app-icon name="user" [size]="16" class="panel-icon-accent"></app-icon>
              <h2 id="core-info-title">Candidate Details</h2>
            </div>
            <span class="verified-seal">
              <app-icon name="shield-check" [size]="13"></app-icon>
              <span>Verified Identity</span>
            </span>
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
              placeholder="Frontend Engineer specializing in Angular, TypeScript, and modern web architectures..."
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
              <label for="linkedin">LinkedIn Profile URL</label>
              <input id="linkedin" type="text" [(ngModel)]="linkedinUrl" class="form-input" />
            </div>
            <div class="form-group">
              <label for="github">GitHub Profile URL</label>
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
              <span class="badge badge-green">{{ confirmedSkills().length }} Verified</span>
            </div>
            <p class="skills-hint">Extracted and confirmed from your CV or portfolio. Direct contributor to matching algorithms.</p>

            <div class="chips-wrap">
              <span *ngFor="let s of confirmedSkills(); let i = index" class="skill-chip confirmed">
                <app-icon name="check" [size]="11"></app-icon>
                <span>{{ s }}</span>
                <button (click)="removeSkill('confirmed', i)" class="chip-delete" aria-label="Remove skill">
                  <app-icon name="x" [size]="12"></app-icon>
                </button>
              </span>
            </div>

            <!-- Quick Add Chips Suggestions -->
            <div class="quick-suggest-row">
              <span class="suggest-label">Suggested:</span>
              <div class="suggest-chips">
                <button
                  *ngFor="let sug of popularSuggestions"
                  (click)="quickAddSkill('confirmed', sug)"
                  [disabled]="confirmedSkills().includes(sug)"
                  class="suggest-pill"
                >
                  <app-icon name="plus" [size]="10"></app-icon>
                  <span>{{ sug }}</span>
                </button>
              </div>
            </div>

            <div class="add-chip-row">
              <input
                type="text"
                [(ngModel)]="newConfirmedSkill"
                (keyup.enter)="addSkill('confirmed')"
                placeholder="Add custom skill (RxJS, Tailwind, Jest)..."
                class="form-input add-chip-input"
              />
              <button (click)="addSkill('confirmed')" class="btn btn-secondary btn-sm">
                <span>Add Skill</span>
              </button>
            </div>
          </div>

          <!-- Target Skills -->
          <div class="skills-block">
            <div class="skills-header">
              <div class="skills-title">
                <app-icon name="sparkles" [size]="15" class="icon-target"></app-icon>
                <h3>Target Learning Goals</h3>
              </div>
              <span class="badge badge-blue">{{ targetSkills().length }} Goals</span>
            </div>
            <p class="skills-hint">Technologies you aspire to work with. Kept separate from confirmed score.</p>

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
                placeholder="Add target technology goal..."
                class="form-input add-chip-input"
              />
              <button (click)="addSkill('target')" class="btn btn-secondary btn-sm">
                <span>Add Goal</span>
              </button>
            </div>
          </div>
        </section>

        <!-- CV Upload & Local Parser Panel -->
        <section class="panel cv-parser-panel" aria-labelledby="cv-upload-title">
          <div class="panel-header">
            <div class="panel-title-wrap">
              <app-icon name="upload-cloud" [size]="16" class="panel-icon-accent"></app-icon>
              <h2 id="cv-upload-title">Local CV Intelligence Parser</h2>
            </div>
          </div>

          <div class="privacy-seal-pill">
            <app-icon name="shield-check" [size]="13" class="text-green"></app-icon>
            <span>100% Local Processing · No PII Cloud Storage</span>
          </div>

          <!-- Dropzone -->
          <div
            class="dropzone"
            [class.dragover]="isDragging"
            (dragover)="onDragOver($event)"
            (dragleave)="isDragging = false"
            (drop)="onDrop($event)"
          >
            <div class="dropzone-icon-wrap">
              <app-icon name="upload-cloud" [size]="32" class="dropzone-icon"></app-icon>
            </div>
            <div class="dropzone-text">
              <p class="dropzone-lead">
                <strong>Drag & drop your CV resume</strong>
              </p>
              <p class="dropzone-sub">Supports PDF, DOCX, and TXT documents</p>
            </div>
            <label class="btn btn-secondary btn-sm file-picker-label">
              <app-icon name="file-text" [size]="13"></app-icon>
              <span>Choose Document</span>
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
            <label for="rawText">Or paste plain CV text directly:</label>
            <textarea
              id="rawText"
              [(ngModel)]="rawCvText"
              rows="4"
              placeholder="Paste plain text résumé content here..."
              class="form-textarea"
            ></textarea>
          </div>

          <button
            (click)="triggerParse()"
            [disabled]="isParsing() || (!selectedFile && !rawCvText)"
            class="btn btn-primary parse-btn"
          >
            <app-icon [name]="isParsing() ? 'refresh' : 'sparkles'" [size]="15" [class.spin]="isParsing()"></app-icon>
            <span>{{ isParsing() ? 'Extracting Technical Facts...' : 'Extract & Parse Skills' }}</span>
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
            <div class="modal-title-wrap">
              <app-icon name="check-circle" [size]="18" class="text-green"></app-icon>
              <h2 id="review-title">Review Extracted Facts</h2>
            </div>
            <button (click)="parsedCvResult.set(null)" class="alert-close" aria-label="Close">
              <app-icon name="x" [size]="18"></app-icon>
            </button>
          </div>

          <div class="modal-body">
            <p class="modal-desc">
              Review and confirm the technical skills extracted from your resume before applying them to your active candidate profile.
            </p>

            <div class="review-section">
              <h4>Extracted Confirmed Skills</h4>
              <div class="chips-wrap">
                <span *ngFor="let s of reviewData.confirmed_skills; let i = index" class="skill-chip confirmed">
                  <app-icon name="check" [size]="11"></app-icon>
                  <span>{{ s }}</span>
                  <button (click)="removeReviewSkill(i)" class="chip-delete">&times;</button>
                </span>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button (click)="confirmAndSaveProfile()" [disabled]="isSaving()" class="btn btn-primary">
              <app-icon [name]="isSaving() ? 'refresh' : 'check'" [size]="14" [class.spin]="isSaving()"></app-icon>
              <span>{{ isSaving() ? 'Applying...' : 'Confirm & Apply to Profile' }}</span>
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
      font-weight: 500;
    }
    .alert-icon { color: var(--color-success-text); }
    .alert-text { flex: 1; }
    .alert-close {
      background: transparent;
      border: none;
      color: var(--color-success-text);
      cursor: pointer;
      display: flex;
      align-items: center;
    }

    /* Match Readiness Gauge Banner */
    .readiness-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-4);
      padding: var(--space-4) var(--space-5);
      background: var(--color-bg-surface-glass);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
    }
    .gauge-left {
      display: flex;
      align-items: center;
      gap: var(--space-4);
    }
    .readiness-meter-circle {
      width: 58px;
      height: 58px;
      border-radius: var(--radius-full);
      background: var(--color-bg-surface-elevated);
      border: 2px solid var(--color-success);
      box-shadow: 0 0 14px rgba(16, 185, 129, 0.25);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .meter-num {
      font-size: var(--text-sm);
      font-weight: 800;
      font-family: var(--font-mono);
      color: var(--color-success-text);
      line-height: 1;
    }
    .meter-sub {
      font-size: 8px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted);
      margin-top: 2px;
    }
    .readiness-text h3 {
      font-size: var(--text-base);
      font-weight: 700;
      margin: 0 0 3px 0;
    }
    .readiness-text p {
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
      margin: 0;
      max-width: 560px;
      line-height: 1.4;
    }
    .gauge-actions {
      display: flex;
      align-items: center;
      gap: var(--space-2-5);
      flex-shrink: 0;
    }

    /* Grid Layout */
    .profile-grid {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(0, 1.2fr);
      gap: var(--space-4);
      width: 100%;
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--color-border-subtle);
      padding-bottom: var(--space-3);
      margin-bottom: var(--space-4);
    }
    .panel-title-wrap {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .panel-title-wrap h2 {
      font-size: var(--text-base);
      font-weight: 700;
      margin: 0;
    }
    .panel-icon-accent {
      color: var(--color-brand-accent);
    }
    .verified-seal {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: var(--text-2xs);
      font-weight: 600;
      color: var(--color-success-text);
      background: var(--color-success-bg);
      border: 1px solid var(--color-success-border);
      padding: 2px 7px;
      border-radius: var(--radius-pill);
    }

    .privacy-seal-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: var(--text-2xs);
      color: var(--color-text-secondary);
      background: var(--color-bg-surface-elevated);
      border: 1px solid var(--color-border-subtle);
      padding: 4px 10px;
      border-radius: var(--radius-pill);
      margin-bottom: var(--space-3);
      font-weight: 500;
    }

    .form-row-2 {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-3);
      margin-bottom: var(--space-3);
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: var(--space-3);
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
      margin-bottom: var(--space-3-5);
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
      font-weight: 700;
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
      padding: 3px 9px;
      border-radius: var(--radius-pill);
      font-size: var(--text-xs);
      font-weight: 600;
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
    .chip-delete:hover { opacity: 1; }

    /* Quick Suggest Chips */
    .quick-suggest-row {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin-bottom: var(--space-3);
      flex-wrap: wrap;
    }
    .suggest-label {
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 700;
      color: var(--color-text-muted);
      letter-spacing: 0.04em;
    }
    .suggest-chips {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }
    .suggest-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      padding: 2px 7px;
      border-radius: var(--radius-pill);
      background: var(--color-bg-surface-muted);
      border: 1px solid var(--color-border-subtle);
      color: var(--color-text-secondary);
      cursor: pointer;
      transition: all var(--motion-fast);
    }
    .suggest-pill:hover:not(:disabled) {
      border-color: var(--color-brand-border);
      color: var(--color-brand-accent);
      background: var(--color-brand-subtle);
    }
    .suggest-pill:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }

    .add-chip-row {
      display: flex;
      gap: var(--space-2);
    }
    .add-chip-input {
      font-size: var(--text-xs);
      padding: 6px 10px;
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
    .dropzone-icon-wrap {
      width: 48px;
      height: 48px;
      border-radius: var(--radius-full);
      background: var(--color-bg-surface-muted);
      border: 1px solid var(--color-border-subtle);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .dropzone-icon {
      color: var(--color-brand-accent);
    }
    .dropzone-lead {
      font-size: var(--text-sm);
      color: var(--color-text-primary);
      margin: 0;
    }
    .dropzone-sub {
      font-size: var(--text-2xs);
      color: var(--color-text-muted);
      margin: 2px 0 0 0;
    }
    .file-picker-label {
      cursor: pointer;
      margin-top: var(--space-1);
    }
    .hidden-input { display: none; }
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
      margin-top: var(--space-3-5);
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .text-fallback label {
      font-size: var(--text-xs);
      font-weight: 600;
      color: var(--color-text-secondary);
    }
    .parse-btn {
      width: 100%;
      margin-top: var(--space-3-5);
    }

    .modal-title-wrap {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .modal-desc {
      font-size: var(--text-sm);
      color: var(--color-text-secondary);
      margin-bottom: var(--space-4);
      line-height: 1.45;
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

    @media (max-width: 768px) {
      .readiness-banner {
        flex-direction: column;
        align-items: stretch;
      }
      .gauge-actions .btn {
        flex: 1;
      }
      .profile-grid {
        grid-template-columns: 1fr;
      }
      .form-row-2 {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class ProfileComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly telegram = inject(TelegramService);
  private readonly toast = inject(ToastService);

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

  readonly popularSuggestions: string[] = [
    'Angular',
    'TypeScript',
    'RxJS',
    'NgRx',
    'Tailwind CSS',
    'JavaScript',
    'REST APIs',
    'Git',
    'Node.js',
    'Docker',
  ];

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

  calculateCompleteness(): number {
    let score = 30; // baseline
    if (this.fullName) score += 10;
    if (this.professionalSummary) score += 15;
    if (this.educationInst) score += 10;
    if (this.confirmedSkills().length >= 3) score += 20;
    if (this.confirmedSkills().length >= 6) score += 10;
    if (this.linkedinUrl || this.githubUrl) score += 5;
    return Math.min(score, 100);
  }

  addSkill(type: 'confirmed' | 'target'): void {
    if (type === 'confirmed') {
      const s = this.newConfirmedSkill.trim();
      if (s && !this.confirmedSkills().includes(s)) {
        this.confirmedSkills.update((list) => [...list, s]);
        this.newConfirmedSkill = '';
        this.telegram.haptic('selection');
      }
    } else {
      const s = this.newTargetSkill.trim();
      if (s && !this.targetSkills().includes(s)) {
        this.targetSkills.update((list) => [...list, s]);
        this.newTargetSkill = '';
        this.telegram.haptic('selection');
      }
    }
  }

  quickAddSkill(type: 'confirmed' | 'target', skill: string): void {
    if (type === 'confirmed' && !this.confirmedSkills().includes(skill)) {
      this.confirmedSkills.update((list) => [...list, skill]);
      this.telegram.haptic('selection');
      this.toast.show(`Added ${skill} to verified skills`, 'success', 1500);
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
          this.toast.show('Profile successfully saved & active in matching algorithm.', 'success');
          this.loadProfile();
        },
        error: () => this.toast.show('Failed to save profile', 'error'),
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
    this.toast.show('Profile JSON exported', 'info', 1500);
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
      this.selectedFileName = file.name;
      this.toast.show(`Selected ${file.name}`, 'info', 1500);
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
      this.toast.show(`Dropped ${this.selectedFile.name}`, 'info', 1500);
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
        this.toast.show('Failed to parse CV: ' + (err.error?.detail || err.message), 'error');
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
        this.toast.show('CV facts confirmed & applied to profile!', 'success');
        this.loadProfile();
      },
      error: (err: any) => {
        this.isSaving.set(false);
        this.toast.show('Error saving profile: ' + (err.error?.detail || err.message), 'error');
      },
    });
  }
}
