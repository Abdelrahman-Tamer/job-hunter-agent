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
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { TelegramService } from '../../core/services/telegram.service';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent } from '../../core/components/icon/icon.component';
import {
  UiArchitecturalMotifComponent,
  UiBadgeComponent,
  UiButtonComponent,
  UiCardComponent,
  UiMatchPillComponent,
} from '../../core/components/ui';
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
  portfolio_url: string;
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
  imports: [
    FormsModule,
    IconComponent,
    UiArchitecturalMotifComponent,
    UiBadgeComponent,
    UiButtonComponent,
    UiCardComponent,
    UiMatchPillComponent,
  ],
  template: `
    <div class="profile-intelligence-view">
      <!-- Architectural Hero Header -->
      <header class="profile-hero">
        <ui-architectural-motif variant="header" />

        <div class="hero-inner">
          <div class="header-titles">
            <div class="title-row">
              <h1 class="page-title">Candidate Profile</h1>
              <ui-badge tone="copper" size="sm">Algorithm Grounding</ui-badge>
            </div>
            <p class="page-subtitle">
              Calibrate verified skills, academic credentials, target tracks, and portfolio links used for matching.
            </p>
          </div>
        </div>
      </header>

      <!-- Frosted Calibration & Save Strip -->
      <ui-card variant="glass" padding="md" class="calibration-strip">
        <div class="calibration-inner">
          <div class="calibration-left">
            <ui-match-pill
              [score]="calculateCompleteness()"
              label="Complete"
              size="md"
            />
            <div class="calibration-meta">
              <div class="meta-title-row">
                <span class="calibration-headline">Matching Engine Calibrated</span>
                <span class="live-dot-indicator" aria-hidden="true"></span>
              </div>
              <p class="calibration-detail-text">
                Verified skills, experience years, and target tracks directly calibrate match scores and morning digests.
              </p>
            </div>
          </div>

          <div class="calibration-actions">
            <ui-button
              variant="secondary"
              size="md"
              ariaLabel="Export profile as JSON"
              (clicked)="exportProfile()"
            >
              <app-icon name="file-text" [size]="14" />
              <span>Export JSON</span>
            </ui-button>

            <ui-button
              variant="primary"
              size="md"
              [loading]="isSaving()"
              ariaLabel="Save profile changes"
              (clicked)="saveProfile()"
            >
              <app-icon name="check" [size]="14" />
              <span>{{ isSaving() ? 'Saving...' : 'Save Profile Changes' }}</span>
            </ui-button>
          </div>
        </div>
      </ui-card>

      <!-- Two-Column Architectural Workspace -->
      <div class="profile-grid-workspace">
        <!-- Left Column: Identity, Tracks & Skills Tag Matrix -->
        <div class="specs-column">
          <!-- 1. Identity & Academic Credentials -->
          <ui-card variant="elevated" padding="lg">
            <header class="card-header">
              <div class="header-left-title">
                <app-icon name="user" [size]="15" class="text-copper" />
                <h2 class="card-heading">Identity &amp; Academic Credentials</h2>
              </div>
              <ui-badge tone="emerald" size="sm">Verified</ui-badge>
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

              <div class="form-row-3">
                <div class="form-field">
                  <label for="linkedin">LinkedIn URL</label>
                  <input
                    id="linkedin"
                    type="url"
                    [(ngModel)]="linkedinUrl"
                    placeholder="https://linkedin.com/in/..."
                    class="form-input"
                  />
                </div>
                <div class="form-field">
                  <label for="github">GitHub URL</label>
                  <input
                    id="github"
                    type="url"
                    [(ngModel)]="githubUrl"
                    placeholder="https://github.com/..."
                    class="form-input"
                  />
                </div>
                <div class="form-field">
                  <label for="portfolio">Portfolio / CV Link</label>
                  <input
                    id="portfolio"
                    type="url"
                    [(ngModel)]="portfolioUrl"
                    placeholder="https://your-site.dev"
                    class="form-input"
                  />
                </div>
              </div>
            </div>
          </ui-card>

          <!-- 2. Target Tracks & Career Direction -->
          <ui-card variant="elevated" padding="lg">
            <header class="card-header">
              <div class="header-left-title">
                <app-icon name="compass" [size]="15" class="text-copper" />
                <h2 class="card-heading">Target Tracks &amp; Seniority</h2>
              </div>
              <ui-badge tone="neutral" size="sm" [mono]="true">
                {{ targetRoleTerms().length }} role terms
              </ui-badge>
            </header>

            <div class="form-layout-fields">
              <div class="form-row-2">
                <div class="form-field">
                  <label for="careerDirection">Career Direction</label>
                  <input
                    id="careerDirection"
                    type="text"
                    dir="auto"
                    [(ngModel)]="careerDirection"
                    placeholder="Frontend Engineering (Angular / Modern Web)"
                    class="form-input"
                  />
                </div>
                <div class="form-field">
                  <label for="priorityTarget">Priority Track &amp; Seniority</label>
                  <input
                    id="priorityTarget"
                    type="text"
                    dir="auto"
                    [(ngModel)]="priorityTarget"
                    placeholder="Junior / Mid Frontend — Egypt & Worldwide Remote"
                    class="form-input"
                  />
                </div>
              </div>

              <div class="skills-manager-block">
                <div class="chips-flex-wrap">
                  @for (roleTerm of targetRoleTerms(); track roleTerm; let i = $index) {
                    <span class="skill-tag neutral">
                      <span class="tag-title" dir="auto">{{ roleTerm }}</span>
                      <button
                        type="button"
                        (click)="removeRoleTerm(i)"
                        class="tag-remove-btn"
                        [attr.aria-label]="'Remove target role ' + roleTerm"
                      >
                        <app-icon name="x" [size]="10" />
                      </button>
                    </span>
                  }
                </div>

                <div class="custom-add-field-row">
                  <input
                    type="text"
                    dir="auto"
                    [(ngModel)]="newRoleTerm"
                    (keyup.enter)="addRoleTerm()"
                    placeholder="Add target role title (e.g. Angular Engineer, UI Developer)..."
                    aria-label="Add target role title"
                    class="custom-skill-input"
                  />
                  <ui-button variant="secondary" size="md" (clicked)="addRoleTerm()">
                    <span>Add Role</span>
                  </ui-button>
                </div>
              </div>
            </div>
          </ui-card>

          <!-- 3. Verified Technical Stack (Emerald) -->
          <ui-card variant="elevated" padding="lg">
            <header class="card-header">
              <div class="header-left-title">
                <app-icon name="check-circle" [size]="15" class="text-emerald" />
                <h2 class="card-heading">Verified Technical Stack</h2>
              </div>
              <span class="counter-tag text-emerald tabular-nums">
                {{ confirmedSkills().length }} Confirmed
              </span>
            </header>
            <p class="card-sub-description">
              Verified technical proficiencies extracted from your resume or approved projects. Heavily weighted in match scoring.
            </p>

            <div class="skills-manager-block">
              <div class="chips-flex-wrap">
                @for (s of confirmedSkills(); track s; let i = $index) {
                  <span class="skill-tag confirmed">
                    <app-icon name="check" [size]="10" />
                    <span class="tag-title" dir="auto">{{ s }}</span>
                    <button
                      type="button"
                      (click)="removeSkill('confirmed', i)"
                      class="tag-remove-btn"
                      [attr.aria-label]="'Remove confirmed skill ' + s"
                    >
                      <app-icon name="x" [size]="10" />
                    </button>
                  </span>
                }
              </div>

              <div class="quick-suggest-strip">
                <span class="suggest-label">Quick Add</span>
                <div class="suggestions-list">
                  @for (sug of popularSuggestions; track sug) {
                    <button
                      type="button"
                      (click)="quickAddSkill('confirmed', sug)"
                      [disabled]="confirmedSkills().includes(sug)"
                      class="quick-pill-btn"
                    >
                      <app-icon name="plus" [size]="10" />
                      <span>{{ sug }}</span>
                    </button>
                  }
                </div>
              </div>

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
                <ui-button variant="secondary" size="md" (clicked)="addSkill('confirmed')">
                  <span>Add Skill</span>
                </ui-button>
              </div>
            </div>
          </ui-card>

          <!-- 4. Target Learning Goals (Warm Copper) -->
          <ui-card variant="elevated" padding="lg">
            <header class="card-header">
              <div class="header-left-title">
                <app-icon name="sparkles" [size]="15" class="text-copper" />
                <h2 class="card-heading">Target Learning Goals</h2>
              </div>
              <span class="counter-tag text-copper tabular-nums">
                {{ targetSkills().length }} Goals
              </span>
            </header>
            <p class="card-sub-description">
              Technologies you are actively targeting next, kept distinct from verified competence.
            </p>

            <div class="skills-manager-block">
              <div class="chips-flex-wrap">
                @for (s of targetSkills(); track s; let i = $index) {
                  <span class="skill-tag target">
                    <span class="tag-title" dir="auto">{{ s }}</span>
                    <button
                      type="button"
                      (click)="removeSkill('target', i)"
                      class="tag-remove-btn"
                      [attr.aria-label]="'Remove target skill ' + s"
                    >
                      <app-icon name="x" [size]="10" />
                    </button>
                  </span>
                }
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
                <ui-button variant="secondary" size="md" (clicked)="addSkill('target')">
                  <span>Add Goal</span>
                </ui-button>
              </div>
            </div>
          </ui-card>

          <!-- 5. Exposure & Familiarity -->
          <ui-card variant="elevated" padding="lg">
            <header class="card-header">
              <div class="header-left-title">
                <app-icon name="layers" [size]="15" class="text-muted" />
                <h2 class="card-heading">Exposure &amp; Familiarity</h2>
              </div>
              <span class="counter-tag text-muted tabular-nums">
                {{ exposureSkills().length }} Skills
              </span>
            </header>
            <p class="card-sub-description">
              Tools, platforms, and peripheral technologies used across supporting work.
            </p>

            <div class="skills-manager-block">
              <div class="chips-flex-wrap">
                @for (s of exposureSkills(); track s; let i = $index) {
                  <span class="skill-tag exposure">
                    <span class="tag-title" dir="auto">{{ s }}</span>
                    <button
                      type="button"
                      (click)="removeSkill('exposure', i)"
                      class="tag-remove-btn"
                      [attr.aria-label]="'Remove exposure skill ' + s"
                    >
                      <app-icon name="x" [size]="10" />
                    </button>
                  </span>
                }
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
                <ui-button variant="secondary" size="md" (clicked)="addSkill('exposure')">
                  <span>Add Exposure</span>
                </ui-button>
              </div>
            </div>
          </ui-card>

          <!-- 6. Indexed Engineering Projects -->
          @if (profile()?.projects?.length) {
            <ui-card variant="elevated" padding="lg">
              <header class="card-header">
                <div class="header-left-title">
                  <app-icon name="briefcase" [size]="15" class="text-copper" />
                  <h2 class="card-heading">Indexed Engineering Projects</h2>
                </div>
                <span class="counter-tag text-muted tabular-nums">
                  {{ profile()!.projects!.length }} Projects
                </span>
              </header>

              <div class="projects-list">
                @for (proj of profile()!.projects; track proj.name) {
                  <article class="project-item-card">
                    <div class="project-head">
                      <h3 class="project-name" dir="auto">{{ proj.name }}</h3>
                      @if (proj.context) {
                        <span class="project-context" dir="auto">{{ proj.context }}</span>
                      }
                    </div>
                    @if (proj.technologies.length) {
                      <div class="project-tech-row">
                        @for (tech of proj.technologies; track tech) {
                          <span class="project-tech-chip" dir="auto">{{ tech }}</span>
                        }
                      </div>
                    }
                    @if (proj.bullets.length) {
                      <ul class="project-bullets">
                        @for (bullet of proj.bullets; track bullet) {
                          <li dir="auto">{{ bullet }}</li>
                        }
                      </ul>
                    }
                  </article>
                }
              </div>
            </ui-card>
          }
        </div>

        <!-- Right Column: Document Intelligence & Resume Parser -->
        <div class="parser-column">
          <ui-card variant="elevated" padding="lg">
            <header class="card-header">
              <div class="header-left-title">
                <app-icon name="upload-cloud" [size]="15" class="text-copper" />
                <h2 class="card-heading">Resume Intelligence</h2>
              </div>
              <ui-badge tone="neutral" size="sm">Local Ingestion</ui-badge>
            </header>

            <p class="card-sub-description">
              Upload your CV or paste raw text to extract confirmed skills, degree facts, and projects locally before updating your profile.
            </p>

            <div
              class="cv-dropzone"
              [class.dragover]="isDragging"
              (dragover)="onDragOver($event)"
              (dragleave)="onDragLeave($event)"
              (drop)="onDrop($event)"
            >
              <div class="dropzone-icon-box" aria-hidden="true">
                <app-icon name="upload-cloud" [size]="22" />
              </div>
              <div class="dropzone-text-group">
                <span class="dropzone-main-text">Drag &amp; drop resume file here</span>
                <span class="dropzone-sub-text tabular-nums">PDF, DOCX, or TXT (Max 10 MB)</span>
              </div>
              <label
                class="btn-choose-file"
                tabindex="0"
                (keydown.enter)="fileInput.click()"
                (keydown.space)="$event.preventDefault(); fileInput.click()"
              >
                <app-icon name="file-text" [size]="13" />
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

            @if (selectedFileName) {
              <div class="selected-file-chip">
                <div class="file-name-left">
                  <app-icon name="file-text" [size]="13" />
                  <span class="file-label" dir="auto">{{ selectedFileName }}</span>
                </div>
                <button
                  type="button"
                  (click)="clearSelectedFile()"
                  class="chip-dismiss-btn"
                  aria-label="Clear selected file"
                >
                  <app-icon name="x" [size]="13" />
                </button>
              </div>
            }

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

            <ui-button
              variant="primary"
              size="md"
              [fullWidth]="true"
              [loading]="isParsing()"
              [disabled]="isParsing() || (!selectedFile && !rawCvText.trim())"
              (clicked)="triggerParse()"
            >
              <app-icon name="sparkles" [size]="14" />
              <span>{{ isParsing() ? 'Extracting Facts...' : 'Extract & Parse Skills' }}</span>
            </ui-button>
          </ui-card>
        </div>
      </div>

      <!-- CV Review Confirmation Dialog -->
      @if (parsedCvResult()) {
        <div
          class="cv-modal-backdrop"
          (click)="parsedCvResult.set(null)"
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-title"
        >
          <div class="cv-modal-panel" (click)="$event.stopPropagation()">
            <header class="modal-top">
              <div class="modal-top-left">
                <app-icon name="check-circle" [size]="16" class="text-emerald" />
                <h2 id="review-title" class="modal-title">Review Extracted Facts</h2>
              </div>
              <button
                type="button"
                (click)="parsedCvResult.set(null)"
                class="modal-close-btn"
                aria-label="Close dialog"
              >
                <app-icon name="x" [size]="15" />
              </button>
            </header>

            <div class="modal-body custom-scrollbar">
              <p class="modal-intro">
                Review and confirm the technical competencies discovered from your resume before updating your profile.
              </p>

              @if (reviewData.full_name || reviewData.education_institution) {
                <div class="review-meta-summary">
                  @if (reviewData.full_name) {
                    <div class="review-meta-row">
                      <span class="review-meta-key">Name</span>
                      <span class="review-meta-val" dir="auto">{{ reviewData.full_name }}</span>
                    </div>
                  }
                  @if (reviewData.education_institution) {
                    <div class="review-meta-row">
                      <span class="review-meta-key">Education</span>
                      <span class="review-meta-val" dir="auto">{{ reviewData.education_institution }}</span>
                    </div>
                  }
                  @if (reviewData.projects.length) {
                    <div class="review-meta-row">
                      <span class="review-meta-key">Projects</span>
                      <span class="review-meta-val tabular-nums">{{ reviewData.projects.length }} detected</span>
                    </div>
                  }
                </div>
              }

              <div class="review-section">
                <h3 class="review-section-title tabular-nums">
                  Confirmed Skills ({{ reviewData.confirmed_skills.length }})
                </h3>
                <div class="chips-flex-wrap">
                  @for (s of reviewData.confirmed_skills; track s; let i = $index) {
                    <span class="skill-tag confirmed">
                      <app-icon name="check" [size]="10" />
                      <span class="tag-title" dir="auto">{{ s }}</span>
                      <button
                        type="button"
                        (click)="removeReviewSkill(i)"
                        class="tag-remove-btn"
                        [attr.aria-label]="'Remove extracted skill ' + s"
                      >
                        <app-icon name="x" [size]="10" />
                      </button>
                    </span>
                  }
                </div>
              </div>
            </div>

            <footer class="modal-footer">
              <ui-button variant="secondary" size="md" (clicked)="parsedCvResult.set(null)">
                <span>Cancel</span>
              </ui-button>
              <ui-button variant="primary" size="md" [loading]="isSaving()" (clicked)="confirmAndSaveProfile()">
                <span>Confirm &amp; Apply</span>
              </ui-button>
            </footer>
          </div>
        </div>
      }
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
      max-width: 1160px;
      margin: 0 auto;
      min-width: 0;
    }

    /* Architectural Hero */
    .profile-hero {
      position: relative;
      overflow: hidden;
      border-radius: var(--radius-lg);
      background-color: var(--surface-elevated);
      border: 1px solid var(--border-hairline);
      box-shadow: var(--border-specular), var(--shadow-sm);
      padding: var(--space-5) var(--space-6);
    }

    .hero-inner {
      position: relative;
      z-index: 1;
    }

    .title-row {
      display: flex;
      align-items: center;
      gap: var(--space-2-5);
      flex-wrap: wrap;
    }

    .page-title {
      margin: 0;
      font-family: var(--font-display);
      font-size: var(--text-h1);
      font-weight: 700;
      letter-spacing: var(--tracking-tight);
      color: var(--ink-primary);
    }

    .page-subtitle {
      margin: var(--space-1) 0 0 0;
      font-size: var(--text-sm);
      color: var(--ink-secondary);
      line-height: 1.5;
    }

    /* Calibration Strip */
    .calibration-strip {
      display: block;
    }

    .calibration-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-4);
      flex-wrap: wrap;
    }

    .calibration-left {
      display: flex;
      align-items: center;
      gap: var(--space-3-5);
      min-width: 0;
      flex: 1 1 280px;
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
      font-family: var(--font-display);
      font-size: var(--text-sm);
      font-weight: 600;
      color: var(--ink-primary);
    }

    .live-dot-indicator {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background-color: var(--semantic-emerald);
      flex-shrink: 0;
    }

    .calibration-detail-text {
      margin: 0;
      font-size: var(--text-xs);
      color: var(--ink-muted);
      max-width: 540px;
      line-height: 1.45;
    }

    .calibration-actions {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
    }

    /* Workspace 2-Column Grid */
    .profile-grid-workspace {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 360px;
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

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      border-bottom: 1px solid var(--border-hairline);
      padding-bottom: var(--space-3);
      margin-bottom: var(--space-3);
    }

    .header-left-title {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-width: 0;
    }

    .card-heading {
      margin: 0;
      font-family: var(--font-display);
      font-size: var(--text-sm);
      font-weight: 600;
      letter-spacing: var(--tracking-snug);
      color: var(--ink-primary);
    }

    .counter-tag {
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      font-weight: 600;
    }

    .card-sub-description {
      margin: 0 0 var(--space-3) 0;
      font-size: var(--text-xs);
      color: var(--ink-secondary);
      line-height: 1.5;
    }

    /* Form Fields */
    .form-layout-fields {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .form-row-2 {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-3);
    }

    .form-row-3 {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--space-3);
    }

    .form-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }

    .form-field label {
      font-size: var(--text-xs);
      font-weight: 600;
      color: var(--ink-secondary);
    }

    .form-input,
    .form-textarea {
      width: 100%;
      min-height: 38px;
      background-color: var(--surface-subtle);
      border: 1px solid var(--border-hairline);
      border-radius: var(--radius-sm);
      padding: 8px 12px;
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      color: var(--ink-primary);
      transition:
        border-color var(--dur-fast) var(--ease-spring),
        background-color var(--dur-fast) var(--ease-spring),
        box-shadow var(--dur-fast) var(--ease-spring);
    }

    .form-input:hover:not(.readonly),
    .form-textarea:hover {
      border-color: var(--border-strong);
    }

    .form-input:focus,
    .form-textarea:focus {
      outline: none;
      border-color: var(--accent-copper);
      box-shadow: 0 0 0 2px var(--accent-copper-focus);
      background-color: var(--surface-elevated);
    }

    .form-input.readonly {
      opacity: 0.65;
      cursor: not-allowed;
    }

    /* Skills Tag Matrix */
    .skills-manager-block {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .chips-flex-wrap {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .skill-tag {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 9px;
      border-radius: var(--radius-full);
      font-size: var(--text-xs);
      font-weight: 500;
      border: 1px solid var(--border-hairline);
      background-color: var(--surface-subtle);
      color: var(--ink-secondary);
    }

    .skill-tag.confirmed {
      border-color: var(--semantic-emerald-border);
      background-color: var(--semantic-emerald-soft);
      color: var(--semantic-emerald-text);
    }

    .skill-tag.target {
      border-color: var(--border-copper);
      background-color: var(--accent-copper-soft);
      color: var(--accent-copper-text);
    }

    .skill-tag.neutral {
      border-color: var(--border-hairline);
      background-color: var(--surface-subtle);
      color: var(--ink-primary);
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
      border-radius: var(--radius-full);
      transition: opacity var(--dur-fast) var(--ease-spring), background-color var(--dur-fast) var(--ease-spring);
    }

    .tag-remove-btn:hover {
      opacity: 1;
      background-color: var(--surface-active);
    }

    .quick-suggest-strip {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .suggest-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--ink-muted);
    }

    .suggestions-list {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }

    .quick-pill-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 9px;
      font-size: var(--text-xs);
      font-weight: 500;
      border-radius: var(--radius-full);
      background-color: var(--surface-subtle);
      border: 1px solid var(--border-hairline);
      color: var(--ink-secondary);
      cursor: pointer;
      transition:
        background-color var(--dur-fast) var(--ease-spring),
        border-color var(--dur-fast) var(--ease-spring),
        color var(--dur-fast) var(--ease-spring);
    }

    .quick-pill-btn:hover:not(:disabled) {
      background-color: var(--surface-muted);
      border-color: var(--border-strong);
      color: var(--ink-primary);
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
      height: 36px;
      background-color: var(--surface-subtle);
      border: 1px solid var(--border-hairline);
      border-radius: var(--radius-sm);
      padding: 0 12px;
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      color: var(--ink-primary);
      transition:
        border-color var(--dur-fast) var(--ease-spring),
        box-shadow var(--dur-fast) var(--ease-spring),
        background-color var(--dur-fast) var(--ease-spring);
    }

    .custom-skill-input:hover {
      border-color: var(--border-strong);
    }

    .custom-skill-input:focus {
      outline: none;
      border-color: var(--accent-copper);
      box-shadow: 0 0 0 2px var(--accent-copper-focus);
      background-color: var(--surface-elevated);
    }

    /* Projects Card */
    .projects-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-2-5);
    }

    .project-item-card {
      padding: var(--space-3);
      background-color: var(--surface-subtle);
      border: 1px solid var(--border-hairline);
      border-radius: var(--radius-md);
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
      font-family: var(--font-display);
      font-size: var(--text-sm);
      font-weight: 600;
      color: var(--ink-primary);
    }

    .project-context {
      font-size: var(--text-xs);
      color: var(--ink-muted);
    }

    .project-tech-row {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    .project-tech-chip {
      font-family: var(--font-mono);
      font-size: 10px;
      padding: 2px 6px;
      background-color: var(--surface-elevated);
      border: 1px solid var(--border-hairline);
      border-radius: var(--radius-xs);
      color: var(--ink-secondary);
    }

    .project-bullets {
      margin: 0;
      padding-left: 16px;
      display: flex;
      flex-direction: column;
      gap: 3px;
      font-size: var(--text-xs);
      color: var(--ink-secondary);
    }

    /* Resume Dropzone */
    .cv-dropzone {
      border: 1.5px dashed var(--border-strong);
      background-color: var(--surface-subtle);
      border-radius: var(--radius-md);
      padding: var(--space-5) var(--space-4);
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: var(--space-2-5);
      margin-bottom: var(--space-3);
      transition:
        border-color var(--dur-fast) var(--ease-spring),
        background-color var(--dur-fast) var(--ease-spring),
        box-shadow var(--dur-fast) var(--ease-spring);
    }

    .cv-dropzone:hover {
      border-color: var(--border-copper);
    }

    .cv-dropzone.dragover {
      border-color: var(--accent-copper);
      background-color: var(--accent-copper-soft);
      box-shadow: 0 0 0 2px var(--accent-copper-focus);
    }

    .dropzone-icon-box {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background-color: var(--surface-elevated);
      border: 1px solid var(--border-hairline);
      box-shadow: var(--border-specular-sm), var(--shadow-xs);
      color: var(--accent-copper-text);
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
      font-size: var(--text-sm);
      font-weight: 600;
      color: var(--ink-primary);
    }

    .dropzone-sub-text {
      font-size: var(--text-xs);
      color: var(--ink-muted);
    }

    .btn-choose-file {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      min-height: 36px;
      padding: 6px 14px;
      background-color: var(--surface-elevated);
      border: 1px solid var(--border-hairline);
      box-shadow: var(--border-specular-sm), var(--shadow-xs);
      border-radius: var(--radius-sm);
      font-size: var(--text-xs);
      font-weight: 600;
      color: var(--ink-primary);
      cursor: pointer;
    }

    .btn-choose-file:hover {
      border-color: var(--border-strong);
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
      padding: 8px 10px;
      margin-bottom: var(--space-3);
      background-color: var(--accent-copper-soft);
      border: 1px solid var(--border-copper);
      border-radius: var(--radius-sm);
    }

    .file-name-left {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--accent-copper-text);
      min-width: 0;
    }

    .file-label {
      font-size: var(--text-xs);
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .chip-dismiss-btn {
      background: transparent;
      border: none;
      color: var(--accent-copper-text);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 28px;
      min-height: 28px;
      border-radius: var(--radius-xs);
    }

    .paste-fallback-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: var(--space-3);
    }

    .paste-fallback-field label {
      font-size: var(--text-xs);
      font-weight: 600;
      color: var(--ink-secondary);
    }

    .paste-area {
      resize: vertical;
    }

    /* CV Modal */
    .cv-modal-backdrop {
      position: fixed;
      inset: 0;
      background-color: rgba(12, 13, 16, 0.68);
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
      background-color: var(--surface-elevated);
      border: 1px solid var(--border-hairline);
      border-radius: var(--radius-lg);
      box-shadow: var(--border-specular), var(--shadow-lg);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: studioFadeUp var(--dur-base) var(--ease-out-expo) both;
    }

    .modal-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-4);
      border-bottom: 1px solid var(--border-hairline);
    }

    .modal-top-left {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .modal-title {
      margin: 0;
      font-family: var(--font-display);
      font-size: var(--text-md);
      font-weight: 600;
      color: var(--ink-primary);
    }

    .modal-close-btn {
      background: var(--surface-subtle);
      border: 1px solid var(--border-hairline);
      border-radius: var(--radius-sm);
      color: var(--ink-secondary);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 36px;
      min-height: 36px;
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
      font-size: var(--text-xs);
      color: var(--ink-secondary);
      line-height: 1.5;
    }

    .review-meta-summary {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: var(--space-3);
      background-color: var(--surface-subtle);
      border: 1px solid var(--border-hairline);
      border-radius: var(--radius-md);
    }

    .review-meta-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-3);
      font-size: var(--text-xs);
    }

    .review-meta-key {
      font-weight: 600;
      color: var(--ink-muted);
    }

    .review-meta-val {
      font-weight: 500;
      color: var(--ink-primary);
      text-align: right;
    }

    .review-section-title {
      margin: 0 0 var(--space-2) 0;
      font-size: var(--text-xs);
      font-weight: 600;
      color: var(--ink-primary);
    }

    .modal-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: var(--space-2);
      padding: var(--space-3-5) var(--space-4);
      border-top: 1px solid var(--border-hairline);
      background-color: var(--surface-elevated);
    }

    .text-emerald { color: var(--semantic-emerald-text); }
    .text-copper { color: var(--accent-copper-text); }
    .text-muted { color: var(--ink-muted); }

    @media (max-width: 960px) {
      .profile-grid-workspace {
        grid-template-columns: minmax(0, 1fr);
      }
      .form-row-3 {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 767px) {
      .profile-hero {
        padding: var(--space-4);
      }

      .form-row-2,
      .form-row-3 {
        grid-template-columns: minmax(0, 1fr);
      }

      .form-input,
      .custom-skill-input,
      .btn-choose-file,
      .quick-pill-btn {
        min-height: 44px;
      }

      .modal-close-btn {
        min-width: 44px;
        min-height: 44px;
      }

      .custom-add-field-row {
        flex-direction: column;
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
  portfolioUrl = '';
  careerDirection = '';
  priorityTarget = '';

  // Skills & Target Roles
  readonly confirmedSkills = signal<string[]>([]);
  readonly targetSkills = signal<string[]>([]);
  readonly exposureSkills = signal<string[]>([]);
  readonly targetRoleTerms = signal<string[]>([]);

  newConfirmedSkill = '';
  newTargetSkill = '';
  newExposureSkill = '';
  newRoleTerm = '';

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
    portfolio_url: '',
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
          this.portfolioUrl = p.portfolio_url || '';
          this.careerDirection = p.career_direction || '';
          this.priorityTarget = p.priority_target || '';
          this.confirmedSkills.set([...(p.confirmed_skills || [])]);
          this.targetSkills.set([...(p.target_skills || [])]);
          this.exposureSkills.set([...(p.learning_or_exposure_skills || [])]);
          this.targetRoleTerms.set([...(p.target_role_terms || [])]);
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
    if (this.linkedinUrl || this.githubUrl || this.portfolioUrl) score += 5;
    return Math.min(score, 100);
  }

  addRoleTerm(): void {
    const term = this.newRoleTerm.trim();
    if (term && !this.targetRoleTerms().includes(term)) {
      this.targetRoleTerms.update((list) => [...list, term]);
      this.newRoleTerm = '';
      this.telegram.haptic('selection');
    }
  }

  removeRoleTerm(index: number): void {
    this.telegram.haptic('light');
    this.targetRoleTerms.update((list) => list.filter((_, i) => i !== index));
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
        portfolio_url: this.portfolioUrl,
        career_direction: this.careerDirection,
        priority_target: this.priorityTarget,
        target_role_terms: this.targetRoleTerms(),
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
          portfolio_url: result.personal_info?.portfolio_url || this.portfolioUrl || '',
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
