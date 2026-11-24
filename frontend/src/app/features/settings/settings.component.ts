import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { TelegramService } from '../../core/services/telegram.service';
import { ThemeService, ThemeMode } from '../../core/services/theme.service';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent } from '../../core/components/icon/icon.component';
import { UiBadgeComponent } from '../../shared/ui/ui-badge.component';
import { UiButtonComponent } from '../../shared/ui/ui-button.component';
import { CandidateProfile } from '../../core/models/job.model';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, UiBadgeComponent, UiButtonComponent],
  template: `
    <div class="settings-view">
      <!-- Header -->
      <header class="settings-header">
        <div>
          <h1 class="page-title">Settings & System Controls</h1>
          <p class="subtitle">Configure automated Telegram dispatches, matching thresholds, appearance, and security guardrails</p>
        </div>
      </header>

      <!-- Settings Stack -->
      <div class="settings-stack">
        <!-- Section 1: Telegram Digest Preferences Card -->
        <section class="surface-card settings-panel" aria-labelledby="delivery-title">
          <div class="panel-header">
            <div class="panel-title-wrap">
              <div class="panel-icon-box text-cyan">
                <app-icon name="bell" [size]="16"></app-icon>
              </div>
              <div>
                <h2 id="delivery-title" class="panel-title">Daily Telegram Dispatch</h2>
                <p class="panel-desc">Autonomous morning briefings delivered to your verified Telegram chat</p>
              </div>
            </div>
            <ui-badge [variant]="digestEnabled() ? 'success' : 'default'" [dot]="true">
              {{ digestEnabled() ? 'Active Sweep' : 'Dispatch Paused' }}
            </ui-badge>
          </div>

          <div class="panel-body">
            <!-- Setting: Digest Toggle -->
            <div class="setting-item">
              <div class="item-text">
                <strong>Automated Morning Digest</strong>
                <p>Receive a curated daily summary of high-affinity software engineering matches delivered straight to Telegram.</p>
              </div>
              <div class="item-control">
                <button
                  type="button"
                  (click)="toggleDigest()"
                  class="toggle-switch-btn"
                  [class.active]="digestEnabled()"
                  [attr.aria-pressed]="digestEnabled()"
                  aria-label="Toggle automated daily digest"
                >
                  <app-icon [name]="digestEnabled() ? 'check' : 'clock'" [size]="13"></app-icon>
                  <span>{{ digestEnabled() ? 'Active' : 'Paused' }}</span>
                </button>
              </div>
            </div>

            <!-- Setting: Sweep Time -->
            <div class="setting-item">
              <div class="item-text">
                <strong>Scheduled Sweep Time</strong>
                <p>Daily time when the autonomous radar initiates feed sweeping and prepares the briefing.</p>
              </div>
              <div class="item-control">
                <div class="time-control-group">
                  <input
                    type="time"
                    [(ngModel)]="digestTime"
                    class="form-input time-input tabular-nums"
                    aria-label="Digest delivery time"
                  />
                  <span class="tz-pill">Africa/Cairo (UTC+2)</span>
                </div>
              </div>
            </div>

            <!-- Setting: Match Threshold -->
            <div class="setting-item">
              <div class="item-text">
                <strong>Minimum Match Score Threshold</strong>
                <p>Only opportunities matching at or above this score are included in your morning digest.</p>
              </div>
              <div class="item-control">
                <div class="score-control-group">
                  <input
                    type="range"
                    min="50"
                    max="95"
                    step="5"
                    [(ngModel)]="digestThreshold"
                    class="score-range"
                    aria-label="Match score threshold slider"
                  />
                  <div class="score-badge-wrap tabular-nums">
                    <span class="score-val">{{ digestThreshold }}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="panel-footer">
            <ui-button
              [variant]="'primary'"
              [loading]="isSaving()"
              (clicked)="saveSettings()"
            >
              <app-icon name="check" [size]="14"></app-icon>
              <span>{{ isSaving() ? 'Saving Preferences...' : 'Save Preferences' }}</span>
            </ui-button>
          </div>
        </section>

        <!-- Section 2: Appearance & Theme -->
        <section class="surface-card settings-panel" aria-labelledby="theme-title">
          <div class="panel-header">
            <div class="panel-title-wrap">
              <div class="panel-icon-box text-cyan">
                <app-icon name="sparkles" [size]="16"></app-icon>
              </div>
              <div>
                <h2 id="theme-title" class="panel-title">Appearance & Visual System</h2>
                <p class="panel-desc">Interface tokens adapt dynamically across both desktop and Telegram Mini App</p>
              </div>
            </div>
            <ui-badge [variant]="'brand'" [dot]="true">
              {{ theme.isDark() ? 'Dark Mode' : 'Light Mode' }}
            </ui-badge>
          </div>

          <div class="panel-body">
            <div class="theme-grid">
              <!-- Dark Obsidian Card -->
              <div
                class="theme-card"
                [class.active]="theme.isDark()"
                (click)="selectTheme('dark')"
                role="button"
                tabindex="0"
                (keydown.enter)="selectTheme('dark')"
                (keydown.space)="selectTheme('dark')"
                aria-label="Select Dark Obsidian Theme"
              >
                <div class="theme-card-top">
                  <div class="theme-icon-wrap dark-icon">
                    <app-icon name="moon" [size]="16"></app-icon>
                  </div>
                  <div class="theme-meta">
                    <strong class="theme-name">Dark Obsidian</strong>
                    <span class="theme-desc">Linear Jet Black with Electric Cyan</span>
                  </div>
                  <div class="theme-radio" [class.checked]="theme.isDark()">
                    <app-icon *ngIf="theme.isDark()" name="check" [size]="11"></app-icon>
                  </div>
                </div>

                <div class="theme-preview dark-preview">
                  <div class="preview-bar preview-bar-dark">
                    <span class="preview-dot dot-dark-bg"></span>
                    <span class="preview-dot dot-dark-border"></span>
                    <span class="preview-dot dot-cyan"></span>
                  </div>
                  <div class="preview-chip">#090C13 · Jet Black</div>
                </div>
              </div>

              <!-- Light Titanium Card -->
              <div
                class="theme-card"
                [class.active]="!theme.isDark()"
                (click)="selectTheme('light')"
                role="button"
                tabindex="0"
                (keydown.enter)="selectTheme('light')"
                (keydown.space)="selectTheme('light')"
                aria-label="Select Light Titanium Theme"
              >
                <div class="theme-card-top">
                  <div class="theme-icon-wrap light-icon">
                    <app-icon name="sun" [size]="16"></app-icon>
                  </div>
                  <div class="theme-meta">
                    <strong class="theme-name">Light Titanium</strong>
                    <span class="theme-desc">High-contrast clean silver & slate</span>
                  </div>
                  <div class="theme-radio" [class.checked]="!theme.isDark()">
                    <app-icon *ngIf="!theme.isDark()" name="check" [size]="11"></app-icon>
                  </div>
                </div>

                <div class="theme-preview light-preview">
                  <div class="preview-bar preview-bar-light">
                    <span class="preview-dot dot-light-bg"></span>
                    <span class="preview-dot dot-light-border"></span>
                    <span class="preview-dot dot-cyan"></span>
                  </div>
                  <div class="preview-chip">#F8FAFC · Titanium</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Section 3: Privacy & Security Guardrails Card -->
        <section class="surface-card settings-panel" aria-labelledby="privacy-title">
          <div class="panel-header">
            <div class="panel-title-wrap">
              <div class="panel-icon-box text-emerald">
                <app-icon name="shield-check" [size]="16"></app-icon>
              </div>
              <div>
                <h2 id="privacy-title" class="panel-title">Privacy & Security Guardrails</h2>
                <p class="panel-desc">Autonomous engine safety guarantees enforced at pipeline level</p>
              </div>
            </div>
            <ui-badge [variant]="'success'">Engine Enforced</ui-badge>
          </div>

          <div class="panel-body">
            <div class="guardrail-grid">
              <div class="guardrail-row">
                <div class="guardrail-icon-box text-emerald">
                  <app-icon name="check-circle" [size]="15"></app-icon>
                </div>
                <div class="guardrail-info">
                  <strong>Zero Auto-Submission Guarantee</strong>
                  <p>The agent never auto-submits job applications on your behalf without explicit manual review and deliberate confirmation.</p>
                </div>
              </div>

              <div class="guardrail-row">
                <div class="guardrail-icon-box text-emerald">
                  <app-icon name="shield-check" [size]="15"></app-icon>
                </div>
                <div class="guardrail-info">
                  <strong>Local PII Sanitization</strong>
                  <p>CV files and personal contact identifiers are filtered and sanitized before parsing, keeping sensitive details private.</p>
                </div>
              </div>

              <div class="guardrail-row">
                <div class="guardrail-icon-box text-cyan">
                  <app-icon name="database" [size]="15"></app-icon>
                </div>
                <div class="guardrail-info">
                  <strong>Direct ATS Ingestion & Anti-Hallucination</strong>
                  <p>All job postings are crawled from verified employer ATS feeds (Greenhouse, Lever, RemoteOK, Arbeitnow) with deduplication.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Section 4: Danger Zone Card -->
        <section class="surface-card settings-panel danger-panel" aria-labelledby="danger-title">
          <div class="panel-header danger-header">
            <div class="panel-title-wrap">
              <div class="panel-icon-box text-rose">
                <app-icon name="alert-circle" [size]="16"></app-icon>
              </div>
              <div>
                <h2 id="danger-title" class="panel-title text-rose">Danger Zone</h2>
                <p class="panel-desc">Irreversible database purge and candidate profile re-initialization</p>
              </div>
            </div>
            <ui-badge [variant]="'danger'">Irreversible</ui-badge>
          </div>

          <div class="panel-body">
            <div class="danger-box">
              <div class="danger-info">
                <strong>Wipe Database & Reset Profile</strong>
                <p>Permanently purges all scraped jobs, application tracker stages, interview notes, and notification records. Re-initializes profile from verified CV facts.</p>
              </div>

              <div class="danger-action-flow">
                <div class="admin-key-group">
                  <label for="adminKeyInput" class="admin-label">
                    <app-icon name="lock" [size]="12"></app-icon>
                    <span>Admin Secret Key (X-Admin-Key):</span>
                  </label>
                  <input
                    id="adminKeyInput"
                    type="password"
                    [(ngModel)]="adminKey"
                    class="form-input admin-input"
                    placeholder="Enter SECRET_KEY..."
                    autocomplete="off"
                  />
                </div>

                @if (!showWipeConfirm()) {
                  <ui-button
                    [variant]="'danger'"
                    [disabled]="!adminKey.trim() || isWiping()"
                    (clicked)="requestWipe()"
                  >
                    <app-icon name="trash" [size]="14"></app-icon>
                    <span>Wipe Database & Reset</span>
                  </ui-button>
                } @else {
                  <div class="confirm-box">
                    <div class="confirm-warning">
                      <app-icon name="alert-circle" [size]="14" class="text-rose"></app-icon>
                      <span>Are you absolutely sure? All tracked jobs and logs will be permanently deleted.</span>
                    </div>
                    <div class="confirm-actions">
                      <ui-button
                        [variant]="'danger'"
                        [loading]="isWiping()"
                        (clicked)="executeWipe()"
                      >
                        <app-icon name="trash" [size]="14"></app-icon>
                        <span>Yes, Permanently Wipe</span>
                      </ui-button>
                      <ui-button
                        [variant]="'ghost'"
                        [disabled]="isWiping()"
                        (clicked)="cancelWipe()"
                      >
                        <span>Cancel</span>
                      </ui-button>
                    </div>
                  </div>
                }
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  `,
  styles: [`
    .settings-view {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      width: 100%;
      max-width: 960px;
    }

    .settings-header {
      margin-bottom: var(--space-1);
    }
    .page-title {
      font-size: var(--text-2xl);
      font-weight: 700;
      letter-spacing: -0.03em;
      color: var(--text-primary);
      margin: 0 0 4px 0;
    }
    .subtitle {
      font-size: var(--text-sm);
      color: var(--text-secondary);
      margin: 0;
      line-height: 1.45;
    }

    .settings-stack {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      width: 100%;
    }

    .settings-panel {
      padding: var(--space-5);
      border-radius: var(--radius-lg);
      border: 1px solid var(--border-default);
      background: var(--bg-surface-1);
      transition: border-color var(--motion-fast);
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      padding-bottom: var(--space-3-5);
      border-bottom: 1px solid var(--border-subtle);
    }
    .panel-title-wrap {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }
    .panel-icon-box {
      width: 32px;
      height: 32px;
      border-radius: var(--radius-sm);
      background: var(--bg-surface-2);
      border: 1px solid var(--border-default);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .panel-title {
      font-size: var(--text-sm);
      font-weight: 600;
      letter-spacing: -0.01em;
      color: var(--text-primary);
      margin: 0 0 2px 0;
    }
    .panel-desc {
      font-size: var(--text-xs);
      color: var(--text-tertiary);
      margin: 0;
      line-height: 1.35;
    }

    .panel-body {
      padding-top: var(--space-2);
    }

    /* Setting Items */
    .setting-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-4);
      padding: var(--space-4) 0;
      border-bottom: 1px solid var(--border-subtle);
    }
    .setting-item:last-of-type {
      border-bottom: none;
    }

    .item-text {
      display: flex;
      flex-direction: column;
      gap: 3px;
      max-width: 600px;
    }
    .item-text strong {
      font-size: var(--text-sm);
      color: var(--text-primary);
      font-weight: 600;
    }
    .item-text p {
      font-size: var(--text-xs);
      color: var(--text-secondary);
      margin: 0;
      line-height: 1.45;
    }

    .toggle-switch-btn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1-5);
      padding: 6px 14px;
      font-size: var(--text-xs);
      font-weight: 600;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-default);
      background: var(--bg-surface-2);
      color: var(--text-secondary);
      cursor: pointer;
      transition: all var(--motion-fast);
      user-select: none;
    }
    .toggle-switch-btn:hover {
      border-color: var(--border-strong);
      color: var(--text-primary);
    }
    .toggle-switch-btn.active {
      background: rgba(16, 185, 129, 0.12);
      border-color: rgba(16, 185, 129, 0.35);
      color: var(--emerald-400);
    }

    .time-control-group {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .time-input {
      width: 105px;
      text-align: center;
      font-size: var(--text-xs);
      font-weight: 600;
      padding: 6px 10px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-default);
      background: var(--bg-surface-2);
      color: var(--text-primary);
    }
    .tz-pill {
      font-size: 11px;
      font-family: var(--font-mono);
      color: var(--text-tertiary);
      background: var(--bg-surface-2);
      border: 1px solid var(--border-subtle);
      padding: 5px 9px;
      border-radius: var(--radius-xs);
      white-space: nowrap;
    }

    .score-control-group {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }
    .score-range {
      width: 130px;
      cursor: pointer;
      accent-color: var(--brand-primary);
    }
    .score-badge-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 48px;
      padding: 4px 8px;
      background: var(--bg-surface-2);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-xs);
      font-size: var(--text-xs);
      font-weight: 700;
      color: var(--brand-primary);
    }

    .panel-footer {
      display: flex;
      justify-content: flex-end;
      padding-top: var(--space-4);
      margin-top: var(--space-1);
      border-top: 1px solid var(--border-subtle);
    }

    /* Theme Grid */
    .theme-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-3);
      margin-top: var(--space-2);
    }
    .theme-card {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--space-4);
      border-radius: var(--radius-md);
      background: var(--bg-surface-2);
      border: 1px solid var(--border-default);
      cursor: pointer;
      transition: all var(--motion-fast);
      user-select: none;
      outline: none;
    }
    .theme-card:hover {
      border-color: var(--border-strong);
      background: var(--bg-surface-3);
    }
    .theme-card:focus-visible {
      border-color: var(--brand-primary);
      box-shadow: 0 0 0 2px var(--brand-focus-ring);
    }
    .theme-card.active {
      border-color: var(--brand-primary);
      background: rgba(34, 211, 238, 0.04);
    }
    .theme-card-top {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
    }
    .theme-icon-wrap {
      width: 32px;
      height: 32px;
      border-radius: var(--radius-sm);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .dark-icon {
      background: #090c13;
      color: #22d3ee;
      border: 1px solid #27272a;
    }
    .light-icon {
      background: #f8fafc;
      color: #0284c7;
      border: 1px solid #cbd5e1;
    }
    .theme-meta {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .theme-name {
      font-size: var(--text-sm);
      font-weight: 600;
      color: var(--text-primary);
    }
    .theme-desc {
      font-size: var(--text-2xs);
      color: var(--text-tertiary);
    }
    .theme-radio {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      border: 1px solid var(--border-default);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      color: #ffffff;
      background: var(--bg-surface-1);
    }
    .theme-radio.checked {
      background: var(--brand-primary);
      border-color: var(--brand-primary);
    }
    .theme-preview {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-2) var(--space-2-5);
      border-radius: var(--radius-xs);
      border: 1px solid var(--border-subtle);
    }
    .dark-preview {
      background: #090c13;
    }
    .light-preview {
      background: #f8fafc;
    }
    .preview-bar {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .preview-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .dot-dark-bg { background: #18181b; }
    .dot-dark-border { background: #3f3f46; }
    .dot-light-bg { background: #e2e8f0; }
    .dot-light-border { background: #94a3b8; }
    .dot-cyan { background: #22d3ee; }
    .preview-chip {
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 500;
      color: var(--text-tertiary);
    }

    /* Guardrail Grid */
    .guardrail-grid {
      display: flex;
      flex-direction: column;
      gap: var(--space-2-5);
      margin-top: var(--space-2);
    }
    .guardrail-row {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-3-5);
      background: var(--bg-surface-2);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
    }
    .guardrail-icon-box {
      margin-top: 2px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .guardrail-info strong {
      font-size: var(--text-xs);
      color: var(--text-primary);
      font-weight: 600;
      display: block;
      margin-bottom: 2px;
    }
    .guardrail-info p {
      font-size: var(--text-2xs);
      color: var(--text-secondary);
      margin: 0;
      line-height: 1.45;
    }

    /* Danger Zone */
    .danger-panel {
      border-color: rgba(244, 63, 94, 0.28);
      background: rgba(244, 63, 94, 0.02);
    }
    .danger-header {
      border-bottom-color: rgba(244, 63, 94, 0.15);
    }
    .danger-box {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      padding-top: var(--space-2);
    }
    .danger-info strong {
      font-size: var(--text-sm);
      color: var(--text-primary);
      font-weight: 600;
      display: block;
      margin-bottom: 3px;
    }
    .danger-info p {
      font-size: var(--text-xs);
      color: var(--text-secondary);
      margin: 0;
      line-height: 1.45;
    }
    .danger-action-flow {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--space-3-5);
      background: var(--bg-surface-2);
      border: 1px solid rgba(244, 63, 94, 0.2);
      border-radius: var(--radius-md);
    }
    .admin-key-group {
      display: flex;
      flex-direction: column;
      gap: var(--space-1-5);
    }
    .admin-label {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      font-size: var(--text-xs);
      font-weight: 600;
      color: var(--text-secondary);
    }
    .admin-input {
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      letter-spacing: 0.05em;
    }
    .confirm-box {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--space-3);
      background: rgba(244, 63, 94, 0.06);
      border: 1px solid rgba(244, 63, 94, 0.35);
      border-radius: var(--radius-sm);
    }
    .confirm-warning {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-size: var(--text-xs);
      font-weight: 600;
      color: var(--rose-400);
    }
    .confirm-actions {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    /* Utilities */
    .text-cyan { color: var(--cyan-400); }
    .text-emerald { color: var(--emerald-400); }
    .text-rose { color: var(--rose-400); }

    @media (max-width: 768px) {
      .setting-item {
        flex-direction: column;
        align-items: flex-start;
        gap: var(--space-3);
      }
      .theme-grid {
        grid-template-columns: 1fr;
      }
      .panel-footer ui-button {
        width: 100%;
      }
      .panel-footer ::ng-deep .ui-btn {
        width: 100%;
      }
    }
  `],
})
export class SettingsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly telegram = inject(TelegramService);
  readonly theme = inject(ThemeService);
  private readonly toast = inject(ToastService);

  profile = signal<CandidateProfile | null>(null);
  digestEnabled = signal<boolean>(true);
  digestTime: string = '09:00';
  digestThreshold: number = 70;
  isSaving = signal<boolean>(false);

  // Danger Zone
  adminKey: string = '';
  showWipeConfirm = signal<boolean>(false);
  isWiping = signal<boolean>(false);

  ngOnInit(): void {
    this.loadSettings();
  }

  loadSettings(): void {
    this.api.getProfile().subscribe({
      next: (p) => {
        this.profile.set(p);
        this.digestEnabled.set(p.digest_enabled);
        this.digestTime = p.digest_time || '09:00';
        this.digestThreshold = p.digest_threshold ?? 70;
      },
      error: () => {
        // Fallback default
        this.digestEnabled.set(true);
      },
    });
  }

  toggleDigest(): void {
    this.telegram.haptic('selection');
    this.digestEnabled.update((v) => !v);
  }

  selectTheme(mode: ThemeMode): void {
    this.telegram.haptic('selection');
    this.theme.setTheme(mode);
  }

  saveSettings(): void {
    this.isSaving.set(true);
    this.telegram.haptic('medium');

    this.api
      .updateProfile({
        digest_enabled: this.digestEnabled(),
        digest_time: this.digestTime,
        digest_threshold: this.digestThreshold,
      })
      .subscribe({
        next: () => {
          this.isSaving.set(false);
          this.telegram.haptic('success');
          this.toast.show('Settings & automation preferences saved!', 'success');
        },
        error: (err) => {
          this.isSaving.set(false);
          this.telegram.haptic('error');
          this.toast.show('Failed to save settings: ' + (err.error?.detail || err.message), 'error');
        },
      });
  }

  requestWipe(): void {
    if (!this.adminKey.trim()) {
      this.toast.show('Please enter the Admin Secret Key first.', 'warning');
      return;
    }
    this.telegram.haptic('medium');
    this.showWipeConfirm.set(true);
  }

  cancelWipe(): void {
    this.showWipeConfirm.set(false);
  }

  executeWipe(): void {
    if (!this.adminKey.trim()) return;

    this.isWiping.set(true);
    this.telegram.haptic('heavy');

    this.api.wipeAndReset(this.adminKey.trim()).subscribe({
      next: (res) => {
        this.isWiping.set(false);
        this.showWipeConfirm.set(false);
        this.adminKey = '';
        this.telegram.haptic('success');
        this.toast.show(res.message || 'Database successfully wiped and reset!', 'success');
        this.loadSettings();
      },
      error: (err) => {
        this.isWiping.set(false);
        this.telegram.haptic('error');
        this.toast.show('Failed to reset: ' + (err.error?.detail || err.message), 'error');
      },
    });
  }
}
