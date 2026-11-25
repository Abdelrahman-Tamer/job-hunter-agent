import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { TelegramService } from '../../core/services/telegram.service';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent } from '../../core/components/icon/icon.component';
import { UiBadgeComponent } from '../../shared/ui/ui-badge.component';
import { UiButtonComponent } from '../../shared/ui/ui-button.component';
import {
  CandidateProfile,
  ParsedCVResult,
  ParsedEducation,
  ParsedExperience,
  ParsedProject,
} from '../../core/models/job.model';

interface CvReviewData {
  full_name: string;
  professional_summary: string;
  education_institution: string;
  degree_title: string;
  graduation_year: number | null;
  experience_years: number | null;
  linkedin_url: string;
  github_url: string;
  confirmed_skills: string[];
  target_skills: string[];
  learning_or_exposure_skills: string[];
  projects: ParsedProject[];
  experiences: ParsedExperience[];
  educations: ParsedEducation[];
}

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
            <span class="score-tag">Complete</span>
          </div>

          <div class="calibration-meta">
            <div class="meta-title-row">
              <span class="calibration-headline">Candidate Matching Calibrated</span>
              <span class="live-dot-indicator" aria-hidden="true"></span>
            </div>
            <p class="calibration-detail-text">
              Verified skills, graduation credentials, and experience weightings directly calibrate match scoring and Telegram digests.
            </p>
          </div>
        </div>

        <div class="calibration-actions">
          <ui-button
            variant="primary"
            size="md"
            [loading]="isSaving()"
            (clicked)="saveProfile()"
          >
            <app-icon name="check" [size]="14"></app-icon>
            <span>{{ isSaving() ? 'Saving Profile...' : 'Save Profile Changes' }}</span>
          </ui-button>

          <button
            type="button"
            (click)="exportProfile()"
            class="export-json-btn"
            title="Export Profile as JSON"
          >
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
                    dir="auto"
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
                    dir="auto"
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
                  dir="auto"
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
                    dir="auto"
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
                    class="form-input tabular-nums"
                  />
                </div>
              </div>

              <div class="form-row-2">
                <div class="form-field">
                  <label for="degreeTitle">Degree Title</label>
                  <input
                    id="degreeTitle"
                    type="text"
                    dir="auto"
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
                    class="form-input tabular-nums"
                  />
                </div>
              </div>

              <div class="form-row-2">
                <div class="form-field">
                  <label for="linkedin">LinkedIn Profile URL</label>
                  <input
                    id="linkedin"
                    type="url"
                    [(ngModel)]="linkedinUrl"
                    placeholder="https://www.linkedin.com/in/..."
                    class="form-input"
                  />
                </div>
                <div class="form-field">
                  <label for="github">GitHub Profile URL</label>
                  <input
                    id="github"
                    type="url"
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
                  <span class="tag-title" dir="auto">{{ s }}</span>
                  <button
                    type="button"
                    (click)="removeSkill('confirmed', i)"
                    class="tag-remove-btn"
                    [attr.aria-label]="'Remove confirmed skill ' + s"
                  >
                    <app-icon name="x" [size]="10"></app-icon>
                  </button>
                </span>
              </div>

              <!-- Quick Suggestions -->
              <div class="quick-suggest-strip">
                <span class="suggest-label">Quick Add</span>
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
                  dir="auto"
                  [(ngModel)]="newConfirmedSkill"
                  (keyup.enter)="addSkill('confirmed')"
                  placeholder="Add confirmed skill (e.g. RxJS, Tailwind, Signals)..."
                  aria-label="Add custom confirmed skill"
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
                  <span class="tag-title" dir="auto">{{ s }}</span>
                  <button
                    type="button"
                    (click)="removeSkill('target', i)"
                    class="tag-remove-btn"
                    [attr.aria-label]="'Remove target skill ' + s"
                  >
                    <app-icon name="x" [size]="10"></app-icon>
                  </button>
                </span>
              </div>

              <div class="custom-add-field-row">
                <input
                  type="text"
                  dir="auto"
                  [(ngModel)]="newTargetSkill"
                  (keyup.enter)="addSkill('target')"
                  placeholder="Add target technology goal..."
                  aria-label="Add target technology goal"
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
                  <span class="tag-title" dir="auto">{{ s }}</span>
                  <button
                    type="button"
                    (click)="removeSkill('exposure', i)"
                    class="tag-remove-btn"
                    [attr.aria-label]="'Remove exposure skill ' + s"
                  >
                    <app-icon name="x" [size]="10"></app-icon>
                  </button>
                </span>
              </div>

              <div class="custom-add-field-row">
                <input
                  type="text"
                  dir="auto"
                  [(ngModel)]="newExposureSkill"
                  (keyup.enter)="addSkill('exposure')"
                  placeholder="Add exposure skill (Docker, Webpack, Vitest)..."
                  aria-label="Add exposure skill"
                  class="custom-skill-input"
                />
                <button type="button" (click)="addSkill('exposure')" class="btn-add-skill">
                  <span>Add Exposure</span>
                </button>
              </div>
            </div>
          </section>

          <!-- 5. Indexed Projects Card (when parsed/saved from CV) -->
          <section class="profile-card" *ngIf="profile()?.projects?.length">
            <header class="card-header">
              <div class="header-left-title">
                <app-icon name="briefcase" [size]="15" class="header-icon-accent"></app-icon>
                <h2 class="card-heading">Indexed Engineering Projects</h2>
              </div>
              <span class="counter-tag text-muted tabular-nums">
                {{ profile()!.projects!.length }} Projects
              </span>
            </header>

            <div class="projects-list">
              <article *ngFor="let proj of profile()!.projects" class="project-item-card">
                <div class="project-head">
                  <h3 class="project-name" dir="auto">{{ proj.name }}</h3>
                  <span *ngIf="proj.context" class="project-context" dir="auto">{{ proj.context }}</span>
                </div>
                <div *ngIf="proj.technologies.length" class="project-tech-row">
                  <span *ngFor="let tech of proj.technologies" class="project-tech-chip" dir="auto">{{ tech }}</span>
                </div>
                <ul *ngIf="proj.bullets.length" class="project-bullets">
                  <li *ngFor="let bullet of proj.bullets" dir="auto">{{ bullet }}</li>
                </ul>
              </article>
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
              Upload your CV or paste raw text to extract confirmed skills, degree facts, and projects locally before updating your profile.
            </p>

            <!-- Dropzone -->
            <div
              class="cv-dropzone"
              [class.dragover]="isDragging"
              (dragover)="onDragOver($event)"
              (dragleave)="onDragLeave($event)"
              (drop)="onDrop($event)"
            >
              <div class="dropzone-icon-box">
                <app-icon name="upload-cloud" [size]="22"></app-icon>
              </div>
              <div class="dropzone-text-group">
                <span class="dropzone-main-text">Drag & drop resume file here</span>
                <span class="dropzone-sub-text tabular-nums">PDF, DOCX, or TXT (Max 10 MB)</span>
              </div>
              <label class="btn-choose-file" tabindex="0" (keydown.enter)="fileInput.click()" (keydown.space)="$event.preventDefault(); fileInput.click()">
                <app-icon name="file-text" [size]="12"></app-icon>
                <span>Browse Files</span>
                <input
                  #fileInput
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
                <span class="file-label" dir="auto">{{ selectedFileName }}</span>
              </div>
              <button type="button" (click)="clearSelectedFile()" class="chip-dismiss-btn" aria-label="Clear selected file">
                <app-icon name="x" [size]="12"></app-icon>
              </button>
            </div>

            <!-- Plain Text Fallback -->
            <div class="paste-fallback-field">
              <label for="rawText">Or paste plain CV text directly:</label>
              <textarea
                id="rawText"
                dir="auto"
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
        (click)="parsedCvResult.set(null)"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-title"
      >
        <div class="cv-modal-panel" (click)="$event.stopPropagation()">
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

            <div *ngIf="reviewData.full_name || reviewData.education_institution" class="review-meta-summary">
              <div *ngIf="reviewData.full_name" class="review-meta-row">
                <span class="review-meta-key">Name</span>
                <span class="review-meta-val" dir="auto">{{ reviewData.full_name }}</span>
              </div>
              <div *ngIf="reviewData.education_institution" class="review-meta-row">
                <span class="review-meta-key">Education</span>
                <span class="review-meta-val" dir="auto">{{ reviewData.education_institution }}</span>
              </div>
              <div *ngIf="reviewData.projects.length" class="review-meta-row">
                <span class="review-meta-key">Projects</span>
                <span class="review-meta-val tabular-nums">{{ reviewData.projects.length }} detected</span>
              </div>
            </div>

            <div class="review-section">
              <h3 class="review-section-title tabular-nums">
                Confirmed Skills ({{ reviewData.confirmed_skills.length }})
              </h3>
              <div class="chips-flex-wrap">
                <span
                  *ngFor="let s of reviewData.confirmed_skills; let i = index"
                  class="skill-tag confirmed"
                >
                  <app-icon name="check" [size]="10"></app-icon>
                  <span class="tag-title" dir="auto">{{ s }}</span>
                  <button
                    type="button"
                    (click)="removeReviewSkill(i)"
                    class="tag-remove-btn"
                    [attr.aria-label]="'Remove extracted skill ' + s"
                  >
                    <app-icon name="x" [size]="10"></app-icon>
                  </button>
                </span>
              </div>
            </div>
          </div>

          <footer class="modal-footer">
            <ui-button variant="primary" size="md" [loading]="isSaving()" (clicked)="confirmAndSaveProfile()">
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
      min-width: 0;
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
      flex-wrap: wrap;
    }

    .page-title {
      margin: 0;
      font-size: var(--text-2xl);
      font-weight: 700;
      letter-spacing: -0.03em;
      color: var(--text-primary);
    }

    .page-subtitle {
      margin: 3px 0 0 0;
      font-size: var(--text-sm);
      color: var(--text-secondary);
      line-height: 1.45;
    }

    /* Calibration Strip */
    .calibration-strip {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-4);
      padding: var(--space-3-5) var(--space-4);
      background-color: var(--bg-surface-1);
      border: 1px solid var(--border-default);
      box-shadow: var(--surface-highlight), var(--shadow-xs);
      border-radius: var(--radius-sm);
      flex-wrap: wrap;
    }

    .calibration-left {
      display: flex;
      align-items: center;
      gap: var(--space-3-5);
      min-width: 0;
    }

    .completeness-score-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-width: 64px;
      height: 54px;
      padding: 0 var(--space-2);
      background-color: var(--bg-surface-2);
      border: 1px solid var(--border-default);
      box-shadow: var(--surface-highlight-sm);
      border-radius: var(--radius-xs);
      flex-shrink: 0;
    }
    .score-number {
      font-size: 18px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--brand-accent);
      line-height: 1;
    }
    .score-tag {
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-tertiary);
      margin-top: 3px;
    }

    .calibration-meta {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .meta-title-row {
      display: flex;
      align-items: center;
      gap: 7px;
    }
    .calibration-headline {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--text-primary);
    }
    .live-dot-indicator {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background-color: var(--emerald-500);
      box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
      flex-shrink: 0;
    }
    .calibration-detail-text {
      margin: 0;
      font-size: 11px;
      color: var(--text-tertiary);
      max-width: 540px;
      line-height: 1.4;
    }

    .calibration-actions {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
    }

    .export-json-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      height: 36px;
      padding: 0 12px;
      background-color: var(--bg-surface-2);
      border: 1px solid var(--border-default);
      box-shadow: var(--surface-highlight-sm);
      border-radius: var(--radius-sm);
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all var(--motion-fast);
    }
    .export-json-btn:hover {
      background-color: var(--bg-surface-3);
      color: var(--text-primary);
      border-color: var(--border-strong);
    }
    .export-json-btn:active {
      transform: scale(0.98);
    }

    /* Workspace 2-Column Grid */
    .profile-grid-workspace {
      display: grid;
      grid-template-columns: 1fr 360px;
      gap: var(--space-4);
      align-items: start;
    }

    .specs-column,
    .parser-column {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      min-width: 0;
    }

    .profile-card {
      background-color: var(--bg-surface-1);
      border: 1px solid var(--border-default);
      box-shadow: var(--surface-highlight), var(--shadow-xs);
      border-radius: var(--radius-sm);
      padding: var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      transition: border-color var(--motion-fast), box-shadow var(--motion-fast);
    }
    .profile-card:hover {
      border-color: var(--border-strong);
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      border-bottom: 1px solid var(--border-subtle);
      padding-bottom: var(--space-2-5);
    }

    .header-left-title {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .header-icon-accent {
      color: var(--brand-accent);
    }

    .card-heading {
      margin: 0;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: -0.015em;
      color: var(--text-primary);
    }

    .counter-tag {
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 600;
    }

    .card-sub-description {
      margin: 0;
      font-size: 12px;
      color: var(--text-secondary);
      line-height: 1.45;
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
      gap: 5px;
      min-width: 0;
    }
    .form-field label {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-secondary);
    }

    .form-input, .form-textarea {
      width: 100%;
      min-height: 36px;
      background-color: var(--bg-surface-2);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-xs);
      padding: 7px 10px;
      font-family: inherit;
      font-size: 13px;
      color: var(--text-primary);
      transition: border-color var(--motion-fast), background-color var(--motion-fast), box-shadow var(--motion-fast);
      box-sizing: border-box;
    }
    .form-input:hover:not(.readonly), .form-textarea:hover {
      border-color: var(--border-strong);
    }
    .form-input:focus, .form-textarea:focus {
      outline: none;
      border-color: var(--brand-primary);
      box-shadow: 0 0 0 2px var(--brand-focus-ring);
      background-color: var(--bg-surface-1);
    }
    .form-input.readonly {
      opacity: 0.65;
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
      gap: 5px;
      padding: 4px 8px;
      border-radius: var(--radius-xs);
      font-size: 11px;
      font-weight: 500;
      border: 1px solid var(--border-default);
      background-color: var(--bg-surface-2);
      box-shadow: var(--surface-highlight-sm);
    }
    .skill-tag.confirmed {
      border-color: var(--emerald-border);
      background-color: var(--emerald-bg);
      color: var(--emerald-400);
    }
    .skill-tag.target {
      border-color: var(--brand-border-subtle);
      background-color: var(--brand-bg-subtle);
      color: var(--brand-accent);
    }
    .skill-tag.exposure {
      color: var(--text-secondary);
    }

    .tag-remove-btn {
      background: transparent;
      border: none;
      color: inherit;
      opacity: 0.72;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 2px;
      border-radius: 2px;
      transition: opacity var(--motion-fast), background-color var(--motion-fast);
    }
    .tag-remove-btn:hover {
      opacity: 1;
      background-color: rgba(255, 255, 255, 0.08);
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
      color: var(--text-tertiary);
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
      padding: 3px 7px;
      font-size: 11px;
      font-weight: 500;
      border-radius: var(--radius-xs);
      background-color: var(--bg-surface-2);
      border: 1px solid var(--border-default);
      box-shadow: var(--surface-highlight-sm);
      color: var(--text-secondary);
      cursor: pointer;
      transition: all var(--motion-fast);
    }
    .quick-pill-btn:hover:not(:disabled) {
      background-color: var(--bg-surface-3);
      border-color: var(--border-strong);
      color: var(--text-primary);
    }
    .quick-pill-btn:active:not(:disabled) {
      transform: scale(0.97);
    }
    .quick-pill-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .custom-add-field-row {
      display: flex;
      gap: var(--space-2);
      min-width: 0;
    }
    .custom-skill-input {
      flex: 1;
      min-width: 0;
      height: 34px;
      background-color: var(--bg-surface-2);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-xs);
      padding: 0 10px;
      font-family: inherit;
      font-size: 12px;
      color: var(--text-primary);
      transition: border-color var(--motion-fast), box-shadow var(--motion-fast), background-color var(--motion-fast);
    }
    .custom-skill-input:hover {
      border-color: var(--border-strong);
    }
    .custom-skill-input:focus {
      outline: none;
      border-color: var(--brand-primary);
      box-shadow: 0 0 0 2px var(--brand-focus-ring);
      background-color: var(--bg-surface-1);
    }
    .btn-add-skill {
      padding: 0 12px;
      height: 34px;
      background-color: var(--bg-surface-2);
      border: 1px solid var(--border-default);
      box-shadow: var(--surface-highlight-sm);
      border-radius: var(--radius-xs);
      color: var(--text-primary);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      flex-shrink: 0;
      transition: all var(--motion-fast);
    }
    .btn-add-skill:hover {
      background-color: var(--bg-surface-3);
      border-color: var(--border-strong);
    }
    .btn-add-skill:active {
      transform: scale(0.98);
    }

    /* Projects Card */
    .projects-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-2-5);
    }
    .project-item-card {
      padding: var(--space-3);
      background-color: var(--bg-surface-2);
      border: 1px solid var(--border-default);
      box-shadow: var(--surface-highlight-sm);
      border-radius: var(--radius-xs);
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }
    .project-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-2);
      flex-wrap: wrap;
    }
    .project-name {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
    }
    .project-context {
      font-size: 11px;
      color: var(--text-tertiary);
    }
    .project-tech-row {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .project-tech-chip {
      font-family: var(--font-mono);
      font-size: 10px;
      padding: 1px 6px;
      background-color: var(--bg-surface-1);
      border: 1px solid var(--border-subtle);
      border-radius: 3px;
      color: var(--text-secondary);
    }
    .project-bullets {
      margin: 0;
      padding-left: 16px;
      display: flex;
      flex-direction: column;
      gap: 3px;
      font-size: 12px;
      color: var(--text-secondary);
    }

    /* Resume Parser Card & Dropzone */
    .cv-dropzone {
      border: 1.5px dashed var(--border-strong);
      background-color: var(--bg-surface-2);
      box-shadow: var(--surface-highlight-sm);
      border-radius: var(--radius-sm);
      padding: var(--space-5) var(--space-4);
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: var(--space-2-5);
      transition: border-color var(--motion-fast), background-color var(--motion-fast), box-shadow var(--motion-fast);
    }
    .cv-dropzone:hover {
      border-color: var(--brand-border-subtle);
      background-color: var(--bg-surface-3);
    }
    .cv-dropzone.dragover {
      border-color: var(--brand-primary);
      background-color: var(--brand-bg-subtle);
      box-shadow: 0 0 0 2px var(--brand-focus-ring), var(--surface-highlight-sm);
    }

    .dropzone-icon-box {
      width: 42px;
      height: 42px;
      border-radius: 50%;
      background-color: var(--bg-surface-1);
      border: 1px solid var(--border-default);
      box-shadow: var(--surface-highlight-sm), var(--shadow-xs);
      color: var(--brand-accent);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform var(--motion-fast);
    }
    .cv-dropzone.dragover .dropzone-icon-box {
      transform: scale(1.08);
    }

    .dropzone-text-group {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .dropzone-main-text {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
    }
    .dropzone-sub-text {
      font-size: 11px;
      color: var(--text-tertiary);
    }

    .btn-choose-file {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      min-height: 34px;
      padding: 6px 14px;
      background-color: var(--bg-surface-1);
      border: 1px solid var(--border-default);
      box-shadow: var(--surface-highlight-sm), var(--shadow-xs);
      border-radius: var(--radius-xs);
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary);
      cursor: pointer;
      margin-top: 2px;
      transition: all var(--motion-fast);
    }
    .btn-choose-file:hover {
      background-color: var(--bg-surface-3);
      border-color: var(--border-strong);
    }
    .btn-choose-file:active {
      transform: scale(0.98);
    }
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    .selected-file-chip {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      padding: 7px 10px;
      background-color: var(--brand-bg-subtle);
      border: 1px solid var(--brand-border-subtle);
      box-shadow: var(--surface-highlight-sm);
      border-radius: var(--radius-xs);
    }
    .file-name-left {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--brand-accent);
      min-width: 0;
    }
    .file-label {
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .chip-dismiss-btn {
      background: transparent;
      border: none;
      color: var(--brand-accent);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 4px;
      border-radius: var(--radius-xs);
    }
    .chip-dismiss-btn:hover {
      background-color: rgba(99, 102, 241, 0.16);
    }

    .paste-fallback-field {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .paste-fallback-field label {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-secondary);
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
      height: 38px;
      background-color: var(--brand-primary);
      border: 1px solid var(--brand-primary);
      box-shadow: var(--surface-highlight-sm);
      border-radius: var(--radius-xs);
      color: #ffffff;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all var(--motion-fast);
    }
    .parse-submit-btn:hover:not(:disabled) {
      background-color: var(--brand-primary-hover);
      box-shadow: var(--shadow-glow-brand);
    }
    .parse-submit-btn:active:not(:disabled) {
      transform: scale(0.98);
    }
    .parse-submit-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    /* Modal Backdrop */
    .cv-modal-backdrop {
      position: fixed;
      inset: 0;
      background-color: rgba(9, 9, 11, 0.78);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      z-index: 1200;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4);
    }

    .cv-modal-panel {
      width: 100%;
      max-width: 560px;
      background-color: var(--bg-surface-1);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      box-shadow: var(--surface-highlight), var(--shadow-lg);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: modalEnter 0.2s var(--ease-spring);
    }
    @keyframes modalEnter {
      from {
        opacity: 0;
        transform: translateY(6px) scale(0.98);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    .modal-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-3-5) var(--space-4);
      border-bottom: 1px solid var(--border-subtle);
      box-shadow: var(--surface-highlight-sm);
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
      color: var(--text-primary);
    }
    .modal-close-btn {
      background: var(--bg-surface-2);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-xs);
      color: var(--text-secondary);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      transition: all var(--motion-fast);
    }
    .modal-close-btn:hover {
      color: var(--text-primary);
      border-color: var(--border-strong);
      background: var(--bg-surface-3);
    }

    .modal-body {
      padding: var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-3-5);
      max-height: 420px;
      overflow-y: auto;
    }
    .modal-intro {
      margin: 0;
      font-size: 12px;
      color: var(--text-secondary);
      line-height: 1.45;
    }

    .review-meta-summary {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: var(--space-2-5) var(--space-3);
      background-color: var(--bg-surface-2);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-xs);
    }
    .review-meta-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-3);
      font-size: 12px;
    }
    .review-meta-key {
      font-weight: 600;
      color: var(--text-tertiary);
    }
    .review-meta-val {
      font-weight: 500;
      color: var(--text-primary);
      text-align: right;
    }

    .review-section-title {
      margin: 0 0 var(--space-2) 0;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .modal-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: var(--space-2);
      padding: var(--space-3) var(--space-4);
      border-top: 1px solid var(--border-subtle);
      background-color: var(--bg-surface-2);
    }

    .modal-cancel-btn {
      padding: 7px 14px;
      min-height: 36px;
      background-color: var(--bg-surface-1);
      border: 1px solid var(--border-default);
      box-shadow: var(--surface-highlight-sm);
      border-radius: var(--radius-xs);
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all var(--motion-fast);
    }
    .modal-cancel-btn:hover {
      background-color: var(--bg-surface-3);
      border-color: var(--border-strong);
      color: var(--text-primary);
    }
    .modal-cancel-btn:active {
      transform: scale(0.98);
    }

    .text-emerald { color: var(--emerald-400); }
    .text-brand { color: var(--brand-accent); }
    .text-muted { color: var(--text-tertiary); }

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
      .calibration-actions {
        width: 100%;
      }
      .calibration-actions ui-button {
        flex: 1;
      }
      .calibration-actions ::ng-deep .ui-btn {
        width: 100%;
        min-height: 44px;
      }
      .export-json-btn {
        min-height: 44px;
      }
      .form-row-2 {
        grid-template-columns: 1fr;
      }
      .form-input,
      .custom-skill-input,
      .btn-add-skill,
      .btn-choose-file,
      .parse-submit-btn {
        min-height: 44px;
      }
      .modal-close-btn {
        width: 44px;
        height: 44px;
      }
      .modal-cancel-btn {
        min-height: 44px;
      }
    }

    @media (max-width: 400px) {
      .custom-add-field-row {
        flex-direction: column;
      }
      .btn-add-skill {
        width: 100%;
      }
    }
  `],
})
export class ProfileComponent implements OnInit {
  @ViewChild('fileInput') fileInputRef?: ElementRef<HTMLInputElement>;

  private readonly api = inject(ApiService);
  private readonly telegram = inject(TelegramService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

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
  reviewData: CvReviewData = {
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
    projects: [],
    experiences: [],
    educations: [],
  };

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.parsedCvResult()) {
      this.parsedCvResult.set(null);
    }
  }

  ngOnInit(): void {
    this.loadProfile();
  }

  loadProfile(): void {
    this.api
      .getProfile()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
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
        error: (e: unknown) => console.error('Failed to load profile:', e),
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
    this.isSaving.set(true);
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
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isSaving.set(false);
          this.telegram.haptic('success');
          this.toast.show('Profile updated successfully!', 'success');
          this.loadProfile();
        },
        error: () => {
          this.isSaving.set(false);
          this.telegram.haptic('error');
          this.toast.show('Failed to save profile', 'error');
        },
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

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (file) {
      this.selectedFile = file;
      this.selectedFileName = file.name;
      this.toast.show(`Selected ${file.name}`, 'info', 1500);
    }
    if (input) {
      input.value = '';
    }
  }

  clearSelectedFile(): void {
    this.selectedFile = null;
    this.selectedFileName = '';
    if (this.fileInputRef?.nativeElement) {
      this.fileInputRef.nativeElement.value = '';
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent): void {
    const current = event.currentTarget as HTMLElement | null;
    const related = event.relatedTarget as Node | null;
    if (current && related && current.contains(related)) {
      return;
    }
    this.isDragging = false;
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

    obs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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
          projects: [...(result.projects || [])],
          experiences: [...(result.experiences || [])],
          educations: [...(result.educations || [])],
        };
      },
      error: (err: unknown) => {
        this.isParsing.set(false);
        this.toast.show(
          'Failed to parse CV: ' + this.extractErrorMessage(err),
          'error'
        );
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
    this.api
      .confirmCvData(this.reviewData)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isSaving.set(false);
          this.parsedCvResult.set(null);
          this.clearSelectedFile();
          this.rawCvText = '';
          this.telegram.haptic('success');
          this.toast.show('CV facts confirmed & applied to profile!', 'success');
          this.loadProfile();
        },
        error: (err: unknown) => {
          this.isSaving.set(false);
          this.toast.show(
            'Error saving profile: ' + this.extractErrorMessage(err),
            'error'
          );
        },
      });
  }

  private extractErrorMessage(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const detail = (err.error as { detail?: string } | null)?.detail;
      return detail || err.message;
    }
    if (err instanceof Error) return err.message;
    return 'Unknown error';
  }
}
