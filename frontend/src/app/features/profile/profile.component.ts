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

      <!-- Success Alert -->
      <div *ngIf="successMessage()" class="alert-box" role="status">
        <app-icon name="check-circle" [size]="16" class="alert-icon"></app-icon>
        <span class="alert-text">{{ successMessage() }}</span>
        <button (click)="successMessage.set('')" class="alert-close" aria-label="Dismiss">
          <app-icon name="x" [size]="14"></app-icon>
        </button>
      </div>

      <!-- Architectural Calibration Bar -->
      <section class="calibration-strip card" aria-label="Match readiness telemetry">
        <div class="calibration-info">
          <div class="calibration-score-box">
            <span class="score-num">{{ calculateCompleteness() }}%</span>
            <span class="score-label">Engine Fit</span>
          </div>
          <div class="calibration-details">
            <div class="calibration-title-row">
              <h3>Profile Calibration Active</h3>
              <span class="badge badge-green">Engine Synced</span>
            </div>
            <p class="calibration-desc">
              Your verified skills, experience, and academic focus fuel the matching algorithm and Telegram dispatches.
            </p>
            <div class="calibration-progress-bar" role="progressbar" [attr.aria-valuenow]="calculateCompleteness()" aria-valuemin="0" aria-valuemax="100">
              <div class="progress-fill" [style.width.%]="calculateCompleteness()"></div>
            </div>
          </div>
        </div>

        <div class="calibration-actions">
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

      <!-- Two-Column Architectural Workspace -->
      <div class="profile-layout">
        <!-- Column 1: Candidate Specifications -->
        <div class="specs-column">
          <!-- Identity & Academic Credentials -->
          <section class="panel specs-panel" aria-labelledby="core-info-title">
            <div class="panel-header">
              <div class="panel-title-wrap">
                <app-icon name="user" [size]="16" class="panel-icon-accent"></app-icon>
                <h2 id="core-info-title">Identity & Academic Credentials</h2>
              </div>
              <span class="verified-tag">
                <app-icon name="shield-check" [size]="12"></app-icon>
                <span>Verified Identity</span>
              </span>
            </div>

            <div class="form-grid-2">
              <div class="form-group">
                <label for="fullName">Full Name</label>
                <input id="fullName" type="text" [(ngModel)]="fullName" placeholder="e.g. Abdelrahman Emam" class="form-input" />
              </div>
              <div class="form-group">
                <label for="baseCountry">Base Country</label>
                <input id="baseCountry" type="text" [ngModel]="profile()?.country || 'Egypt'" readonly class="form-input readonly-input" />
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

            <div class="form-grid-2">
              <div class="form-group">
                <label for="eduInst">University / Institution</label>
                <input id="eduInst" type="text" [(ngModel)]="educationInst" class="form-input" />
              </div>
              <div class="form-group">
                <label for="expYears">Years of Experience</label>
                <input id="expYears" type="number" step="0.5" [(ngModel)]="experienceYears" placeholder="e.g. 1.0" class="form-input" />
              </div>
            </div>

            <div class="form-grid-2">
              <div class="form-group">
                <label for="degreeTitle">Degree Title</label>
                <input id="degreeTitle" type="text" [(ngModel)]="degreeTitle" class="form-input" />
              </div>
              <div class="form-group">
                <label for="gradYear">Graduation Year</label>
                <input id="gradYear" type="number" [(ngModel)]="gradYear" class="form-input" />
              </div>
            </div>

            <div class="form-grid-2">
              <div class="form-group">
                <label for="linkedin">LinkedIn Profile URL</label>
                <input id="linkedin" type="text" [(ngModel)]="linkedinUrl" class="form-input" />
              </div>
              <div class="form-group">
                <label for="github">GitHub Profile URL</label>
                <input id="github" type="text" [(ngModel)]="githubUrl" placeholder="https://github.com/..." class="form-input" />
              </div>
            </div>
          </section>

          <!-- Verified Technical Stack Section -->
          <section class="panel skills-panel" aria-labelledby="skills-title">
            <div class="panel-header">
              <div class="panel-title-wrap">
                <app-icon name="check-circle" [size]="16" class="text-green"></app-icon>
                <h2 id="skills-title">Verified Technical Stack</h2>
              </div>
              <span class="badge badge-green">{{ confirmedSkills().length }} Verified</span>
            </div>
            <p class="panel-subtitle">Extracted and confirmed from your resume or verified repositories. Directly boosts matching scores.</p>

            <div class="skills-ledger">
              <div class="chips-flow">
                <span *ngFor="let s of confirmedSkills(); let i = index" class="tech-chip confirmed">
                  <app-icon name="check" [size]="11"></app-icon>
                  <span class="chip-text">{{ s }}</span>
                  <button (click)="removeSkill('confirmed', i)" class="chip-remove" aria-label="Remove skill">
                    <app-icon name="x" [size]="11"></app-icon>
                  </button>
                </span>
              </div>

              <!-- Quick Suggest Row -->
              <div class="suggest-strip">
                <span class="suggest-lead">Quick Add:</span>
                <div class="suggest-items">
                  <button
                    *ngFor="let sug of popularSuggestions"
                    (click)="quickAddSkill('confirmed', sug)"
                    [disabled]="confirmedSkills().includes(sug)"
                    class="suggest-tag"
                  >
                    <app-icon name="plus" [size]="10"></app-icon>
                    <span>{{ sug }}</span>
                  </button>
                </div>
              </div>

              <!-- Add Custom Skill Row -->
              <div class="add-skill-row">
                <input
                  type="text"
                  [(ngModel)]="newConfirmedSkill"
                  (keyup.enter)="addSkill('confirmed')"
                  placeholder="Add custom skill (e.g. RxJS, Tailwind, Jest)..."
                  class="form-input add-skill-input"
                />
                <button (click)="addSkill('confirmed')" class="btn btn-secondary btn-sm">
                  <span>Add Skill</span>
                </button>
              </div>
            </div>
          </section>

          <!-- Target Learning Goals Section -->
          <section class="panel goals-panel" aria-labelledby="goals-title">
            <div class="panel-header">
              <div class="panel-title-wrap">
                <app-icon name="sparkles" [size]="16" class="panel-icon-accent"></app-icon>
                <h2 id="goals-title">Target Learning Goals</h2>
              </div>
              <span class="badge badge-blue">{{ targetSkills().length }} Goals</span>
            </div>
            <p class="panel-subtitle">Technologies you aspire to master. Kept distinct from confirmed technical competence.</p>

            <div class="skills-ledger">
              <div class="chips-flow">
                <span *ngFor="let s of targetSkills(); let i = index" class="tech-chip target">
                  <span class="chip-text">{{ s }}</span>
                  <button (click)="removeSkill('target', i)" class="chip-remove" aria-label="Remove target skill">
                    <app-icon name="x" [size]="11"></app-icon>
                  </button>
                </span>
              </div>

              <div class="add-skill-row">
                <input
                  type="text"
                  [(ngModel)]="newTargetSkill"
                  (keyup.enter)="addSkill('target')"
                  placeholder="Add target technology goal..."
                  class="form-input add-skill-input"
                />
                <button (click)="addSkill('target')" class="btn btn-secondary btn-sm">
                  <span>Add Goal</span>
                </button>
              </div>
            </div>
          </section>
        </div>

        <!-- Column 2: Document Intelligence & Parser -->
        <div class="parser-column">
          <section class="panel parser-panel" aria-labelledby="cv-upload-title">
            <div class="panel-header">
              <div class="panel-title-wrap">
                <app-icon name="upload-cloud" [size]="16" class="panel-icon-accent"></app-icon>
                <h2 id="cv-upload-title">Resume Intelligence</h2>
              </div>
              <span class="privacy-badge">
                <app-icon name="shield-check" [size]="12" class="text-green"></app-icon>
                <span>Local Ingestion</span>
              </span>
            </div>

            <p class="panel-subtitle">
              Upload your CV to extract confirmed skills, degree facts, and project experience automatically.
            </p>

            <!-- Dropzone -->
            <div
              class="dropzone-box"
              [class.dragover]="isDragging"
              (dragover)="onDragOver($event)"
              (dragleave)="isDragging = false"
              (drop)="onDrop($event)"
            >
              <div class="dropzone-symbol">
                <app-icon name="upload-cloud" [size]="24"></app-icon>
              </div>
              <div class="dropzone-meta">
                <p class="dropzone-heading">Drop resume document here</p>
                <p class="dropzone-note">PDF, DOCX, or TXT (Max 10MB)</p>
              </div>
              <label class="btn btn-secondary btn-sm file-select-btn">
                <app-icon name="file-text" [size]="13"></app-icon>
                <span>Choose File</span>
                <input type="file" (change)="onFileSelected($event)" accept=".pdf,.docx,.txt" class="visually-hidden" />
              </label>
            </div>

            <!-- Selected File Badge -->
            <div *ngIf="selectedFileName" class="selected-file-row">
              <div class="file-info-group">
                <app-icon name="file-text" [size]="14"></app-icon>
                <span class="file-name">{{ selectedFileName }}</span>
              </div>
              <button (click)="clearSelectedFile()" class="chip-remove" aria-label="Clear file">
                <app-icon name="x" [size]="12"></app-icon>
              </button>
            </div>

            <!-- Plain Text Fallback -->
            <div class="paste-fallback">
              <label for="rawText">Or paste plain CV text:</label>
              <textarea
                id="rawText"
                [(ngModel)]="rawCvText"
                rows="4"
                placeholder="Paste plain text resume content directly..."
                class="form-textarea paste-area"
              ></textarea>
            </div>

            <button
              (click)="triggerParse()"
              [disabled]="isParsing() || (!selectedFile && !rawCvText)"
              class="btn btn-primary full-width-btn"
            >
              <app-icon [name]="isParsing() ? 'refresh' : 'sparkles'" [size]="14" [class.spin]="isParsing()"></app-icon>
              <span>{{ isParsing() ? 'Extracting Technical Facts...' : 'Extract & Parse Skills' }}</span>
            </button>
          </section>
        </div>
      </div>

      <!-- CV Review Modal Dialog -->
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
              <app-icon name="x" [size]="16"></app-icon>
            </button>
          </div>

          <div class="modal-body">
            <p class="modal-desc">
              Review and confirm the technical competencies discovered from your document before applying them to your candidate record.
            </p>

            <div class="modal-skill-section">
              <h4>Extracted Confirmed Skills ({{ reviewData.confirmed_skills?.length || 0 }})</h4>
              <div class="chips-flow">
                <span *ngFor="let s of reviewData.confirmed_skills; let i = index" class="tech-chip confirmed">
                  <app-icon name="check" [size]="11"></app-icon>
                  <span class="chip-text">{{ s }}</span>
                  <button (click)="removeReviewSkill(i)" class="chip-remove" aria-label="Remove skill">&times;</button>
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
      color: inherit;
      cursor: pointer;
      display: flex;
      align-items: center;
      padding: 0;
      opacity: 0.7;
      transition: opacity var(--motion-fast);
    }
    .alert-close:hover { opacity: 1; }

    /* Calibration Strip */
    .calibration-strip {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-4);
      padding: var(--space-4) var(--space-5);
      background: var(--color-bg-surface-elevated-glass);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 1px solid var(--color-border-default);
      border-radius: var(--radius-lg);
    }
    .calibration-info {
      display: flex;
      align-items: center;
      gap: var(--space-4);
      flex: 1;
      min-width: 0;
    }
    .calibration-score-box {
      width: 64px;
      height: 64px;
      border-radius: var(--radius-md);
      background: var(--color-bg-surface-muted);
      border: 1px solid var(--color-success-border);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .score-num {
      font-size: var(--text-base);
      font-weight: 800;
      font-family: var(--font-mono);
      color: var(--color-success-text);
      line-height: 1;
    }
    .score-label {
      font-size: 8px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--color-text-muted);
      margin-top: 4px;
      font-weight: 700;
    }
    .calibration-details {
      flex: 1;
      min-width: 0;
    }
    .calibration-title-row {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin-bottom: 3px;
    }
    .calibration-title-row h3 {
      font-size: var(--text-sm);
      font-weight: 700;
      margin: 0;
    }
    .calibration-desc {
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
      margin: 0 0 var(--space-2) 0;
      max-width: 620px;
      line-height: 1.4;
    }
    .calibration-progress-bar {
      width: 100%;
      max-width: 440px;
      height: 4px;
      background: var(--color-bg-surface-elevated);
      border-radius: var(--radius-xs);
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      background: var(--color-success);
      border-radius: var(--radius-xs);
      transition: width var(--motion-base);
    }
    .calibration-actions {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-shrink: 0;
    }

    /* Architectural Two-Column Layout */
    .profile-layout {
      display: grid;
      grid-template-columns: minmax(0, 1.75fr) minmax(0, 1.25fr);
      gap: var(--space-4);
      width: 100%;
    }
    .specs-column {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }
    .parser-column {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    /* Panels */
    .specs-panel, .skills-panel, .goals-panel, .parser-panel {
      padding: var(--space-4) var(--space-5);
      border-radius: var(--radius-lg);
    }
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--color-border-subtle);
      padding-bottom: var(--space-3);
      margin-bottom: var(--space-3-5);
    }
    .panel-title-wrap {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .panel-title-wrap h2 {
      font-size: var(--text-sm);
      font-weight: 700;
      margin: 0;
      letter-spacing: -0.01em;
    }
    .panel-icon-accent { color: var(--color-brand-accent); }
    .text-green { color: var(--color-success-text); }
    .panel-subtitle {
      font-size: var(--text-2xs);
      color: var(--color-text-muted);
      margin: 0 0 var(--space-3) 0;
      line-height: 1.45;
    }

    .verified-tag {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 10px;
      font-weight: 700;
      color: var(--color-success-text);
      background: var(--color-success-bg);
      border: 1px solid var(--color-success-border);
      padding: 2px 7px;
      border-radius: var(--radius-sm);
    }
    .privacy-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 10px;
      font-weight: 600;
      color: var(--color-text-secondary);
      background: var(--color-bg-surface-elevated);
      border: 1px solid var(--color-border-subtle);
      padding: 2px 7px;
      border-radius: var(--radius-sm);
    }

    /* Form Grids */
    .form-grid-2 {
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
    .form-group:last-of-type {
      margin-bottom: 0;
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

    /* Skills Ledger & Flow */
    .skills-ledger {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .chips-flow {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .tech-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 8px;
      border-radius: var(--radius-sm);
      font-size: var(--text-xs);
      font-weight: 600;
      border: 1px solid var(--color-border-default);
      background: var(--color-bg-surface-muted);
      color: var(--color-text-primary);
    }
    .tech-chip.confirmed {
      border-color: var(--color-success-border);
      color: var(--color-success-text);
      background-color: var(--color-success-bg);
    }
    .tech-chip.target {
      border-color: var(--color-brand-border);
      color: var(--color-brand-accent);
      background-color: var(--color-brand-subtle);
    }
    .chip-text { line-height: 1.2; }
    .chip-remove {
      background: transparent;
      border: none;
      color: inherit;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      padding: 0;
      opacity: 0.6;
      transition: opacity var(--motion-fast);
    }
    .chip-remove:hover { opacity: 1; }

    /* Quick Suggest Strip */
    .suggest-strip {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
      padding: var(--space-2) 0;
    }
    .suggest-lead {
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 700;
      color: var(--color-text-muted);
      letter-spacing: 0.04em;
    }
    .suggest-items {
      display: flex;
      gap: 5px;
      flex-wrap: wrap;
    }
    .suggest-tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      font-weight: 500;
      padding: 3px 7px;
      border-radius: var(--radius-sm);
      background: var(--color-bg-surface-elevated);
      border: 1px solid var(--color-border-subtle);
      color: var(--color-text-secondary);
      cursor: pointer;
      transition: background-color var(--motion-fast), border-color var(--motion-fast), color var(--motion-fast);
    }
    .suggest-tag:hover:not(:disabled) {
      border-color: var(--color-border-hover);
      color: var(--color-text-primary);
      background-color: var(--color-bg-surface-hover);
    }
    .suggest-tag:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }

    .add-skill-row {
      display: flex;
      gap: var(--space-2);
    }
    .add-skill-input {
      font-size: var(--text-xs);
      padding: 6px 10px;
      flex: 1;
    }

    /* Dropzone Box */
    .dropzone-box {
      border: 1px dashed var(--color-border-default);
      border-radius: var(--radius-lg);
      padding: var(--space-5) var(--space-4);
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
    .dropzone-box:hover, .dropzone-box.dragover {
      border-color: var(--color-brand-accent);
      background-color: var(--color-bg-surface-hover);
    }
    .dropzone-symbol {
      width: 42px;
      height: 42px;
      border-radius: var(--radius-md);
      background: var(--color-bg-surface-muted);
      border: 1px solid var(--color-border-subtle);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-brand-accent);
    }
    .dropzone-heading {
      font-size: var(--text-xs);
      font-weight: 700;
      color: var(--color-text-primary);
      margin: 0;
    }
    .dropzone-note {
      font-size: 10px;
      color: var(--color-text-muted);
      margin: 2px 0 0 0;
    }
    .file-select-btn {
      cursor: pointer;
      margin-top: 2px;
    }
    .visually-hidden { display: none; }

    .selected-file-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      padding: 6px 10px;
      background: var(--color-brand-subtle);
      border: 1px solid var(--color-brand-border);
      border-radius: var(--radius-sm);
      font-size: var(--text-xs);
      color: var(--color-brand-accent);
      margin-top: var(--space-2-5);
    }
    .file-info-group {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      flex: 1;
    }
    .file-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 600;
    }

    .paste-fallback {
      margin-top: var(--space-3);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .paste-fallback label {
      font-size: var(--text-xs);
      font-weight: 600;
      color: var(--color-text-secondary);
    }
    .paste-area {
      font-size: var(--text-xs);
      line-height: 1.45;
    }
    .full-width-btn {
      width: 100%;
      margin-top: var(--space-3-5);
    }

    /* Modal */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(4, 6, 12, 0.65);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      z-index: 300;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4);
    }
    .review-modal {
      width: 100%;
      max-width: 540px;
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border-default);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-xl);
      overflow: hidden;
    }
    .modal-header {
      padding: var(--space-4) var(--space-5);
      border-bottom: 1px solid var(--color-border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .modal-title-wrap {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .modal-title-wrap h2 {
      font-size: var(--text-base);
      font-weight: 700;
      margin: 0;
    }
    .modal-body {
      padding: var(--space-5);
    }
    .modal-desc {
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
      margin-bottom: var(--space-4);
      line-height: 1.45;
    }
    .modal-skill-section h4 {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted);
      margin-bottom: var(--space-2);
    }
    .modal-footer {
      padding: var(--space-3-5) var(--space-5);
      background: var(--color-bg-surface-elevated);
      border-top: 1px solid var(--color-border-subtle);
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: var(--space-2-5);
    }

    .spin {
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    @media (max-width: 860px) {
      .profile-layout {
        grid-template-columns: 1fr;
      }
      .calibration-strip {
        flex-direction: column;
        align-items: stretch;
      }
      .calibration-actions .btn {
        flex: 1;
      }
      .form-grid-2 {
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
          full_name: result.personal_info?.full_name || this.fullName || 'Abdelrahman Emam',
          professional_summary: result.professional_summary || this.professionalSummary || '',
          education_institution: result.educations?.[0]?.institution || this.educationInst || 'Egyptian E-Learning University (EELU)',
          degree_title: result.educations?.[0]?.degree || this.degreeTitle || 'B.Sc. Computer and Information Technology',
          graduation_year: result.educations?.[0]?.graduation_year || this.gradYear || 2026,
          experience_years: result.experience_years ?? this.experienceYears ?? 1.0,
          linkedin_url: result.personal_info?.linkedin_url || this.linkedinUrl || 'https://www.linkedin.com/in/abd-el-rahman-emam',
          github_url: result.personal_info?.github_url || this.githubUrl || '',
          confirmed_skills: [...(result.confirmed_skills || [])],
          target_skills: [...(result.target_skills || [])],
          learning_or_exposure_skills: [...(result.learning_or_exposure_skills || [])],
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
    if (this.reviewData.confirmed_skills) {
      this.reviewData.confirmed_skills.splice(index, 1);
    }
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
