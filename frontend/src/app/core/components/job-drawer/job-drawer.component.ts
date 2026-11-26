import {
  Component,
  DestroyRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, of, switchMap } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { TelegramService } from '../../services/telegram.service';
import { ToastService } from '../../services/toast.service';
import { IconComponent } from '../icon/icon.component';
import {
  UiArchitecturalMotifComponent,
  UiBadgeComponent,
  UiButtonComponent,
  UiCardComponent,
  UiMatchPillComponent,
} from '../ui';
import {
  ApplicationStatus,
  JobDetail,
  JobSummary,
} from '../../models/job.model';

@Component({
  selector: 'app-job-drawer',
  standalone: true,
  imports: [
    IconComponent,
    UiArchitecturalMotifComponent,
    UiBadgeComponent,
    UiButtonComponent,
    UiCardComponent,
    UiMatchPillComponent,
  ],
  template: `
    <div
      class="drawer-backdrop"
      [class.open]="isOpen"
      [attr.inert]="!isOpen ? '' : null"
      [attr.aria-hidden]="!isOpen"
      (click)="onBackdropClick($event)"
      role="dialog"
      aria-modal="true"
      [attr.aria-label]="displayJob()?.title || 'Job details'"
    >
      <div class="drawer-panel" (click)="$event.stopPropagation()">
        <!-- Sticky Architectural Hero Header -->
        <header class="drawer-header">
          <ui-architectural-motif variant="card" />

          <div class="drawer-header-inner">
            <div class="header-top-bar">
              <div class="header-company-meta">
                <div class="company-avatar-box" aria-hidden="true">
                  <span>{{ displayJob()?.company?.charAt(0) || 'J' }}</span>
                </div>
                <div class="company-meta-text">
                  <span class="company-name" dir="auto">{{ displayJob()?.company || 'Company' }}</span>
                  <div class="header-badges">
                    @if (displayJob()?.is_social_post) {
                      <ui-badge tone="glass" size="sm" [dot]="true">
                        LinkedIn Post
                      </ui-badge>
                    } @else if (displayJob()?.origin_board) {
                      <ui-badge tone="glass" size="sm">
                        {{ displayJob()?.origin_board }}
                      </ui-badge>
                    }
                    <ui-badge tone="neutral" size="sm">
                      {{ formatWorkplace(displayJob()?.workplace_type) }}
                    </ui-badge>
                  </div>
                </div>
              </div>

              <div class="header-utility-actions">
                <button
                  type="button"
                  (click)="copyJobLink()"
                  class="action-icon-btn"
                  [title]="copied() ? 'Copied URL' : 'Copy job link'"
                  aria-label="Copy job link"
                >
                  <app-icon [name]="copied() ? 'check' : 'copy'" [size]="15" />
                </button>

                <button
                  type="button"
                  (click)="close()"
                  class="action-icon-btn close-btn"
                  title="Close (Esc)"
                  aria-label="Close drawer"
                >
                  <app-icon name="x" [size]="16" />
                </button>
              </div>
            </div>

            <div class="hero-title-row">
              <h2 class="job-title" dir="auto">
                {{ displayJob()?.title || 'Opportunity Details' }}
              </h2>
              <ui-match-pill
                [score]="roundScore(displayJob()?.match_score || 0)"
                size="md"
              />
            </div>

            <!-- Quick Pipeline Stage Selector -->
            <div class="pipeline-stages-bar" role="radiogroup" aria-label="Application pipeline stage">
              @for (stage of availableStages; track stage.status) {
                <button
                  type="button"
                  role="radio"
                  [attr.aria-checked]="currentStatus() === stage.status"
                  (click)="setJobStatus(stage.status)"
                  [class.active]="currentStatus() === stage.status"
                  class="stage-pill-btn"
                >
                  {{ stage.label }}
                </button>
              }
            </div>
          </div>
        </header>

        <!-- Detail Loading Indicator -->
        @if (isLoadingDetail()) {
          <div class="loading-line-indicator" aria-hidden="true">
            <div class="shimmer-active loading-bar"></div>
          </div>
        }

        <!-- Scrollable Drawer Body -->
        <div class="drawer-body custom-scrollbar">
          <!-- Prominent Direct Recruiter Contact Architectural Panel -->
          @if (displayJob(); as activeJob) {
            @if (hasAnyDirectContact(activeJob)) {
              <ui-card variant="subtle" padding="md" class="direct-contact-panel">
                <div class="section-card-head">
                  <div class="head-left">
                    <app-icon name="send" [size]="15" class="text-copper" />
                    <h3 class="section-heading">Direct Recruiter Contact</h3>
                  </div>
                  <ui-badge tone="copper" size="sm" [dot]="true">Direct Channel</ui-badge>
                </div>

                <div class="direct-contact-list">
                  @if (getSafeEmail(activeJob.direct_email); as email) {
                    <div class="contact-row">
                      <ui-button
                        variant="primary"
                        size="sm"
                        ariaLabel="Email recruiter directly"
                        (clicked)="openDirectEmail(email)"
                      >
                        <app-icon name="mail" [size]="13" />
                        <span>Email Direct</span>
                      </ui-button>

                      <span class="contact-address tabular-nums">{{ email }}</span>

                      <ui-button
                        variant="ghost"
                        size="sm"
                        ariaLabel="Copy recruiter email"
                        (clicked)="copyText(email, 'direct_email')"
                      >
                        <app-icon [name]="copiedKey() === 'direct_email' ? 'check' : 'copy'" [size]="12" />
                        <span>{{ copiedKey() === 'direct_email' ? 'Copied' : 'Copy Email' }}</span>
                      </ui-button>
                    </div>
                  }

                  @if (activeJob.whatsapp_contact; as waRaw) {
                    <div class="contact-row">
                      @if (getWhatsAppHref(waRaw); as waUrl) {
                        <ui-button
                          variant="secondary"
                          size="sm"
                          ariaLabel="Message recruiter on WhatsApp"
                          (clicked)="openSafeExternal(waUrl)"
                        >
                          <app-icon name="message-square" [size]="13" />
                          <span>WhatsApp</span>
                        </ui-button>
                      }
                      <span class="contact-address tabular-nums">{{ waRaw }}</span>
                      <ui-button
                        variant="ghost"
                        size="sm"
                        ariaLabel="Copy WhatsApp contact"
                        (clicked)="copyText(waRaw, 'whatsapp')"
                      >
                        <app-icon [name]="copiedKey() === 'whatsapp' ? 'check' : 'copy'" [size]="12" />
                        <span>{{ copiedKey() === 'whatsapp' ? 'Copied' : 'Copy' }}</span>
                      </ui-button>
                    </div>
                  }

                  @if (getSafeHttpUrl(activeJob.apply_form_url); as formUrl) {
                    <div class="contact-row">
                      <ui-button
                        variant="secondary"
                        size="sm"
                        ariaLabel="Open direct application form"
                        (clicked)="openSafeExternal(formUrl)"
                      >
                        <app-icon name="external-link" [size]="13" />
                        <span>Direct Form</span>
                      </ui-button>
                      <span class="contact-address truncate">{{ formUrl }}</span>
                    </div>
                  }
                </div>
              </ui-card>
            }
          }

          <!-- Social Post Callout -->
          @if (displayJob()?.is_social_post) {
            <section class="drawer-section social-post-callout">
              <div class="section-card-head">
                <div class="head-left">
                  <app-icon name="message-square" [size]="14" class="text-steel" />
                  <h3 class="section-heading">Direct Social Hiring Post</h3>
                </div>
                <ui-badge tone="glass" size="sm">LinkedIn</ui-badge>
              </div>
              <div class="social-callout-body">
                @if (displayJob()?.poster_name) {
                  <p class="social-line">
                    <strong>Shared by:</strong> {{ displayJob()?.poster_name }}
                  </p>
                }
                @if (displayJob()?.contact_hint) {
                  <p class="social-line">
                    <strong>Contact hint:</strong> {{ displayJob()?.contact_hint }}
                  </p>
                }
                <p class="social-disclaimer">
                  Surfaced from direct recruiter outreach on LinkedIn. Reach out via the direct channel above or the original post.
                </p>
              </div>
            </section>
          }

          <!-- Match Intelligence Section -->
          <section class="drawer-section">
            <div class="section-card-head">
              <div class="head-left">
                <app-icon name="sparkles" [size]="14" class="text-copper" />
                <h3 class="section-heading">Match Intelligence</h3>
              </div>
              <span class="sub-counter tabular-nums">{{ getScoreFitText(displayJob()?.match_score || 0) }}</span>
            </div>

            <p class="intelligence-summary">
              {{ jobDetail()?.eligibility_reason || 'Verified match calculated against your target engineering profile.' }}
            </p>

            <!-- Telemetry Metadata Grid -->
            <div class="meta-chips-grid">
              <div class="meta-chip">
                <span class="meta-label">Segment</span>
                <span class="meta-value">{{ formatSegment(displayJob()?.opportunity_segment) }}</span>
              </div>
              <div class="meta-chip">
                <span class="meta-label">Eligibility</span>
                <span class="meta-value text-emerald">{{ formatEligibility(displayJob()?.eligibility) }}</span>
              </div>
              <div class="meta-chip">
                <span class="meta-label">Seniority</span>
                <span class="meta-value">{{ formatSeniority(displayJob()?.seniority) }}</span>
              </div>
              @if (displayJob()?.raw_location) {
                <div class="meta-chip">
                  <span class="meta-label">Location</span>
                  <span class="meta-value truncate" dir="auto">{{ displayJob()?.raw_location }}</span>
                </div>
              }
            </div>

            <!-- Match Reasons & Aligned Stack -->
            @if ((jobDetail()?.match_reasons?.length || 0) > 0) {
              <ul class="reasons-list">
                @for (reason of jobDetail()?.match_reasons || []; track reason) {
                  <li class="reason-item">
                    <app-icon name="check-circle" [size]="13" class="text-emerald" />
                    <span>{{ reason }}</span>
                  </li>
                }
              </ul>
            }

            <div class="skills-subsection">
              <div class="sub-head">
                <span class="sub-heading">Matched Stack</span>
                <span class="sub-counter tabular-nums">{{ matchedSkills().length }} aligned</span>
              </div>
              @if (matchedSkills().length > 0) {
                <div class="badges-wrap">
                  @for (skill of matchedSkills(); track skill) {
                    <ui-badge tone="emerald" size="sm">
                      <app-icon name="check" [size]="10" />
                      <span>{{ skill }}</span>
                    </ui-badge>
                  }
                </div>
              } @else {
                <p class="empty-inline-note">No explicit skill tags indexed for this role.</p>
              }
            </div>

            <!-- Skill Gaps / Caution Notes -->
            @if (skillGaps().length > 0) {
              <div class="skills-subsection gaps-block">
                <div class="sub-head">
                  <span class="sub-heading text-crimson">Gaps &amp; Requirements to Review</span>
                  <span class="sub-counter text-amber tabular-nums">{{ skillGaps().length }} flags</span>
                </div>
                <div class="badges-wrap">
                  @for (gap of skillGaps(); track gap) {
                    <ui-badge tone="crimson" size="sm">
                      {{ gap }}
                    </ui-badge>
                  }
                </div>
              </div>
            }
          </section>

          <!-- AI Outreach & Cover Letter Studio Card -->
          <section class="drawer-section">
            <div class="section-card-head">
              <div class="head-left">
                <app-icon name="file-text" [size]="14" class="text-copper" />
                <h3 class="section-heading">AI Application Studio</h3>
              </div>
              <ui-badge tone="copper" size="sm">Gemini</ui-badge>
            </div>

            <div class="toolkit-actions-row">
              <ui-button
                [variant]="activeTool() === 'outreach' ? 'primary' : 'secondary'"
                size="sm"
                (clicked)="toggleOutreachTool()"
              >
                <app-icon name="message-square" [size]="13" />
                <span>Recruiter Outreach</span>
              </ui-button>

              <ui-button
                [variant]="activeTool() === 'cover' ? 'primary' : 'secondary'"
                size="sm"
                (clicked)="toggleCoverTool()"
              >
                <app-icon name="file-text" [size]="13" />
                <span>Cover Letter</span>
              </ui-button>

              @if (displayJob(); as activeJob) {
                <a
                  [href]="api.getTailoredResumeUrl(activeJob.id)"
                  target="_blank"
                  download
                  (click)="onResumeClick($event, activeJob.id)"
                  class="studio-resume-link"
                  title="Download ATS PDF resume tailored for this role"
                >
                  <app-icon name="download" [size]="13" />
                  <span>Tailored ATS PDF</span>
                </a>
              }
            </div>

            @if (activeTool() === 'outreach') {
              <ui-card variant="subtle" padding="sm" class="studio-preview-card">
                <div class="tool-result-header">
                  <span class="tool-result-title">Recruiter Outreach Kit</span>
                  <div class="header-tools">
                    <ui-button
                      variant="ghost"
                      size="sm"
                      [disabled]="isLoadingTool()"
                      ariaLabel="Regenerate outreach"
                      (clicked)="regenerateOutreach()"
                    >
                      <app-icon name="refresh" [size]="12" />
                      <span>Regenerate</span>
                    </ui-button>
                    <button type="button" (click)="closeTool()" class="tool-dismiss-btn" aria-label="Close tool">
                      <app-icon name="x" [size]="13" />
                    </button>
                  </div>
                </div>

                @if (isLoadingTool()) {
                  <div class="tool-loading-box">
                    <span class="btn-spinner"></span>
                    <span>Synthesizing tailored recruiter outreach...</span>
                  </div>
                } @else if (outreachData(); as outreach) {
                  <div class="tool-cards-stack">
                    <div class="outreach-block">
                      <div class="outreach-top">
                        <span class="outreach-label">LinkedIn Connection Note (&lt; 300 chars)</span>
                        <ui-button
                          variant="ghost"
                          size="sm"
                          (clicked)="copyText(outreach.connection_note, 'conn')"
                        >
                          <app-icon [name]="copiedKey() === 'conn' ? 'check' : 'copy'" [size]="11" />
                          <span>{{ copiedKey() === 'conn' ? 'Copied' : 'Copy' }}</span>
                        </ui-button>
                      </div>
                      <pre class="outreach-prose">{{ outreach.connection_note }}</pre>
                      <span class="char-length-indicator tabular-nums">{{ outreach.connection_note.length }}/300 chars</span>
                    </div>

                    <div class="outreach-block">
                      <div class="outreach-top">
                        <span class="outreach-label">Recruiter InMail / Direct Message</span>
                        <ui-button
                          variant="ghost"
                          size="sm"
                          (clicked)="copyText(outreach.inmail_dm, 'inmail')"
                        >
                          <app-icon [name]="copiedKey() === 'inmail' ? 'check' : 'copy'" [size]="11" />
                          <span>{{ copiedKey() === 'inmail' ? 'Copied' : 'Copy' }}</span>
                        </ui-button>
                      </div>
                      <pre class="outreach-prose">{{ outreach.inmail_dm }}</pre>
                    </div>

                    @if (outreach.follow_up_note) {
                      <div class="outreach-block">
                        <div class="outreach-top">
                          <span class="outreach-label">5-Day Follow-Up Message</span>
                          <ui-button
                            variant="ghost"
                            size="sm"
                            (clicked)="copyText(outreach.follow_up_note, 'follow')"
                          >
                            <app-icon [name]="copiedKey() === 'follow' ? 'check' : 'copy'" [size]="11" />
                            <span>{{ copiedKey() === 'follow' ? 'Copied' : 'Copy' }}</span>
                          </ui-button>
                        </div>
                        <pre class="outreach-prose">{{ outreach.follow_up_note }}</pre>
                      </div>
                    }
                  </div>
                }
              </ui-card>
            }

            @if (activeTool() === 'cover') {
              <ui-card variant="subtle" padding="sm" class="studio-preview-card">
                <div class="tool-result-header">
                  <span class="tool-result-title">Tailored Cover Letter</span>
                  <div class="header-tools">
                    @if (coverLetterText(); as letter) {
                      <ui-button
                        variant="subtle"
                        size="sm"
                        (clicked)="copyText(letter, 'cover')"
                      >
                        <app-icon [name]="copiedKey() === 'cover' ? 'check' : 'copy'" [size]="11" />
                        <span>{{ copiedKey() === 'cover' ? 'Copied' : 'Copy' }}</span>
                      </ui-button>
                    }
                    <ui-button
                      variant="ghost"
                      size="sm"
                      [disabled]="isLoadingTool()"
                      ariaLabel="Regenerate cover letter"
                      (clicked)="regenerateCover()"
                    >
                      <app-icon name="refresh" [size]="12" />
                      <span>Regenerate</span>
                    </ui-button>
                    <button type="button" (click)="closeTool()" class="tool-dismiss-btn" aria-label="Close tool">
                      <app-icon name="x" [size]="13" />
                    </button>
                  </div>
                </div>

                @if (isLoadingTool()) {
                  <div class="tool-loading-box">
                    <span class="btn-spinner"></span>
                    <span>Crafting custom cover letter...</span>
                  </div>
                } @else if (coverLetterText(); as letter) {
                  <pre class="outreach-prose cover-prose">{{ letter }}</pre>
                }
              </ui-card>
            }
          </section>

          <!-- Job Brief / Description -->
          <section class="drawer-section description-section">
            <div class="section-card-head">
              <div class="head-left">
                <app-icon name="briefcase" [size]="14" />
                <h3 class="section-heading">Job Brief</h3>
              </div>
              <span class="sub-counter">{{ displayJob()?.source_name }}</span>
            </div>

            @if (jobDetail()?.description_text; as descText) {
              <div class="prose-description" dir="auto">
                @for (paragraph of getParagraphs(descText); track $index) {
                  <p>{{ paragraph }}</p>
                }
              </div>
            } @else {
              <div class="prose-description fallback">
                <p>Curated frontend opportunity verified and classified by Job Hunter autonomous pipeline.</p>
                <p>Use Apply Direct below to open the hiring portal and submit your application.</p>
              </div>
            }
          </section>
        </div>

        <!-- Sticky Frosted Footer -->
        <footer class="drawer-footer">
          <div class="footer-timestamp tabular-nums">
            @if (displayJob()?.published_at) {
              <span>Published {{ formatRelativeDate(displayJob()?.published_at) }}</span>
            } @else if (displayJob()?.first_seen_at) {
              <span>Discovered {{ formatRelativeDate(displayJob()?.first_seen_at) }}</span>
            }
          </div>

          <div class="footer-btn-group">
            <ui-button
              [variant]="currentStatus() === 'SAVED' ? 'subtle' : 'secondary'"
              size="sm"
              (clicked)="toggleSave()"
            >
              <app-icon [name]="currentStatus() === 'SAVED' ? 'check' : 'bookmark'" [size]="13" />
              <span>{{ currentStatus() === 'SAVED' ? 'Saved' : 'Save' }}</span>
            </ui-button>

            <ui-button
              [variant]="currentStatus() === 'APPLIED' ? 'subtle' : 'secondary'"
              size="sm"
              (clicked)="toggleApplied()"
            >
              <app-icon [name]="currentStatus() === 'APPLIED' ? 'check' : 'send'" [size]="13" />
              <span>{{ currentStatus() === 'APPLIED' ? 'Applied' : 'Mark Applied' }}</span>
            </ui-button>

            @if (displayJob()?.original_application_url; as applyUrl) {
              <ui-button
                variant="primary"
                size="sm"
                (clicked)="openApplyUrl(applyUrl)"
              >
                <span>Apply Direct</span>
                <app-icon name="external-link" [size]="13" />
              </ui-button>
            }
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
      background-color: rgba(12, 13, 16, 0.64);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      z-index: 1100;
      display: flex;
      justify-content: flex-end;
      opacity: 0;
      pointer-events: none;
      transition: opacity var(--dur-base) var(--ease-spring);
    }

    .drawer-backdrop.open {
      opacity: 1;
      pointer-events: auto;
    }

    .drawer-panel {
      width: 100%;
      max-width: 560px;
      height: 100%;
      background-color: var(--surface-elevated);
      border-left: 1px solid var(--border-hairline);
      box-shadow: var(--shadow-lg);
      display: flex;
      flex-direction: column;
      transform: translate3d(100%, 0, 0);
      transition: transform var(--dur-slow) var(--ease-spring);
      overflow: hidden;
    }

    .drawer-backdrop.open .drawer-panel {
      transform: translate3d(0, 0, 0);
    }

    /* Sticky Hero Header */
    .drawer-header {
      position: relative;
      overflow: hidden;
      padding: var(--space-4) var(--space-5);
      background-color: var(--surface-elevated);
      border-bottom: 1px solid var(--border-hairline);
      box-shadow: var(--border-specular-sm);
      z-index: 20;
      flex-shrink: 0;
    }

    .drawer-header-inner {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .header-top-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
    }

    .header-company-meta {
      display: flex;
      align-items: center;
      gap: var(--space-2-5);
      min-width: 0;
      flex: 1;
    }

    .company-avatar-box {
      width: 36px;
      height: 36px;
      border-radius: var(--radius-sm);
      background-color: var(--surface-subtle);
      border: 1px solid var(--border-hairline);
      box-shadow: var(--border-specular-sm);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-display);
      font-weight: 700;
      font-size: var(--text-sm);
      color: var(--accent-copper-text);
      flex-shrink: 0;
    }

    .company-meta-text {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
    }

    .company-name {
      font-size: var(--text-xs);
      color: var(--ink-secondary);
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .header-badges {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
    }

    .header-utility-actions {
      display: flex;
      align-items: center;
      gap: var(--space-1-5);
      flex-shrink: 0;
    }

    .action-icon-btn {
      min-width: 40px;
      min-height: 40px;
      border-radius: var(--radius-sm);
      background: var(--surface-subtle);
      border: 1px solid var(--border-hairline);
      box-shadow: var(--border-specular-sm);
      color: var(--ink-secondary);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition:
        background-color var(--dur-fast) var(--ease-spring),
        border-color var(--dur-fast) var(--ease-spring),
        color var(--dur-fast) var(--ease-spring),
        transform var(--dur-fast) var(--ease-spring);
    }

    .action-icon-btn:hover {
      background-color: var(--surface-elevated);
      color: var(--ink-primary);
      border-color: var(--border-strong);
    }

    .action-icon-btn:active {
      transform: scale(0.96);
    }

    .action-icon-btn.close-btn:hover {
      color: var(--semantic-crimson-text);
      border-color: var(--semantic-crimson-border);
    }

    .hero-title-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-3);
    }

    .job-title {
      font-family: var(--font-display);
      font-size: var(--text-lg);
      font-weight: 700;
      letter-spacing: var(--tracking-tight);
      color: var(--ink-primary);
      margin: 0;
      line-height: 1.25;
      min-width: 0;
    }

    /* Pipeline Stages Bar */
    .pipeline-stages-bar {
      display: flex;
      gap: 4px;
      overflow-x: auto;
      scrollbar-width: none;
      -ms-overflow-style: none;
      padding: 2px 0;
    }

    .pipeline-stages-bar::-webkit-scrollbar {
      display: none;
    }

    .stage-pill-btn {
      flex-shrink: 0;
      padding: 5px 10px;
      border-radius: var(--radius-full);
      font-size: 11px;
      font-weight: 500;
      background-color: var(--surface-subtle);
      border: 1px solid var(--border-hairline);
      color: var(--ink-secondary);
      cursor: pointer;
      white-space: nowrap;
      transition:
        background-color var(--dur-fast) var(--ease-spring),
        border-color var(--dur-fast) var(--ease-spring),
        color var(--dur-fast) var(--ease-spring),
        transform var(--dur-fast) var(--ease-spring);
    }

    .stage-pill-btn:hover {
      background-color: var(--surface-muted);
      color: var(--ink-primary);
      border-color: var(--border-strong);
    }

    .stage-pill-btn:active {
      transform: scale(0.97);
    }

    .stage-pill-btn.active {
      background-color: var(--accent-copper-soft);
      border-color: var(--border-copper);
      color: var(--accent-copper-text);
      font-weight: 600;
    }

    /* Loading Line */
    .loading-line-indicator {
      height: 2px;
      width: 100%;
      background-color: var(--surface-subtle);
      overflow: hidden;
      flex-shrink: 0;
    }

    .loading-bar {
      height: 100%;
      width: 100%;
      background: linear-gradient(90deg, transparent, var(--accent-copper), transparent);
    }

    /* Drawer Scrollable Body */
    .drawer-body {
      flex: 1;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior-y: contain;
      touch-action: pan-y;
      padding: var(--space-5);
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
    }

    /* Direct Recruiter Contact Architectural Panel */
    .direct-contact-panel {
      display: block;
      border-color: var(--border-copper);
    }

    .direct-contact-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin-top: var(--space-3);
    }

    .contact-row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--space-2);
      padding: var(--space-2);
      background-color: var(--surface-elevated);
      border: 1px solid var(--border-hairline);
      border-radius: var(--radius-sm);
    }

    .contact-address {
      flex: 1;
      min-width: 0;
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      color: var(--ink-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Structured Content Sections */
    .drawer-section {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding-bottom: var(--space-5);
      border-bottom: 1px solid var(--border-hairline);
    }

    .drawer-section:last-child {
      padding-bottom: 0;
      border-bottom: none;
    }

    .section-card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
    }

    .head-left {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .section-heading {
      margin: 0;
      font-family: var(--font-display);
      font-size: var(--text-sm);
      font-weight: 600;
      letter-spacing: var(--tracking-snug);
      color: var(--ink-primary);
    }

    .sub-counter {
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      color: var(--ink-muted);
      font-weight: 500;
    }

    .social-post-callout {
      background-color: var(--surface-subtle);
      border: 1px solid var(--border-hairline);
      border-radius: var(--radius-md);
      padding: var(--space-3-5);
    }

    .social-callout-body {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: var(--text-xs);
      color: var(--ink-secondary);
      line-height: 1.5;
    }

    .social-line strong {
      color: var(--ink-primary);
    }

    .social-disclaimer {
      margin-top: 2px;
      color: var(--ink-muted);
    }

    /* Match Intelligence */
    .intelligence-summary {
      font-size: var(--text-sm);
      color: var(--ink-secondary);
      line-height: 1.55;
      margin: 0;
    }

    .meta-chips-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(115px, 1fr));
      gap: var(--space-2);
    }

    .meta-chip {
      display: flex;
      flex-direction: column;
      gap: 2px;
      background-color: var(--surface-subtle);
      border: 1px solid var(--border-hairline);
      border-radius: var(--radius-sm);
      padding: var(--space-2) var(--space-2-5);
    }

    .meta-label {
      font-size: 10px;
      font-weight: 600;
      color: var(--ink-muted);
    }

    .meta-value {
      font-size: var(--text-xs);
      font-weight: 600;
      color: var(--ink-primary);
    }

    .reasons-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin: 0;
      padding: 0;
    }

    .reason-item {
      display: flex;
      align-items: flex-start;
      gap: var(--space-2);
      font-size: var(--text-xs);
      color: var(--ink-secondary);
      line-height: 1.45;
    }

    .skills-subsection {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .sub-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .sub-heading {
      font-size: var(--text-xs);
      font-weight: 600;
      color: var(--ink-secondary);
    }

    .badges-wrap {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .empty-inline-note {
      font-size: var(--text-xs);
      color: var(--ink-muted);
      margin: 0;
    }

    .gaps-block {
      padding-top: var(--space-2);
      border-top: 1px dashed var(--border-hairline);
    }

    /* AI Studio */
    .toolkit-actions-row {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
    }

    .studio-resume-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 28px;
      padding: var(--space-1) var(--space-2-5);
      border-radius: var(--radius-xs);
      background-color: var(--surface-subtle);
      border: 1px solid var(--border-hairline);
      color: var(--accent-copper-text);
      font-size: var(--text-xs);
      font-weight: 500;
      text-decoration: none;
      transition:
        background-color var(--dur-fast) var(--ease-spring),
        border-color var(--dur-fast) var(--ease-spring);
    }

    .studio-resume-link:hover {
      background-color: var(--accent-copper-soft);
      border-color: var(--border-copper);
    }

    .studio-preview-card {
      margin-top: var(--space-1);
    }

    .tool-result-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--border-hairline);
      padding-bottom: var(--space-2);
      margin-bottom: var(--space-2-5);
    }

    .tool-result-title {
      font-family: var(--font-display);
      font-size: var(--text-xs);
      font-weight: 600;
      color: var(--ink-primary);
    }

    .header-tools {
      display: flex;
      align-items: center;
      gap: var(--space-1);
    }

    .tool-dismiss-btn {
      background: transparent;
      border: none;
      color: var(--ink-muted);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 28px;
      min-height: 28px;
      border-radius: var(--radius-xs);
    }

    .tool-dismiss-btn:hover {
      color: var(--ink-primary);
      background-color: var(--surface-hover);
    }

    .tool-loading-box {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-size: var(--text-xs);
      color: var(--ink-secondary);
      padding: var(--space-2) 0;
    }

    .tool-cards-stack {
      display: flex;
      flex-direction: column;
      gap: var(--space-2-5);
    }

    .outreach-block {
      background-color: var(--surface-elevated);
      border: 1px solid var(--border-hairline);
      border-radius: var(--radius-sm);
      padding: var(--space-2-5) var(--space-3);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .outreach-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
    }

    .outreach-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--ink-secondary);
    }

    .outreach-prose {
      font-family: var(--font-sans);
      font-size: var(--text-xs);
      color: var(--ink-primary);
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.55;
      margin: 2px 0 0 0;
      background: transparent;
      border: none;
      padding: 0;
    }

    .cover-prose {
      max-height: 300px;
      overflow-y: auto;
    }

    .char-length-indicator {
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--ink-muted);
      align-self: flex-end;
    }

    /* Job Brief / Role Description */
    .prose-description {
      font-family: var(--font-sans);
      font-size: 13.5px;
      line-height: 1.65;
      max-width: 68ch;
      color: var(--ink-secondary);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .prose-description p {
      margin: 0;
    }

    .prose-description.fallback {
      color: var(--ink-muted);
    }

    /* Sticky Frosted Footer */
    .drawer-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--space-3-5) var(--space-5);
      background-color: var(--surface-elevated);
      border-top: 1px solid var(--border-hairline);
      box-shadow: var(--border-specular-sm);
      flex-shrink: 0;
    }

    .footer-timestamp {
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      color: var(--ink-muted);
    }

    .footer-btn-group {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
    }

    .text-copper { color: var(--accent-copper-text); }
    .text-emerald { color: var(--semantic-emerald-text); }
    .text-amber { color: var(--semantic-amber-text); }
    .text-crimson { color: var(--semantic-crimson-text); }
    .text-steel { color: var(--semantic-steel-text); }

    /* Mobile Bottom / Full-Height Sheet (<= 640px, 360x800) */
    @media (max-width: 640px) {
      .drawer-panel {
        max-width: 100%;
        height: 94dvh;
        margin-top: auto;
        border-left: none;
        border-top: 1px solid var(--border-strong);
        border-radius: var(--radius-xl) var(--radius-xl) 0 0;
        transform: translate3d(0, 100%, 0);
      }

      .drawer-header {
        padding: var(--space-3-5) var(--space-4);
      }

      .action-icon-btn {
        min-width: 44px;
        min-height: 44px;
      }

      .hero-title-row {
        flex-direction: column;
        align-items: flex-start;
        gap: var(--space-2);
      }

      .stage-pill-btn {
        min-height: 38px;
        padding: 6px 12px;
      }

      .drawer-body {
        padding: var(--space-4);
      }

      .drawer-footer {
        padding: var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom, 0px)) var(--space-4);
        flex-direction: column;
        align-items: stretch;
        gap: var(--space-2-5);
      }

      .footer-btn-group {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .footer-btn-group ui-button:last-child:nth-child(odd) {
        grid-column: span 2;
      }
    }
  `],
})
export class JobDrawerComponent implements OnChanges {
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
  private readonly destroyRef = inject(DestroyRef);

