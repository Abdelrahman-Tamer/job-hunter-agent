import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnInit,
  Output,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { TelegramService } from '../../services/telegram.service';
import { ToastService } from '../../services/toast.service';
import { IconComponent } from '../icon/icon.component';
import { UiBadgeComponent } from '../../../shared/ui/ui-badge.component';
import {
  ApplicationStatus,
  JobDetail,
  JobSummary,
} from '../../models/job.model';

@Component({
  selector: 'app-job-drawer',
  standalone: true,
  imports: [
    CommonModule,
    IconComponent,
    UiBadgeComponent,
  ],
  template: `
    <div
      class="drawer-backdrop"
      [class.open]="isOpen"
      (click)="onBackdropClick($event)"
      role="dialog"
      aria-modal="true"
      [attr.aria-label]="job?.title || 'Job details'"
    >
      <div class="drawer-panel" (click)="$event.stopPropagation()">
        <!-- Sticky Drawer Header -->
        <header class="drawer-header">
          <div class="header-left">
            <div class="company-avatar-box">
              <span>{{ job?.company?.charAt(0) || 'J' }}</span>
            </div>
            <div class="header-titles">
              <div class="company-row">
                <span class="company-name">{{ job?.company || 'Company' }}</span>
                <ui-badge
                  *ngIf="job?.is_social_post"
                  variant="social"
                  size="sm"
                  [dot]="true"
                >
                  LinkedIn Post
                </ui-badge>
              </div>
              <h2 class="job-title">{{ job?.title || 'Opportunity Details' }}</h2>
            </div>
          </div>

          <div class="header-actions">
            <a
              *ngIf="job?.original_application_url"
              [href]="job?.original_application_url"
              target="_blank"
              rel="noopener noreferrer"
              (click)="onApplyClick($event)"
              class="apply-primary-link"
              title="Apply Direct"
              aria-label="Apply direct on employer portal"
            >
              <span>Apply</span>
              <app-icon name="external-link" [size]="12"></app-icon>
            </a>

            <button
              (click)="copyJobLink()"
              class="action-icon-btn"
              [title]="copied() ? 'Copied URL!' : 'Copy link'"
              aria-label="Copy job link"
            >
              <app-icon [name]="copied() ? 'check' : 'copy'" [size]="14"></app-icon>
            </button>

            <button
              (click)="close()"
              class="action-icon-btn close-btn"
              title="Close (Esc)"
              aria-label="Close drawer"
            >
              <app-icon name="x" [size]="15"></app-icon>
            </button>
          </div>
        </header>

        <!-- Loading indicator -->
        <div *ngIf="isLoadingDetail()" class="loading-line-indicator">
          <div class="shimmer-active loading-bar"></div>
        </div>

        <!-- Scrollable Drawer Body -->
        <div class="drawer-body custom-scrollbar">
          <!-- Social Post Callout (when role originated from LinkedIn hiring post) -->
          <section *ngIf="job?.is_social_post" class="social-post-callout">
            <div class="social-callout-header">
              <app-icon name="message-square" [size]="14" class="social-glyph"></app-icon>
              <span class="social-callout-title">Direct Social Hiring Post</span>
            </div>
            <div class="social-callout-body">
              <p *ngIf="job?.poster_name" class="poster-info">
                <strong>Shared by:</strong> {{ job?.poster_name }}
              </p>
              <p *ngIf="job?.contact_hint" class="contact-hint-info">
                <strong>Contact Hint:</strong> {{ job?.contact_hint }}
              </p>
              <p class="social-disclaimer">
                This opportunity was surfaced from authentic recruiter outreach on LinkedIn. You can apply directly by reaching out to the poster.
              </p>
            </div>
          </section>

          <!-- Match Score & Core Telemetry -->
          <section class="telemetry-card">
            <div class="score-split">
              <div
                class="score-pill-large tabular-nums"
                [attr.data-band]="getScoreBand(job?.match_score || 0)"
              >
                <span class="score-val">{{ roundScore(job?.match_score || 0) }}%</span>
                <span class="score-lbl">Fit Score</span>
              </div>
              <div class="score-context">
                <div class="score-fit-label">
                  <app-icon name="sparkles" [size]="13" class="sparkle-icon"></app-icon>
                  <span>{{ getScoreFitText(job?.match_score || 0) }}</span>
                </div>
                <p class="score-reason">
                  {{ jobDetail()?.eligibility_reason || 'Verified match calculated against your target engineering profile.' }}
                </p>
              </div>
            </div>

            <!-- Key Badges Grid -->
            <div class="meta-chips-grid">
              <div class="meta-chip">
                <span class="meta-label">Segment</span>
                <span class="meta-value">
                  <app-icon name="compass" [size]="12"></app-icon>
                  {{ formatSegment(job?.opportunity_segment) }}
                </span>
              </div>
              <div class="meta-chip">
                <span class="meta-label">Workplace</span>
                <span class="meta-value">
                  <app-icon name="building" [size]="12"></app-icon>
                  {{ formatWorkplace(job?.workplace_type) }}
                </span>
              </div>
              <div class="meta-chip">
                <span class="meta-label">Eligibility</span>
                <span class="meta-value text-emerald">
                  <app-icon name="globe" [size]="12"></app-icon>
                  {{ formatEligibility(job?.eligibility) }}
                </span>
              </div>
              <div class="meta-chip">
                <span class="meta-label">Seniority</span>
                <span class="meta-value">
                  <app-icon name="user" [size]="12"></app-icon>
                  {{ formatSeniority(job?.seniority) }}
                </span>
              </div>
              <div class="meta-chip" *ngIf="job?.raw_location">
                <span class="meta-label">Location</span>
                <span class="meta-value text-truncate">
                  <app-icon name="map-pin" [size]="12"></app-icon>
                  {{ job?.raw_location }}
                </span>
              </div>
            </div>
          </section>

          <!-- Tracker Pipeline Stage Selector -->
          <section class="section-card">
            <div class="section-card-head">
              <div class="head-left">
                <app-icon name="bookmark" [size]="14"></app-icon>
                <h3 class="section-heading">Application Pipeline</h3>
              </div>
              <ui-badge variant="brand" size="sm">
                {{ formatStatus(currentStatus()) }}
              </ui-badge>
            </div>

            <div class="pipeline-stages-bar" role="radiogroup" aria-label="Pipeline stage">
              <button
                *ngFor="let s of availableStages"
                type="button"
                (click)="setJobStatus(s.status)"
                [class.active]="currentStatus() === s.status"
                class="stage-pill-btn"
                [attr.data-stage]="s.status"
              >
                <span>{{ s.label }}</span>
              </button>
            </div>
          </section>

          <!-- Skills Alignment Matrix -->
          <section class="section-card">
            <div class="section-card-head">
              <div class="head-left">
                <app-icon name="check-circle" [size]="14" class="text-emerald"></app-icon>
                <h3 class="section-heading">Matched Tech Stack</h3>
              </div>
              <span class="sub-counter tabular-nums">{{ matchedSkills().length }} aligned</span>
            </div>

            <div class="badges-wrap" *ngIf="matchedSkills().length > 0">
              <ui-badge
                *ngFor="let skill of matchedSkills()"
                variant="success"
                size="md"
              >
                <app-icon name="check" [size]="11"></app-icon>
                <span>{{ skill }}</span>
              </ui-badge>
            </div>
            <div *ngIf="matchedSkills().length === 0" class="empty-inline-note">
              <span>No explicit skill tags indexed for this role.</span>
            </div>

            <!-- Skill Gaps / Areas to Review -->
            <div *ngIf="skillGaps().length > 0" class="gaps-block">
              <div class="section-card-head sub-head">
                <div class="head-left">
                  <app-icon name="info" [size]="13" class="text-amber"></app-icon>
                  <h4 class="sub-heading">Requirements to Review</h4>
                </div>
                <span class="sub-counter text-amber tabular-nums">{{ skillGaps().length }} notes</span>
              </div>
              <div class="badges-wrap">
                <ui-badge
                  *ngFor="let gap of skillGaps()"
                  variant="warning"
                  size="md"
                >
                  <span>{{ gap }}</span>
                </ui-badge>
              </div>
            </div>
          </section>

          <!-- AI Outreach & Tailored Resume Toolkit -->
          <section class="section-card">
            <div class="section-card-head">
              <div class="head-left">
                <app-icon name="sparkles" [size]="14" class="text-brand"></app-icon>
                <h3 class="section-heading">AI Application Toolkit</h3>
              </div>
              <ui-badge variant="brand" size="sm">Gemini Powered</ui-badge>
            </div>

            <div class="toolkit-actions-row">
              <button
                type="button"
                (click)="toggleOutreachTool()"
                [class.active]="activeTool() === 'outreach'"
                class="tool-tab-btn"
              >
                <app-icon name="message-square" [size]="13"></app-icon>
                <span>Recruiter Outreach</span>
              </button>

              <button
                type="button"
                (click)="toggleCoverTool()"
                [class.active]="activeTool() === 'cover'"
                class="tool-tab-btn"
              >
                <app-icon name="file-text" [size]="13"></app-icon>
                <span>Cover Letter</span>
              </button>

              <a
                *ngIf="job?.id"
                [href]="api.getTailoredResumeUrl(job!.id)"
                target="_blank"
                download
                class="tool-tab-btn resume-pdf-btn"
                title="Download ATS PDF resume tailored for this role"
              >
                <app-icon name="download" [size]="13"></app-icon>
                <span>Tailored ATS Resume</span>
              </a>
            </div>

            <!-- Tool Result: Recruiter Outreach Kit -->
            <div *ngIf="activeTool() === 'outreach'" class="tool-content-drawer">
              <div class="tool-result-header">
                <span class="tool-result-title">Recruiter Outreach Kit</span>
                <button (click)="closeTool()" class="tool-dismiss-btn" aria-label="Close tool">
                  <app-icon name="x" [size]="12"></app-icon>
                </button>
              </div>

              <div *ngIf="isLoadingTool()" class="tool-loading-box">
                <div class="btn-spinner"></div>
                <span>Synthesizing tailored recruiter outreach...</span>
              </div>

              <div *ngIf="!isLoadingTool() && outreachData()" class="tool-cards-stack">
                <!-- 1. Connection Note -->
                <div class="outreach-block">
                  <div class="outreach-top">
                    <span class="outreach-label">LinkedIn Connection Note (&lt; 300 chars)</span>
                    <button (click)="copyText(outreachData()!.connection_note, 'conn')" class="copy-micro-btn">
                      <app-icon [name]="copiedKey() === 'conn' ? 'check' : 'copy'" [size]="11"></app-icon>
                      <span>{{ copiedKey() === 'conn' ? 'Copied' : 'Copy' }}</span>
                    </button>
                  </div>
                  <pre class="outreach-prose">{{ outreachData()!.connection_note }}</pre>
                  <span class="char-length-indicator tabular-nums">{{ outreachData()!.connection_note.length }}/300 chars</span>
                </div>

                <!-- 2. Recruiter InMail / Direct Message -->
                <div class="outreach-block">
                  <div class="outreach-top">
                    <span class="outreach-label">Recruiter InMail / Direct Message</span>
                    <button (click)="copyText(outreachData()!.inmail_dm, 'inmail')" class="copy-micro-btn">
                      <app-icon [name]="copiedKey() === 'inmail' ? 'check' : 'copy'" [size]="11"></app-icon>
                      <span>{{ copiedKey() === 'inmail' ? 'Copied' : 'Copy' }}</span>
                    </button>
                  </div>
                  <pre class="outreach-prose">{{ outreachData()!.inmail_dm }}</pre>
                </div>

                <!-- 3. Follow-up Note -->
                <div class="outreach-block" *ngIf="outreachData()!.follow_up_note">
                  <div class="outreach-top">
                    <span class="outreach-label">5-Day Follow-Up Message</span>
                    <button (click)="copyText(outreachData()!.follow_up_note, 'follow')" class="copy-micro-btn">
                      <app-icon [name]="copiedKey() === 'follow' ? 'check' : 'copy'" [size]="11"></app-icon>
                      <span>{{ copiedKey() === 'follow' ? 'Copied' : 'Copy' }}</span>
                    </button>
                  </div>
                  <pre class="outreach-prose">{{ outreachData()!.follow_up_note }}</pre>
                </div>
              </div>
            </div>

            <!-- Tool Result: Cover Letter -->
            <div *ngIf="activeTool() === 'cover'" class="tool-content-drawer">
              <div class="tool-result-header">
                <span class="tool-result-title">Tailored AI Cover Letter</span>
                <div class="header-tools">
                  <button
                    *ngIf="coverLetterText()"
                    (click)="copyText(coverLetterText()!, 'cover')"
                    class="copy-micro-btn"
                  >
                    <app-icon [name]="copiedKey() === 'cover' ? 'check' : 'copy'" [size]="11"></app-icon>
                    <span>{{ copiedKey() === 'cover' ? 'Copied' : 'Copy Letter' }}</span>
                  </button>
                  <button (click)="closeTool()" class="tool-dismiss-btn" aria-label="Close tool">
                    <app-icon name="x" [size]="12"></app-icon>
                  </button>
                </div>
              </div>

              <div *ngIf="isLoadingTool()" class="tool-loading-box">
                <div class="btn-spinner"></div>
                <span>Crafting custom cover letter...</span>
              </div>

              <div *ngIf="!isLoadingTool() && coverLetterText()" class="cover-letter-wrap">
                <pre class="outreach-prose cover-prose">{{ coverLetterText() }}</pre>
              </div>
            </div>
          </section>

          <!-- Job Description with RTL Support -->
          <section class="section-card description-card">
            <div class="section-card-head">
              <div class="head-left">
                <app-icon name="file-text" [size]="14"></app-icon>
                <h3 class="section-heading">Role Description</h3>
              </div>
              <span class="sub-counter">{{ job?.source_name }}</span>
            </div>

            <div
              class="prose-description"
              dir="auto"
              *ngIf="jobDetail()?.description_text; else fallbackDesc"
            >
              <p *ngFor="let paragraph of getParagraphs(jobDetail()?.description_text)">
                {{ paragraph }}
              </p>
            </div>
            <ng-template #fallbackDesc>
              <div class="prose-description fallback">
                <p>Curated frontend opportunity verified and classified by Frontend Radar autonomous pipeline.</p>
                <p>Click "Apply Direct" below to access the live hiring portal and submit your application.</p>
              </div>
            </ng-template>
          </section>
        </div>

        <!-- Sticky Drawer Bottom Bar -->
        <footer class="drawer-footer">
          <div class="footer-timestamp tabular-nums">
            <span *ngIf="job?.published_at">
              Published {{ formatRelativeDate(job?.published_at) }}
            </span>
            <span *ngIf="!job?.published_at && job?.first_seen_at">
              Discovered {{ formatRelativeDate(job?.first_seen_at) }}
            </span>
          </div>

          <div class="footer-btn-group">
            <button
              type="button"
              (click)="toggleSave()"
              class="drawer-btn secondary-btn"
              [class.saved]="currentStatus() === 'SAVED'"
            >
              <app-icon [name]="currentStatus() === 'SAVED' ? 'check' : 'bookmark'" [size]="13"></app-icon>
              <span>{{ currentStatus() === 'SAVED' ? 'Saved' : 'Save' }}</span>
            </button>

            <button
              type="button"
              (click)="toggleApplied()"
              class="drawer-btn secondary-btn"
              [class.applied]="currentStatus() === 'APPLIED'"
            >
              <app-icon [name]="currentStatus() === 'APPLIED' ? 'check' : 'send'" [size]="13"></app-icon>
              <span>{{ currentStatus() === 'APPLIED' ? 'Applied' : 'Mark Applied' }}</span>
            </button>

            <a
              *ngIf="job?.original_application_url"
              [href]="job?.original_application_url"
              target="_blank"
              rel="noopener noreferrer"
              (click)="onApplyClick($event)"
              class="drawer-btn primary-btn"
            >
              <span>Apply Direct</span>
              <app-icon name="external-link" [size]="13"></app-icon>
            </a>
          </div>
        </footer>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: contents;
    }

    .drawer-backdrop {
      position: fixed;
      inset: 0;
      background-color: rgba(9, 9, 11, 0.7);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      z-index: 1100;
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

    .drawer-panel {
      width: 100%;
      max-width: 640px;
      height: 100%;
      background-color: var(--color-bg-surface-1);
      border-left: 1px solid var(--color-border-subtle);
      box-shadow: var(--shadow-xl);
      display: flex;
      flex-direction: column;
      transform: translateX(100%);
      transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
      overflow: hidden;
    }

    .drawer-backdrop.open .drawer-panel {
      transform: translateX(0);
    }

    /* Sticky Drawer Header */
    .drawer-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--space-4) var(--space-5);
      background-color: var(--color-bg-surface-1);
      border-bottom: 1px solid var(--color-border-subtle);
      position: sticky;
      top: 0;
      z-index: 20;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      min-width: 0;
      flex: 1;
    }

    .company-avatar-box {
      width: 38px;
      height: 38px;
      border-radius: var(--radius-sm);
      background-color: var(--color-bg-surface-2);
      border: 1px solid var(--color-border-subtle);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: var(--text-sm);
      color: var(--color-brand-accent);
      flex-shrink: 0;
    }

    .header-titles {
      display: flex;
      flex-direction: column;
      min-width: 0;
      gap: 2px;
    }

    .company-row {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .company-name {
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
      font-weight: 500;
      letter-spacing: -0.01em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .job-title {
      font-size: var(--text-base);
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--color-text-primary);
      margin: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.25;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: var(--space-1-5);
      flex-shrink: 0;
    }

    .apply-primary-link {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 5px 12px;
      background-color: var(--color-brand-accent);
      color: #ffffff;
      font-size: 12px;
      font-weight: 600;
      border-radius: var(--radius-xs);
      text-decoration: none;
      transition: background-color var(--motion-fast);
    }
    .apply-primary-link:hover {
      background-color: var(--color-brand-hover);
    }

    .action-icon-btn {
      width: 30px;
      height: 30px;
      border-radius: var(--radius-xs);
      background: transparent;
      border: 1px solid var(--color-border-subtle);
      color: var(--color-text-secondary);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background-color var(--motion-fast), color var(--motion-fast);
    }
    .action-icon-btn:hover {
      background-color: var(--color-bg-surface-hover);
      color: var(--color-text-primary);
    }

    .action-icon-btn.close-btn:hover {
      color: var(--color-danger);
    }

    /* Loading Line */
    .loading-line-indicator {
      height: 2px;
      width: 100%;
      background-color: var(--color-bg-surface-2);
      overflow: hidden;
    }
    .loading-bar {
      height: 100%;
      width: 100%;
      background: linear-gradient(90deg, transparent, var(--color-brand-accent), transparent);
    }

    /* Drawer Body */
    .drawer-body {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-4) var(--space-5);
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    /* Social Post Callout */
    .social-post-callout {
      background-color: rgba(59, 130, 246, 0.08);
      border: 1px solid rgba(59, 130, 246, 0.22);
      border-radius: var(--radius-sm);
      padding: var(--space-3) var(--space-4);
    }

    .social-callout-header {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin-bottom: var(--space-2);
    }
    .social-glyph {
      color: var(--color-brand-accent);
    }
    .social-callout-title {
      font-size: var(--text-xs);
      font-weight: 700;
      color: var(--color-brand-accent);
      letter-spacing: -0.01em;
    }

    .social-callout-body {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
      line-height: 1.4;
    }
    .social-callout-body strong {
      color: var(--color-text-primary);
    }
    .social-disclaimer {
      margin-top: 4px;
      font-size: 11px;
      color: var(--color-text-muted);
    }

    /* Telemetry Card */
    .telemetry-card {
      background-color: var(--color-bg-surface-2);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-sm);
      padding: var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .score-split {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }

    .score-pill-large {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-width: 68px;
      height: 60px;
      border-radius: var(--radius-sm);
      background-color: var(--color-bg-surface-1);
      border: 1px solid var(--color-border-subtle);
      flex-shrink: 0;
    }
    .score-pill-large .score-val {
      font-size: 20px;
      font-weight: 800;
      line-height: 1;
    }
    .score-pill-large .score-lbl {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--color-text-muted);
      margin-top: 3px;
    }

    .score-pill-large[data-band="emerald"] {
      border-color: rgba(16, 185, 129, 0.35);
      background-color: rgba(16, 185, 129, 0.08);
      color: var(--color-success);
    }
    .score-pill-large[data-band="indigo"] {
      border-color: var(--color-brand-border);
      background-color: var(--color-brand-subtle);
      color: var(--color-brand-accent);
    }
    .score-pill-large[data-band="amber"] {
      border-color: rgba(245, 158, 11, 0.35);
      background-color: rgba(245, 158, 11, 0.08);
      color: var(--color-warning);
    }
    .score-pill-large[data-band="muted"] {
      color: var(--color-text-muted);
    }

    .score-context {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .score-fit-label {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: var(--text-xs);
      font-weight: 700;
      color: var(--color-text-primary);
    }
    .sparkle-icon {
      color: var(--color-brand-accent);
    }
    .score-reason {
      margin: 0;
      font-size: 12px;
      color: var(--color-text-secondary);
      line-height: 1.4;
    }

    /* Meta Chips Grid */
    .meta-chips-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
      gap: var(--space-2);
      padding-top: var(--space-2);
      border-top: 1px solid var(--color-border-subtle);
    }

    .meta-chip {
      display: flex;
      flex-direction: column;
      gap: 2px;
      background-color: var(--color-bg-surface-1);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xs);
      padding: 6px 8px;
    }
    .meta-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--color-text-muted);
    }
    .meta-value {
      font-size: 12px;
      font-weight: 600;
      color: var(--color-text-primary);
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    /* General Section Cards */
    .section-card {
      background-color: var(--color-bg-surface-2);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-sm);
      padding: var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .section-card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .head-left {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .section-heading {
      margin: 0;
      font-size: var(--text-xs);
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--color-text-primary);
    }
    .sub-counter {
      font-size: 11px;
      color: var(--color-text-muted);
      font-weight: 500;
    }

    /* Pipeline Stages Bar */
    .pipeline-stages-bar {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }

    .stage-pill-btn {
      padding: 5px 10px;
      border-radius: var(--radius-xs);
      font-size: 11px;
      font-weight: 500;
      background-color: var(--color-bg-surface-1);
      border: 1px solid var(--color-border-subtle);
      color: var(--color-text-secondary);
      cursor: pointer;
      transition: all var(--motion-fast);
    }
    .stage-pill-btn:hover {
      background-color: var(--color-bg-surface-hover);
      color: var(--color-text-primary);
    }
    .stage-pill-btn.active {
      background-color: var(--color-brand-subtle);
      border-color: var(--color-brand-border);
      color: var(--color-brand-accent);
      font-weight: 600;
    }

    /* Badges Wrap */
    .badges-wrap {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1-5);
    }

    .empty-inline-note {
      font-size: 12px;
      color: var(--color-text-muted);
      font-style: italic;
    }

    .gaps-block {
      margin-top: var(--space-3);
      padding-top: var(--space-3);
      border-top: 1px solid var(--color-border-subtle);
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }
    .sub-head {
      margin-bottom: 2px;
    }
    .sub-heading {
      margin: 0;
      font-size: 11px;
      font-weight: 600;
      color: var(--color-text-secondary);
    }

    /* AI Toolkit */
    .toolkit-actions-row {
      display: flex;
      gap: var(--space-2);
      flex-wrap: wrap;
    }

    .tool-tab-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 12px;
      border-radius: var(--radius-xs);
      font-size: 12px;
      font-weight: 500;
      background-color: var(--color-bg-surface-1);
      border: 1px solid var(--color-border-subtle);
      color: var(--color-text-secondary);
      cursor: pointer;
      text-decoration: none;
      transition: all var(--motion-fast);
    }
    .tool-tab-btn:hover {
      background-color: var(--color-bg-surface-hover);
      color: var(--color-text-primary);
      border-color: var(--color-border-default);
    }
    .tool-tab-btn.active {
      background-color: var(--color-brand-subtle);
      border-color: var(--color-brand-border);
      color: var(--color-brand-accent);
      font-weight: 600;
    }
    .tool-tab-btn.resume-pdf-btn {
      color: var(--color-brand-accent);
    }

    .tool-content-drawer {
      margin-top: var(--space-3);
      padding: var(--space-3);
      background-color: var(--color-bg-surface-1);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xs);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .tool-result-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--color-border-subtle);
      padding-bottom: var(--space-2);
    }
    .tool-result-title {
      font-size: 11px;
      font-weight: 700;
      color: var(--color-text-primary);
      letter-spacing: -0.01em;
    }
    .tool-dismiss-btn {
      background: transparent;
      border: none;
      color: var(--color-text-muted);
      cursor: pointer;
      display: flex;
      padding: 2px;
    }
    .tool-dismiss-btn:hover {
      color: var(--color-text-primary);
    }
    .header-tools {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .tool-loading-box {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-size: 12px;
      color: var(--color-text-secondary);
      padding: var(--space-2) 0;
    }

    .tool-cards-stack {
      display: flex;
      flex-direction: column;
      gap: var(--space-2-5);
    }

    .outreach-block {
      background-color: var(--color-bg-surface-2);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xs);
      padding: var(--space-2-5);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .outreach-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .outreach-label {
      font-size: 10px;
      font-weight: 600;
      color: var(--color-text-secondary);
    }
    .copy-micro-btn {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px 6px;
      background-color: var(--color-bg-surface-1);
      border: 1px solid var(--color-border-subtle);
      border-radius: 3px;
      color: var(--color-text-secondary);
      font-size: 10px;
      cursor: pointer;
    }
    .copy-micro-btn:hover {
      color: var(--color-text-primary);
      border-color: var(--color-border-default);
    }

    .outreach-prose {
      font-family: var(--font-sans);
      font-size: 12px;
      color: var(--color-text-primary);
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.45;
      margin: 4px 0 0 0;
      background: transparent;
      border: none;
      padding: 0;
    }
    .cover-prose {
      max-height: 320px;
      overflow-y: auto;
    }
    .char-length-indicator {
      font-size: 10px;
      color: var(--color-text-muted);
      align-self: flex-end;
    }

    /* Description Prose */
    .prose-description {
      font-size: 13px;
      line-height: 1.65;
      color: var(--color-text-secondary);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .prose-description p {
      margin: 0;
    }
    .prose-description.fallback {
      font-style: italic;
      color: var(--color-text-muted);
    }

    /* Drawer Footer */
    .drawer-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-5);
      background-color: var(--color-bg-surface-1);
      border-top: 1px solid var(--color-border-subtle);
      position: sticky;
      bottom: 0;
      z-index: 20;
    }

    .footer-timestamp {
      font-size: 11px;
      color: var(--color-text-muted);
      font-family: var(--font-mono);
    }

    .footer-btn-group {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .drawer-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 14px;
      border-radius: var(--radius-xs);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: all var(--motion-fast);
    }

    .drawer-btn.secondary-btn {
      background-color: var(--color-bg-surface-2);
      border: 1px solid var(--color-border-subtle);
      color: var(--color-text-primary);
    }
    .drawer-btn.secondary-btn:hover {
      background-color: var(--color-bg-surface-hover);
      border-color: var(--color-border-default);
    }
    .drawer-btn.secondary-btn.saved,
    .drawer-btn.secondary-btn.applied {
      background-color: var(--color-brand-subtle);
      border-color: var(--color-brand-border);
      color: var(--color-brand-accent);
    }

    .drawer-btn.primary-btn {
      background-color: var(--color-brand-accent);
      border: 1px solid transparent;
      color: #ffffff;
    }
    .drawer-btn.primary-btn:hover {
      background-color: var(--color-brand-hover);
    }

    .text-emerald {
      color: var(--color-success);
    }
    .text-amber {
      color: var(--color-warning);
    }
    .text-brand {
      color: var(--color-brand-accent);
    }
    .text-truncate {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 140px;
    }

    @media (max-width: 640px) {
      .drawer-panel {
        max-width: 100%;
      }
      .drawer-header {
        padding: var(--space-3);
      }
      .drawer-body {
        padding: var(--space-3);
      }
      .drawer-footer {
        padding: var(--space-3);
        flex-direction: column;
        align-items: stretch;
        gap: var(--space-2);
      }
      .footer-btn-group {
        justify-content: stretch;
      }
      .footer-btn-group .drawer-btn {
        flex: 1;
        justify-content: center;
      }
    }
  `],
})
export class JobDrawerComponent implements OnInit, OnChanges {
  @Input() isOpen = false;
  @Input() job: JobSummary | JobDetail | null = null;
  @Output() closeDrawer = new EventEmitter<void>();
  @Output() statusUpdated = new EventEmitter<{
    jobId: number;
    status: ApplicationStatus;
  }>();

