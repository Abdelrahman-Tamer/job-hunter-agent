import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { TelegramService } from '../../core/services/telegram.service';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent } from '../../core/components/icon/icon.component';
import { UiBadgeComponent } from '../../shared/ui/ui-badge.component';
import { UiButtonComponent } from '../../shared/ui/ui-button.component';
import { CandidateProfile, ParsedCVResult } from '../../core/models/job.model';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, UiBadgeComponent, UiButtonComponent],
  template: `
    <div class="profile-intelligence-view">
      <!-- Executive Header -->
      <header class="profile-header">
        <div class="header-titles">
          <div class="title-row">
            <h1 class="page-title">Candidate Intelligence Profile</h1>
            <ui-badge variant="brand" size="sm">Algorithm Grounding</ui-badge>
          </div>
          <p class="page-subtitle">
            Calibrate your verified skills, academic credentials, and targeting parameters used by the autonomous matching engine.
          </p>
        </div>
      </header>

      <!-- Sticky Calibration Strip -->
      <section class="calibration-strip" aria-label="Engine calibration telemetry">
        <div class="calibration-left">
          <div class="completeness-score-box tabular-nums">
            <span class="score-number">{{ calculateCompleteness() }}%</span>
            <span class="score-tag">Completeness</span>
          </div>

          <div class="calibration-meta">
            <div class="meta-title-row">
              <span class="calibration-headline">Candidate Matching Calibrated</span>
              <span class="live-dot-indicator"></span>
            </div>
            <p class="calibration-detail-text">
              Verified skills, graduation credentials, and experience weightings directly calibrate match scoring and Telegram digests.
            </p>
          </div>
        </div>

        <div class="calibration-actions">
          <ui-button variant="primary" size="md" (buttonClick)="saveProfile()">
            <app-icon name="check" [size]="14"></app-icon>
            <span>Save Profile Changes</span>
          </ui-button>

          <button type="button" (click)="exportProfile()" class="export-json-btn" title="Export Profile as JSON">
            <app-icon name="file-text" [size]="13"></app-icon>
            <span>Export JSON</span>
          </button>
        </div>
      </section>

      <!-- Two-Column Architectural Workspace -->
      <div class="profile-grid-workspace">
        <!-- Left Column: Identity & Skills Matrix -->
        <div class="specs-column">
          <!-- 1. Identity & Academic Credentials Card -->
          <section class="profile-card">
            <header class="card-header">
              <div class="header-left-title">
                <app-icon name="user" [size]="15" class="header-icon-accent"></app-icon>
                <h2 class="card-heading">Identity & Academic Credentials</h2>
              </div>
              <ui-badge variant="success" size="sm">Verified Identity</ui-badge>
            </header>

            <div class="form-layout-fields">
              <div class="form-row-2">
                <div class="form-field">
                  <label for="fullName">Full Name</label>
                  <input
                    id="fullName"
                    type="text"
                    [(ngModel)]="fullName"
                    placeholder="e.g. Abdelrahman Emam"
                    class="form-input"
                  />
                </div>
                <div class="form-field">
                  <label for="baseCountry">Base Country</label>
                  <input
                    id="baseCountry"
                    type="text"
                    [ngModel]="profile()?.country || 'Egypt'"
                    readonly
                    class="form-input readonly"
                  />
                </div>
              </div>

              <div class="form-field">
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
                <div class="form-field">
                  <label for="eduInst">University / Institution</label>
                  <input
                    id="eduInst"
                    type="text"
                    [(ngModel)]="educationInst"
                    placeholder="e.g. Egyptian E-Learning University (EELU)"
                    class="form-input"
                  />
                </div>
                <div class="form-field">
                  <label for="expYears">Years of Experience</label>
                  <input
                    id="expYears"
                    type="number"
                    step="0.5"
                    [(ngModel)]="experienceYears"
                    placeholder="e.g. 1.0"
                    class="form-input"
                  />
                </div>
              </div>

              <div class="form-row-2">
                <div class="form-field">
                  <label for="degreeTitle">Degree Title</label>
                  <input
                    id="degreeTitle"
                    type="text"
                    [(ngModel)]="degreeTitle"
                    placeholder="e.g. B.Sc. Computer and Information Technology"
                    class="form-input"
                  />
                </div>
                <div class="form-field">
                  <label for="gradYear">Graduation Year</label>
                  <input
                    id="gradYear"
                    type="number"
                    [(ngModel)]="gradYear"
                    placeholder="2026"
                    class="form-input"
                  />
                </div>
              </div>

              <div class="form-row-2">
                <div class="form-field">
                  <label for="linkedin">LinkedIn Profile URL</label>
                  <input
                    id="linkedin"
                    type="text"
                    [(ngModel)]="linkedinUrl"
                    placeholder="https://www.linkedin.com/in/..."
                    class="form-input"
                  />
                </div>
                <div class="form-field">
                  <label for="github">GitHub Profile URL</label>
                  <input
                    id="github"
                    type="text"
                    [(ngModel)]="githubUrl"
                    placeholder="https://github.com/..."
                    class="form-input"
                  />
                </div>
              </div>
            </div>
          </section>

          <!-- 2. Confirmed Skills Card (Emerald) -->
          <section class="profile-card">
            <header class="card-header">
              <div class="header-left-title">
                <app-icon name="check-circle" [size]="15" class="text-emerald"></app-icon>
                <h2 class="card-heading">Verified Technical Stack</h2>
              </div>
              <span class="counter-tag text-emerald tabular-nums">
                {{ confirmedSkills().length }} Confirmed
              </span>
            </header>
            <p class="card-sub-description">
              Verified technical proficiencies extracted from your resume or approved projects. Heavily boosted in match scoring.
            </p>

            <div class="skills-manager-block">
              <!-- Active Confirmed Chips -->
              <div class="chips-flex-wrap">
                <span *ngFor="let s of confirmedSkills(); let i = index" class="skill-tag confirmed">
                  <app-icon name="check" [size]="10"></app-icon>
                  <span class="tag-title">{{ s }}</span>
                  <button type="button" (click)="removeSkill('confirmed', i)" class="tag-remove-btn" aria-label="Remove skill">
                    <app-icon name="x" [size]="10"></app-icon>
                  </button>
                </span>
              </div>

              <!-- Quick Suggestions -->
              <div class="quick-suggest-strip">
                <span class="suggest-label">Quick Add:</span>
                <div class="suggestions-list">
                  <button
                    *ngFor="let sug of popularSuggestions"
                    type="button"
                    (click)="quickAddSkill('confirmed', sug)"
                    [disabled]="confirmedSkills().includes(sug)"
                    class="quick-pill-btn"
                  >
                    <app-icon name="plus" [size]="9"></app-icon>
                    <span>{{ sug }}</span>
                  </button>
                </div>
              </div>

              <!-- Custom Add Row -->
              <div class="custom-add-field-row">
                <input
                  type="text"
                  [(ngModel)]="newConfirmedSkill"
                  (keyup.enter)="addSkill('confirmed')"
                  placeholder="Add custom confirmed skill (e.g. RxJS, Tailwind, Signals)..."
                  class="custom-skill-input"
                />
                <button type="button" (click)="addSkill('confirmed')" class="btn-add-skill">
                  <span>Add Skill</span>
                </button>
              </div>
            </div>
          </section>

          <!-- 3. Target Skills Card (Brand Indigo) -->
          <section class="profile-card">
            <header class="card-header">
              <div class="header-left-title">
                <app-icon name="sparkles" [size]="15" class="text-brand"></app-icon>
                <h2 class="card-heading">Target Learning Goals</h2>
              </div>
              <span class="counter-tag text-brand tabular-nums">
                {{ targetSkills().length }} Goals
              </span>
            </header>
            <p class="card-sub-description">
              Technologies and areas you are actively learning. Kept distinct from verified competence to avoid misrepresenting experience.
            </p>

            <div class="skills-manager-block">
              <div class="chips-flex-wrap">
                <span *ngFor="let s of targetSkills(); let i = index" class="skill-tag target">
                  <span class="tag-title">{{ s }}</span>
                  <button type="button" (click)="removeSkill('target', i)" class="tag-remove-btn" aria-label="Remove target skill">
                    <app-icon name="x" [size]="10"></app-icon>
                  </button>
                </span>
              </div>

              <div class="custom-add-field-row">
                <input
                  type="text"
                  [(ngModel)]="newTargetSkill"
                  (keyup.enter)="addSkill('target')"
                  placeholder="Add target technology goal..."
                  class="custom-skill-input"
                />
                <button type="button" (click)="addSkill('target')" class="btn-add-skill">
                  <span>Add Goal</span>
                </button>
              </div>
            </div>
          </section>

          <!-- 4. Exposure & Familiarity Skills Card (Muted Neutral) -->
          <section class="profile-card">
            <header class="card-header">
              <div class="header-left-title">
                <app-icon name="layers" [size]="15" class="text-muted"></app-icon>
                <h2 class="card-heading">Exposure & Familiarity</h2>
              </div>
              <span class="counter-tag text-muted tabular-nums">
                {{ exposureSkills().length }} Skills
              </span>
            </header>
            <p class="card-sub-description">
              Tools, platforms, and peripheral technologies you have used or been exposed to in past projects.
            </p>

            <div class="skills-manager-block">
              <div class="chips-flex-wrap">
                <span *ngFor="let s of exposureSkills(); let i = index" class="skill-tag exposure">
                  <span class="tag-title">{{ s }}</span>
                  <button type="button" (click)="removeSkill('exposure', i)" class="tag-remove-btn" aria-label="Remove exposure skill">
                    <app-icon name="x" [size]="10"></app-icon>
                  </button>
                </span>
              </div>

              <div class="custom-add-field-row">
                <input
                  type="text"
                  [(ngModel)]="newExposureSkill"
                  (keyup.enter)="addSkill('exposure')"
                  placeholder="Add exposure skill (Docker, Webpack, Vitest)..."
                  class="custom-skill-input"
                />
                <button type="button" (click)="addSkill('exposure')" class="btn-add-skill">
                  <span>Add Exposure</span>
                </button>
              </div>
            </div>
          </section>
        </div>

        <!-- Right Column: Document Intelligence & Resume Parser -->
        <div class="parser-column">
          <section class="profile-card parser-card">
            <header class="card-header">
              <div class="header-left-title">
                <app-icon name="upload-cloud" [size]="15" class="header-icon-accent"></app-icon>
                <h2 class="card-heading">Resume Intelligence</h2>
              </div>
              <ui-badge variant="default" size="sm">Local Ingestion</ui-badge>
            </header>

            <p class="card-sub-description">
              Upload your CV or paste raw text to extract confirmed skills, degree facts, and projects automatically with Gemini.
            </p>

            <!-- Dropzone -->
            <div
              class="cv-dropzone"
              [class.dragover]="isDragging"
              (dragover)="onDragOver($event)"
              (dragleave)="isDragging = false"
              (drop)="onDrop($event)"
            >
              <div class="dropzone-icon-box">
                <app-icon name="upload-cloud" [size]="22"></app-icon>
              </div>
              <div class="dropzone-text-group">
                <span class="dropzone-main-text">Drag & drop resume file here</span>
                <span class="dropzone-sub-text">PDF, DOCX, or TXT (Max 10MB)</span>
              </div>
              <label class="btn-choose-file">
                <app-icon name="file-text" [size]="12"></app-icon>
                <span>Browse Files</span>
                <input
                  type="file"
                  (change)="onFileSelected($event)"
                  accept=".pdf,.docx,.txt"
                  class="visually-hidden"
                />
              </label>
            </div>

            <!-- Selected File Badge -->
            <div *ngIf="selectedFileName" class="selected-file-chip">
              <div class="file-name-left">
                <app-icon name="file-text" [size]="13"></app-icon>
                <span class="file-label">{{ selectedFileName }}</span>
              </div>
              <button type="button" (click)="clearSelectedFile()" class="chip-dismiss-btn" aria-label="Clear file">
                <app-icon name="x" [size]="12"></app-icon>
              </button>
            </div>

            <!-- Plain Text Fallback -->
            <div class="paste-fallback-field">
              <label for="rawText">Or paste plain CV text directly:</label>
              <textarea
                id="rawText"
                [(ngModel)]="rawCvText"
                rows="4"
                placeholder="Paste plain text resume content..."
                class="form-textarea paste-area"
              ></textarea>
            </div>

            <!-- Action Button -->
            <button
              type="button"
              (click)="triggerParse()"
              [disabled]="isParsing() || (!selectedFile && !rawCvText.trim())"
              class="parse-submit-btn"
            >
              <app-icon
                [name]="isParsing() ? 'refresh' : 'sparkles'"
                [size]="13"
                [class.spin]="isParsing()"
              ></app-icon>
              <span>{{ isParsing() ? 'Extracting Technical Facts...' : 'Extract & Parse Skills' }}</span>
            </button>
          </section>
        </div>
      </div>

      <!-- CV Review Confirmation Dialog -->
      <div
        *ngIf="parsedCvResult()"
        class="cv-modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-title"
      >
        <div class="cv-modal-panel">
          <header class="modal-top">
            <div class="modal-top-left">
              <app-icon name="check-circle" [size]="16" class="text-emerald"></app-icon>
              <h2 id="review-title" class="modal-title">Review Extracted Facts</h2>
            </div>
            <button type="button" (click)="parsedCvResult.set(null)" class="modal-close-btn" aria-label="Close dialog">
              <app-icon name="x" [size]="14"></app-icon>
            </button>
          </header>

          <div class="modal-body custom-scrollbar">
            <p class="modal-intro">
              Review and confirm the technical competencies discovered from your resume before updating your profile.
            </p>

            <div class="review-section">
              <h3 class="review-section-title">
                Confirmed Skills ({{ reviewData.confirmed_skills?.length || 0 }})
              </h3>
              <div class="chips-flex-wrap">
                <span
                  *ngFor="let s of reviewData.confirmed_skills; let i = index"
                  class="skill-tag confirmed"
                >
                  <app-icon name="check" [size]="10"></app-icon>
                  <span class="tag-title">{{ s }}</span>
                  <button type="button" (click)="removeReviewSkill(i)" class="tag-remove-btn">&times;</button>
                </span>
              </div>
            </div>
          </div>

          <footer class="modal-footer">
            <ui-button variant="primary" size="md" [loading]="isSaving()" (buttonClick)="confirmAndSaveProfile()">
              <span>Confirm & Apply to Profile</span>
            </ui-button>
            <button type="button" (click)="parsedCvResult.set(null)" class="modal-cancel-btn">
              Cancel
            </button>
          </footer>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
    }

    .profile-intelligence-view {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      width: 100%;
      max-width: 1240px;
      margin: 0 auto;
    }

    .profile-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .title-row {
      display: flex;
      align-items: center;
      gap: var(--space-2-5);
    }

    .page-title {
      margin: 0;
      font-size: var(--text-lg);
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--color-text-primary);
    }

    .page-subtitle {
      margin: 2px 0 0 0;
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
    }

    /* Calibration Strip */
    .calibration-strip {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-4);
      padding: var(--space-3-5) var(--space-4);
      background-color: var(--color-bg-surface-1);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-sm);
      flex-wrap: wrap;
    }

    .calibration-left {
      display: flex;
      align-items: center;
      gap: var(--space-3-5);
    }

    .completeness-score-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-width: 62px;
      height: 52px;
      background-color: var(--color-bg-surface-2);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xs);
    }
    .score-number {
      font-size: 18px;
      font-weight: 800;
      color: var(--color-brand-accent);
      line-height: 1;
    }
    .score-tag {
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--color-text-muted);
      margin-top: 3px;
    }

    .calibration-meta {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .meta-title-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .calibration-headline {
      font-size: 13px;
      font-weight: 700;
      color: var(--color-text-primary);
    }
    .live-dot-indicator {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background-color: var(--color-success);
    }
    .calibration-detail-text {
      margin: 0;
      font-size: 11px;
      color: var(--color-text-muted);
      max-width: 520px;
      line-height: 1.35;
    }

    .calibration-actions {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .export-json-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      height: 36px;
      padding: 0 12px;
      background-color: var(--color-bg-surface-2);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xs);
      color: var(--color-text-secondary);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all var(--motion-fast);
    }
    .export-json-btn:hover {
      background-color: var(--color-bg-surface-hover);
      color: var(--color-text-primary);
      border-color: var(--color-border-default);
    }

    /* Workspace 2-Column Grid */
    .profile-grid-workspace {
      display: grid;
      grid-template-columns: 1fr 360px;
      gap: var(--space-4);
      align-items: start;
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

    .profile-card {
      background-color: var(--color-bg-surface-1);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-sm);
      padding: var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--color-border-subtle);
      padding-bottom: var(--space-2-5);
    }

    .header-left-title {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .header-icon-accent {
      color: var(--color-brand-accent);
    }

    .card-heading {
      margin: 0;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--color-text-primary);
    }

    .counter-tag {
      font-size: 11px;
      font-weight: 600;
    }

    .card-sub-description {
      margin: 0;
      font-size: 12px;
      color: var(--color-text-secondary);
      line-height: 1.4;
    }

    /* Form Fields */
    .form-layout-fields {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .form-row-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-3);
    }

    .form-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .form-field label {
      font-size: 11px;
      font-weight: 600;
      color: var(--color-text-secondary);
    }

    .form-input, .form-textarea {
      width: 100%;
      background-color: var(--color-bg-surface-2);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xs);
      padding: 7px 10px;
      font-size: 12px;
      color: var(--color-text-primary);
      transition: border-color var(--motion-fast);
      box-sizing: border-box;
    }
    .form-input:focus, .form-textarea:focus {
      outline: none;
      border-color: var(--color-brand-accent);
    }
    .form-input.readonly {
      opacity: 0.7;
      cursor: not-allowed;
    }

    /* Skills Manager */
    .skills-manager-block {
      display: flex;
      flex-direction: column;
      gap: var(--space-2-5);
    }

    .chips-flex-wrap {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1-5);
    }

    .skill-tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      border-radius: 3px;
      font-size: 11px;
      font-weight: 500;
      border: 1px solid var(--color-border-subtle);
      background-color: var(--color-bg-surface-2);
    }
    .skill-tag.confirmed {
      border-color: rgba(16, 185, 129, 0.35);
      background-color: rgba(16, 185, 129, 0.08);
      color: var(--color-success);
    }
    .skill-tag.target {
      border-color: var(--color-brand-border);
      background-color: var(--color-brand-subtle);
      color: var(--color-brand-accent);
    }
    .skill-tag.exposure {
      color: var(--color-text-secondary);
    }

    .tag-remove-btn {
      background: transparent;
      border: none;
      color: inherit;
      opacity: 0.6;
      cursor: pointer;
      display: inline-flex;
      padding: 0;
    }
    .tag-remove-btn:hover {
      opacity: 1;
    }

    .quick-suggest-strip {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .suggest-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--color-text-muted);
    }
    .suggestions-list {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .quick-pill-btn {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px 6px;
      font-size: 10px;
      border-radius: 3px;
      background-color: var(--color-bg-surface-2);
      border: 1px solid var(--color-border-subtle);
      color: var(--color-text-secondary);
      cursor: pointer;
    }
    .quick-pill-btn:hover:not(:disabled) {
      background-color: var(--color-bg-surface-hover);
      color: var(--color-text-primary);
    }
    .quick-pill-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .custom-add-field-row {
      display: flex;
      gap: var(--space-2);
    }
    .custom-skill-input {
      flex: 1;
      height: 30px;
      background-color: var(--color-bg-surface-2);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xs);
      padding: 0 10px;
      font-size: 12px;
      color: var(--color-text-primary);
    }
    .custom-skill-input:focus {
      outline: none;
      border-color: var(--color-brand-accent);
    }
    .btn-add-skill {
      padding: 0 12px;
      height: 30px;
      background-color: var(--color-bg-surface-2);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xs);
      color: var(--color-text-secondary);
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-add-skill:hover {
      background-color: var(--color-bg-surface-hover);
      color: var(--color-text-primary);
    }

    /* Resume Parser Card */
    .cv-dropzone {
      border: 1px dashed var(--color-border-default);
      background-color: var(--color-bg-surface-2);
      border-radius: var(--radius-xs);
      padding: var(--space-4);
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: var(--space-2);
      transition: all var(--motion-fast);
    }
    .cv-dropzone.dragover {
      border-color: var(--color-brand-accent);
      background-color: var(--color-brand-subtle);
    }

    .dropzone-icon-box {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background-color: var(--color-bg-surface-1);
      border: 1px solid var(--color-border-subtle);
      color: var(--color-brand-accent);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .dropzone-text-group {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .dropzone-main-text {
      font-size: 12px;
      font-weight: 600;
      color: var(--color-text-primary);
    }
    .dropzone-sub-text {
      font-size: 10px;
      color: var(--color-text-muted);
    }

    .btn-choose-file {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 5px 12px;
      background-color: var(--color-bg-surface-1);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xs);
      font-size: 11px;
      font-weight: 600;
      color: var(--color-text-primary);
      cursor: pointer;
      margin-top: 2px;
    }
    .btn-choose-file:hover {
      background-color: var(--color-bg-surface-hover);
    }
    .visually-hidden {
      display: none;
    }

    .selected-file-chip {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px;
      background-color: var(--color-brand-subtle);
      border: 1px solid var(--color-brand-border);
      border-radius: var(--radius-xs);
    }
    .file-name-left {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--color-brand-accent);
    }
    .file-label {
      font-size: 11px;
      font-weight: 600;
    }
    .chip-dismiss-btn {
      background: transparent;
      border: none;
      color: var(--color-brand-accent);
      cursor: pointer;
      display: flex;
    }

    .paste-fallback-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .paste-fallback-field label {
      font-size: 11px;
      color: var(--color-text-muted);
    }
    .paste-area {
      resize: vertical;
    }

    .parse-submit-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      width: 100%;
      height: 34px;
      background-color: var(--color-brand-accent);
      border: 1px solid transparent;
      border-radius: var(--radius-xs);
      color: #ffffff;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: background-color var(--motion-fast);
    }
    .parse-submit-btn:hover:not(:disabled) {
      background-color: var(--color-brand-hover);
    }
    .parse-submit-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Modal Backdrop */
    .cv-modal-backdrop {
      position: fixed;
      inset: 0;
      background-color: rgba(9, 9, 11, 0.75);
      backdrop-filter: blur(8px);
      z-index: 1200;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4);
    }

    .cv-modal-panel {
      width: 100%;
      max-width: 560px;
      background-color: var(--color-bg-surface-1);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-sm);
      box-shadow: var(--shadow-xl);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .modal-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-3-5) var(--space-4);
      border-bottom: 1px solid var(--color-border-subtle);
    }
    .modal-top-left {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .modal-title {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
      color: var(--color-text-primary);
    }
    .modal-close-btn {
      background: transparent;
      border: none;
      color: var(--color-text-muted);
      cursor: pointer;
      display: flex;
    }
    .modal-close-btn:hover {
      color: var(--color-text-primary);
    }

    .modal-body {
      padding: var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      max-height: 400px;
      overflow-y: auto;
    }
    .modal-intro {
      margin: 0;
      font-size: 12px;
      color: var(--color-text-secondary);
      line-height: 1.4;
    }
    .review-section-title {
      margin: 0 0 var(--space-2) 0;
      font-size: 12px;
      font-weight: 600;
      color: var(--color-text-primary);
    }

    .modal-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: var(--space-2);
      padding: var(--space-3) var(--space-4);
      border-top: 1px solid var(--color-border-subtle);
      background-color: var(--color-bg-surface-2);
    }

    .modal-cancel-btn {
      padding: 6px 14px;
      background-color: transparent;
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xs);
      color: var(--color-text-secondary);
      font-size: 12px;
      cursor: pointer;
    }
    .modal-cancel-btn:hover {
      background-color: var(--color-bg-surface-hover);
      color: var(--color-text-primary);
    }

    .text-emerald { color: var(--color-success); }
    .text-brand { color: var(--color-brand-accent); }
    .text-muted { color: var(--color-text-muted); }

    .spin {
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    @media (max-width: 860px) {
      .profile-grid-workspace {
        grid-template-columns: 1fr;
      }
      .calibration-strip {
        flex-direction: column;
        align-items: stretch;
      }
      .form-row-2 {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class ProfileComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly telegram = inject(TelegramService);
  private readonly toast = inject(ToastService);

  readonly profile = signal<CandidateProfile | null>(null);

  // Form Fields
  fullName = '';
  professionalSummary = '';
  educationInst = '';
  degreeTitle = '';
  gradYear: number | null = null;
  experienceYears: number | null = null;
  linkedinUrl = '';
  githubUrl = '';

  // Skills
  readonly confirmedSkills = signal<string[]>([]);
  readonly targetSkills = signal<string[]>([]);
  readonly exposureSkills = signal<string[]>([]);

  newConfirmedSkill = '';
  newTargetSkill = '';
  newExposureSkill = '';

  readonly popularSuggestions = [
    'Angular',
    'TypeScript',
    'RxJS',
    'NgRx',
    'Signals',
    'Tailwind CSS',
    'HTML5/CSS3',
    'REST APIs',
    'Jest',
  ];

  // Parser state
  selectedFile: File | null = null;
  selectedFileName = '';
  rawCvText = '';
  isDragging = false;
  readonly isParsing = signal<boolean>(false);
  readonly isSaving = signal<boolean>(false);
  readonly parsedCvResult = signal<ParsedCVResult | null>(null);
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
        this.gradYear = p.graduation_year;
        this.experienceYears = p.experience_years;
        this.linkedinUrl = p.linkedin_url || '';
        this.githubUrl = p.github_url || '';
        this.confirmedSkills.set([...(p.confirmed_skills || [])]);
        this.targetSkills.set([...(p.target_skills || [])]);
        this.exposureSkills.set([...(p.learning_or_exposure_skills || [])]);
      },
      error: (e) => console.error('Failed to load profile:', e),
    });
  }

  calculateCompleteness(): number {
    let score = 30;
    if (this.fullName) score += 10;
    if (this.professionalSummary) score += 15;
    if (this.educationInst) score += 10;
    if (this.confirmedSkills().length >= 3) score += 20;
    if (this.confirmedSkills().length >= 6) score += 10;
    if (this.linkedinUrl || this.githubUrl) score += 5;
    return Math.min(score, 100);
  }

  addSkill(type: 'confirmed' | 'target' | 'exposure'): void {
    if (type === 'confirmed') {
      const s = this.newConfirmedSkill.trim();
      if (s && !this.confirmedSkills().includes(s)) {
        this.confirmedSkills.update((l) => [...l, s]);
        this.newConfirmedSkill = '';
        this.telegram.haptic('selection');
      }
    } else if (type === 'target') {
      const s = this.newTargetSkill.trim();
      if (s && !this.targetSkills().includes(s)) {
        this.targetSkills.update((l) => [...l, s]);
        this.newTargetSkill = '';
        this.telegram.haptic('selection');
      }
    } else {
      const s = this.newExposureSkill.trim();
      if (s && !this.exposureSkills().includes(s)) {
        this.exposureSkills.update((l) => [...l, s]);
        this.newExposureSkill = '';
        this.telegram.haptic('selection');
      }
    }
  }

  quickAddSkill(type: 'confirmed' | 'target' | 'exposure', skill: string): void {
    if (type === 'confirmed' && !this.confirmedSkills().includes(skill)) {
      this.confirmedSkills.update((l) => [...l, skill]);
      this.telegram.haptic('selection');
      this.toast.show(`Added ${skill}`, 'success', 1500);
    }
  }

  removeSkill(type: 'confirmed' | 'target' | 'exposure', index: number): void {
    this.telegram.haptic('light');
    if (type === 'confirmed') {
      this.confirmedSkills.update((l) => l.filter((_, i) => i !== index));
    } else if (type === 'target') {
      this.targetSkills.update((l) => l.filter((_, i) => i !== index));
    } else {
      this.exposureSkills.update((l) => l.filter((_, i) => i !== index));
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
        learning_or_exposure_skills: this.exposureSkills(),
      })
      .subscribe({
        next: () => {
          this.telegram.haptic('success');
          this.toast.show('Profile updated successfully!', 'success');
          this.loadProfile();
        },
        error: () => this.toast.show('Failed to save profile', 'error'),
      });
  }

  exportProfile(): void {
    this.telegram.haptic('light');
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(this.profile(), null, 2));
    const a = document.createElement('a');
    a.setAttribute('href', dataStr);
    a.setAttribute('download', 'candidate_profile.json');
    document.body.appendChild(a);
    a.click();
    a.remove();
    this.toast.show('Profile JSON exported', 'info', 1500);
  }

  onFileSelected(event: any): void {
    const file = event.target.files?.[0];
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
          full_name: result.personal_info?.full_name || this.fullName || '',
          professional_summary: result.professional_summary || this.professionalSummary || '',
          education_institution:
            result.educations?.[0]?.institution || this.educationInst || '',
          degree_title: result.educations?.[0]?.degree || this.degreeTitle || '',
          graduation_year:
            result.educations?.[0]?.graduation_year || this.gradYear || 2026,
          experience_years:
            result.experience_years ?? this.experienceYears ?? 1.0,
          linkedin_url: result.personal_info?.linkedin_url || this.linkedinUrl || '',
          github_url: result.personal_info?.github_url || this.githubUrl || '',
          confirmed_skills: [...(result.confirmed_skills || [])],
          target_skills: [...(result.target_skills || [])],
          learning_or_exposure_skills: [
            ...(result.learning_or_exposure_skills || []),
          ],
        };
      },
      error: (err: any) => {
        this.isParsing.set(false);
        this.toast.show(
          'Failed to parse CV: ' + (err.error?.detail || err.message),
          'error'
        );
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
        this.toast.show(
          'Error saving profile: ' + (err.error?.detail || err.message),
          'error'
        );
      },
    });
  }
}