  private readonly jobSignal = signal<JobSummary | JobDetail | null>(null);
  readonly isLoadingDetail = signal<boolean>(false);
  readonly jobDetail = signal<JobDetail | null>(null);
  readonly displayJob = computed(() => this.jobDetail() ?? this.jobSignal());
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

  readonly matchedSkills = computed<string[]>(() => {
    const req = this.displayJob()?.required_skills || [];
    const gaps = this.jobDetail()?.skill_gaps || [];
    return req.filter((s) => !gaps.includes(s));
  });

  readonly skillGaps = computed<string[]>(() => {
    return this.jobDetail()?.skill_gaps || [];
  });

  readonly availableStages: { status: ApplicationStatus; label: string }[] = [
    { status: 'DISCOVERED', label: 'Discovered' },
    { status: 'SAVED', label: 'Saved' },
    { status: 'APPLIED', label: 'Applied' },
    { status: 'INTERVIEW', label: 'Interview' },
    { status: 'OFFER', label: 'Offer' },
    { status: 'REJECTED', label: 'Rejected' },
    { status: 'ARCHIVED', label: 'Archived' },
  ];

  private readonly detailTrigger$ = new Subject<number | null>();
  private readonly outreachTrigger$ = new Subject<number | null>();
  private readonly coverTrigger$ = new Subject<number | null>();
  private loadedForJobId: number | null = null;
  private copyTimer?: ReturnType<typeof setTimeout>;
  private copyLinkTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.detailTrigger$
      .pipe(
        switchMap((jobId) => {
          if (jobId === null) {
            return of(null);
          }
          return this.api.getJobDetail(jobId).pipe(
            catchError((err: unknown) => {
              console.warn('Could not load detailed job info:', err);
              this.isLoadingDetail.set(false);
              return of(null);
            })
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((detail) => {
        if (!detail || detail.id !== this.loadedForJobId) {
          this.isLoadingDetail.set(false);
          return;
        }
        this.jobDetail.set(detail);
        if (detail.tracker_status) {
          this.currentStatus.set(detail.tracker_status);
        }
        this.isLoadingDetail.set(false);
      });

    this.outreachTrigger$
      .pipe(
        switchMap((jobId) => {
          if (jobId === null) {
            return of(null);
          }
          return this.api.getOutreachMessages(jobId).pipe(
            catchError(() => {
              this.isLoadingTool.set(false);
              this.toast.show('Failed to generate recruiter outreach', 'error');
              return of(null);
            })
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((data) => {
        if (!data || data.job_id !== this.loadedForJobId) {
          this.isLoadingTool.set(false);
          return;
        }
        this.outreachData.set(data);
        this.isLoadingTool.set(false);
      });

    this.coverTrigger$
      .pipe(
        switchMap((jobId) => {
          if (jobId === null) {
            return of(null);
          }
          return this.api.getCoverLetter(jobId).pipe(
            catchError(() => {
              this.isLoadingTool.set(false);
              this.toast.show('Failed to generate cover letter', 'error');
              return of(null);
            })
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((data) => {
        if (!data || data.job_id !== this.loadedForJobId) {
          this.isLoadingTool.set(false);
          return;
        }
        this.coverLetterText.set(data.cover_letter);
        this.isLoadingTool.set(false);
      });

    this.destroyRef.onDestroy(() => {
      if (this.copyTimer) clearTimeout(this.copyTimer);
      if (this.copyLinkTimer) clearTimeout(this.copyLinkTimer);
      this.syncBodyScrollLock(false);
    });
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.isOpen) {
      this.close();
    }
  }

  ngOnChanges(): void {
    this.jobSignal.set(this.job);
    this.syncBodyScrollLock(Boolean(this.isOpen && this.job));

    if (!this.isOpen || !this.job) {
      this.resetTransientState();
      return;
    }

    if (this.loadedForJobId !== this.job.id) {
      this.resetTransientState();
      this.loadedForJobId = this.job.id;
      this.currentStatus.set(this.job.tracker_status || 'DISCOVERED');

      if ('description_text' in this.job && this.job.description_text) {
        this.jobDetail.set(this.job as JobDetail);
      } else {
        this.isLoadingDetail.set(true);
        this.detailTrigger$.next(this.job.id);
      }
    } else if (this.job.tracker_status) {
      this.currentStatus.set(this.job.tracker_status);
    }
  }

  private syncBodyScrollLock(locked: boolean): void {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('drawer-scroll-locked', locked);
    document.body.classList.toggle('drawer-scroll-locked', locked);
  }

  private resetTransientState(): void {
    this.loadedForJobId = null;
    this.jobDetail.set(null);
    this.isLoadingDetail.set(false);
    this.activeTool.set('none');
    this.isLoadingTool.set(false);
    this.outreachData.set(null);
    this.coverLetterText.set(null);
    this.copied.set(false);
    this.copiedKey.set(null);
    this.detailTrigger$.next(null);
    this.outreachTrigger$.next(null);
    this.coverTrigger$.next(null);
  }

  close(): void {
    this.telegram.haptic('selection');
    this.closeDrawer.emit();
  }

  onBackdropClick(_e: MouseEvent): void {
    this.close();
  }

  setJobStatus(status: ApplicationStatus): void {
    const activeJob = this.displayJob();
    if (!activeJob) return;

    const jobId = activeJob.id;
    const prevStatus = this.currentStatus();
    this.telegram.haptic('medium');
    this.currentStatus.set(status);

    this.api
      .updateJobStatus(jobId, status)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.show(`Stage updated to ${this.formatStatus(status)}`, 'success', 2000);
          this.statusUpdated.emit({ jobId, status });
        },
        error: (e: unknown) => {
          console.error('Failed to update job status:', e);
          if (this.loadedForJobId === jobId) {
            this.currentStatus.set(prevStatus);
          }
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
    const activeJob = this.displayJob();
    if (!this.outreachData() && activeJob) {
      this.isLoadingTool.set(true);
      this.coverTrigger$.next(null);
      this.outreachTrigger$.next(activeJob.id);
    }
  }

  regenerateOutreach(): void {
    const activeJob = this.displayJob();
    if (!activeJob || this.isLoadingTool()) return;
    this.telegram.haptic('selection');
    this.outreachData.set(null);
    this.isLoadingTool.set(true);
    this.outreachTrigger$.next(activeJob.id);
  }

  toggleCoverTool(): void {
    if (this.activeTool() === 'cover') {
      this.activeTool.set('none');
      return;
    }
    this.activeTool.set('cover');
    this.telegram.haptic('selection');
    const activeJob = this.displayJob();
    if (!this.coverLetterText() && activeJob) {
      this.isLoadingTool.set(true);
      this.outreachTrigger$.next(null);
      this.coverTrigger$.next(activeJob.id);
    }
  }

  regenerateCover(): void {
    const activeJob = this.displayJob();
    if (!activeJob || this.isLoadingTool()) return;
    this.telegram.haptic('selection');
    this.coverLetterText.set(null);
    this.isLoadingTool.set(true);
    this.coverTrigger$.next(activeJob.id);
  }

  closeTool(): void {
    this.activeTool.set('none');
    this.isLoadingTool.set(false);
    this.outreachTrigger$.next(null);
    this.coverTrigger$.next(null);
  }

  copyText(text: string, key: string): void {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      this.toast.show('Clipboard unavailable', 'error');
      return;
    }
    navigator.clipboard
      .writeText(text)
      .then(() => {
        this.telegram.haptic('selection');
        this.toast.show('Copied to clipboard', 'info', 1500);
        this.copiedKey.set(key);
        if (this.copyTimer) clearTimeout(this.copyTimer);
        this.copyTimer = setTimeout(() => this.copiedKey.set(null), 2000);
      })
      .catch(() => {
        this.toast.show('Failed to copy to clipboard', 'error');
      });
  }

  copyJobLink(): void {
    const url = this.displayJob()?.original_application_url;
    if (!url) return;
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      this.toast.show('Clipboard unavailable', 'error');
      return;
    }
    navigator.clipboard
      .writeText(url)
      .then(() => {
        this.telegram.haptic('selection');
        this.toast.show('Application link copied', 'info', 1500);
        this.copied.set(true);
        if (this.copyLinkTimer) clearTimeout(this.copyLinkTimer);
        this.copyLinkTimer = setTimeout(() => this.copied.set(false), 2000);
      })
      .catch(() => {
        this.toast.show('Failed to copy application link', 'error');
      });
  }

  openApplyUrl(url: string): void {
    const safe = this.getSafeHttpUrl(url);
    if (!safe || typeof window === 'undefined') return;
    this.telegram.haptic('medium');
    if (this.telegram.isTelegram()) {
      this.telegram.openExternalLink(safe);
    } else {
      window.open(safe, '_blank', 'noopener,noreferrer');
    }
  }

  openDirectEmail(email: string): void {
    const safe = this.getSafeEmail(email);
    if (!safe || typeof window === 'undefined') return;
    this.telegram.haptic('medium');
    window.location.href = `mailto:${safe}`;
  }

  openSafeExternal(url: string): void {
    const safe = this.getSafeHttpUrl(url);
    if (!safe || typeof window === 'undefined') return;
    this.telegram.haptic('medium');
    if (this.telegram.isTelegram()) {
      this.telegram.openExternalLink(safe);
    } else {
      window.open(safe, '_blank', 'noopener,noreferrer');
    }
  }

  onResumeClick(e: MouseEvent, jobId: number): void {
    this.telegram.haptic('selection');
    if (this.telegram.isTelegram()) {
      e.preventDefault();
      this.telegram.openExternalLink(this.api.getTailoredResumeUrl(jobId));
    }
  }

  hasAnyDirectContact(job: JobSummary | JobDetail | null): boolean {
    if (!job) return false;
    return Boolean(
      this.getSafeEmail(job.direct_email) ||
      job.whatsapp_contact?.trim() ||
      this.getSafeHttpUrl(job.apply_form_url)
    );
  }

  getSafeEmail(email?: string | null): string | null {
    if (!email) return null;
    const trimmed = email.trim();
    if (!trimmed || /[\s<>"'`]/.test(trimmed)) return null;
    return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(trimmed) ? trimmed : null;
  }

  getSafeHttpUrl(url?: string | null): string | null {
    if (!url) return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
      if (parsed.username || parsed.password) return null;
      return parsed.href;
    } catch {
      return null;
    }
  }

  getWhatsAppHref(contact?: string | null): string | null {
    if (!contact) return null;
    const trimmed = contact.trim();
    if (!trimmed) return null;
    if (/^https?:\/\//i.test(trimmed)) {
      const safe = this.getSafeHttpUrl(trimmed);
      if (!safe) return null;
      const host = new URL(safe).hostname.toLowerCase();
      return host === 'wa.me' || host === 'api.whatsapp.com' || host.endsWith('.whatsapp.com') ? safe : null;
    }
    const digits = trimmed.replace(/\D+/g, '');
    if (digits.length < 8) return null;
    const normalized = digits.startsWith('01') && digits.length === 11 ? `20${digits.slice(1)}` : digits;
    return `https://wa.me/${normalized}`;
  }

  roundScore(score: number): number {
    return Math.round(score);
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

  getParagraphs(text?: string | null): string[] {
    if (!text) return [];
    return text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }
}