  readonly api = inject(ApiService);
  private readonly telegram = inject(TelegramService);
  private readonly toast = inject(ToastService);

  readonly isLoadingDetail = signal<boolean>(false);
  readonly jobDetail = signal<JobDetail | null>(null);
  readonly copied = signal<boolean>(false);
  readonly currentStatus = signal<ApplicationStatus>('DISCOVERED');

  readonly activeTool = signal<'none' | 'outreach' | 'cover'>('none');
  readonly isLoadingTool = signal<boolean>(false);
  readonly outreachData = signal<{
    connection_note: string;
    inmail_dm: string;
    follow_up_note: string;
  } | null>(null);
  readonly coverLetterText = signal<string | null>(null);
  readonly copiedKey = signal<string | null>(null);

  readonly availableStages: { status: ApplicationStatus; label: string }[] = [
    { status: 'DISCOVERED', label: 'Discovered' },
    { status: 'SAVED', label: 'Saved' },
    { status: 'APPLIED', label: 'Applied' },
    { status: 'INTERVIEW', label: 'Interview' },
    { status: 'OFFER', label: 'Offer' },
    { status: 'REJECTED', label: 'Rejected' },
    { status: 'ARCHIVED', label: 'Archived' },
  ];

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.isOpen) {
      this.close();
    }
  }

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
        this.toast.show(`Stage updated to ${this.formatStatus(status)}`, 'success', 2000);
        this.statusUpdated.emit({ jobId: this.job!.id, status });
      },
      error: (e) => {
        console.error('Failed to update job status:', e);
        this.toast.show('Failed to update stage', 'error');
      },
    });
  }

  toggleSave(): void {
    const nextStatus = this.currentStatus() === 'SAVED' ? 'DISCOVERED' : 'SAVED';
    this.setJobStatus(nextStatus);
  }

  toggleApplied(): void {
    const nextStatus = this.currentStatus() === 'APPLIED' ? 'DISCOVERED' : 'APPLIED';
    this.setJobStatus(nextStatus);
  }

  toggleOutreachTool(): void {
    if (this.activeTool() === 'outreach') {
      this.activeTool.set('none');
      return;
    }
    this.activeTool.set('outreach');
    this.telegram.haptic('selection');
    if (!this.outreachData() && this.job) {
      this.isLoadingTool.set(true);
      this.api.getOutreachMessages(this.job.id).subscribe({
        next: (data) => {
          this.outreachData.set(data);
          this.isLoadingTool.set(false);
        },
        error: () => this.isLoadingTool.set(false),
      });
    }
  }

  toggleCoverTool(): void {
    if (this.activeTool() === 'cover') {
      this.activeTool.set('none');
      return;
    }
    this.activeTool.set('cover');
    this.telegram.haptic('selection');
    if (!this.coverLetterText() && this.job) {
      this.isLoadingTool.set(true);
      this.api.getCoverLetter(this.job.id).subscribe({
        next: (data) => {
          this.coverLetterText.set(data.cover_letter);
          this.isLoadingTool.set(false);
        },
        error: () => this.isLoadingTool.set(false),
      });
    }
  }

  closeTool(): void {
    this.activeTool.set('none');
  }

  copyText(text: string, key: string): void {
    navigator.clipboard.writeText(text);
    this.telegram.haptic('selection');
    this.toast.show('Copied to clipboard', 'info', 1500);
    this.copiedKey.set(key);
    setTimeout(() => this.copiedKey.set(null), 2000);
  }

  copyJobLink(): void {
    if (!this.job?.original_application_url) return;
    navigator.clipboard.writeText(this.job.original_application_url);
    this.telegram.haptic('selection');
    this.toast.show('Application link copied', 'info', 1500);
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

  getScoreBand(score: number): 'emerald' | 'indigo' | 'amber' | 'muted' {
    if (score >= 80) return 'emerald';
    if (score >= 65) return 'indigo';
    if (score >= 50) return 'amber';
    return 'muted';
  }

  getScoreFitText(score: number): string {
    if (score >= 80) return 'Top Tier Match (80+)';
    if (score >= 65) return 'Strong Fit (65+)';
    if (score >= 50) return 'Relevant Role (50+)';
    return 'Exploratory Match';
  }

  formatSegment(seg?: string): string {
    switch (seg) {
      case 'EGYPT':
        return 'Egypt Frontend';
      case 'REMOTE_GCC_ABROAD':
        return 'Remote GCC & Abroad';
      default:
        return seg || 'Frontend';
    }
  }

  formatEligibility(e?: string): string {
    switch (e) {
      case 'EGYPT_ELIGIBLE':
        return 'Egypt Eligible';
      case 'REMOTE_WORLDWIDE':
        return 'Worldwide Remote';
      case 'REMOTE_REGION_POSSIBLE':
        return 'Region Possible';
      case 'RELOCATION_REQUIRED':
        return 'Relocation Required';
      default:
        return e || 'Eligible';
    }
  }

  formatWorkplace(w?: string): string {
    switch (w) {
      case 'REMOTE':
        return 'Remote';
      case 'HYBRID':
        return 'Hybrid';
      case 'ON_SITE':
        return 'On-site';
      default:
        return w || 'Remote';
    }
  }

  formatSeniority(s?: string): string {
    switch (s) {
      case 'JUNIOR':
        return 'Junior';
      case 'MID':
        return 'Mid-level';
      case 'SENIOR':
        return 'Senior';
      case 'GRADUATE':
        return 'Graduate';
      case 'ENTRY':
        return 'Entry-level';
      default:
        return s || 'Engineer';
    }
  }

  formatStatus(st: string): string {
    return st.charAt(0) + st.slice(1).toLowerCase();
  }

  formatRelativeDate(dateStr?: string | null): string {
    if (!dateStr) return 'Recently';
    try {
      const date = new Date(dateStr);
      const diffMs = Date.now() - date.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours < 1) return 'Just now';
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return 'Recently';
    }
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
