import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
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
              <div class="panel-icon-box text-brand">
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
              [disabled]="loadFailed() || isSaving()"
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
              <div class="panel-icon-box text-brand">
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
                [attr.aria-pressed]="theme.isDark()"
                (keydown.enter)="selectTheme('dark')"
                (keydown.space)="$event.preventDefault(); selectTheme('dark')"
                aria-label="Select Dark Obsidian Theme"
              >
                <div class="theme-card-top">
                  <div class="theme-icon-wrap dark-icon">
                    <app-icon name="moon" [size]="16"></app-icon>
                  </div>
                  <div class="theme-meta">
                    <strong class="theme-name">Dark Obsidian</strong>
                    <span class="theme-desc">Obsidian canvas with crisp Indigo accent</span>
                  </div>
                  <div class="theme-radio" [class.checked]="theme.isDark()">
                    <app-icon *ngIf="theme.isDark()" name="check" [size]="11"></app-icon>
                  </div>
                </div>

                <div class="theme-preview dark-preview">
                  <div class="preview-bar">
                    <span class="preview-dot dot-dark-bg"></span>
                    <span class="preview-dot dot-dark-border"></span>
                    <span class="preview-dot dot-indigo-dark"></span>
                  </div>
                  <div class="preview-chip dark-chip">#09090B · Obsidian</div>
                </div>
              </div>

              <!-- Light Titanium Card -->
              <div
                class="theme-card"
                [class.active]="!theme.isDark()"
                (click)="selectTheme('light')"
                role="button"
                tabindex="0"
                [attr.aria-pressed]="!theme.isDark()"
                (keydown.enter)="selectTheme('light')"
                (keydown.space)="$event.preventDefault(); selectTheme('light')"
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
                  <div class="preview-bar">
                    <span class="preview-dot dot-light-bg"></span>
                    <span class="preview-dot dot-light-border"></span>
                    <span class="preview-dot dot-indigo-light"></span>
                  </div>
                  <div class="preview-chip light-chip">#F8FAFC · Titanium</div>
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
                <div class="guardrail-icon-box text-sky">
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
              <div class="panel-icon-box danger-icon-box text-rose">
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
                    <span>Admin Secret Key (X-Admin-Key)</span>
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
    :host {
      display: block;
      width: 100%;
    }

    .settings-view {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      width: 100%;
      max-width: 1000px;
      margin: 0 auto;
      min-width: 0;
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
      border-radius: var(--radius-md);
      border: 1px solid var(--border-default);
      background: var(--bg-surface-1);
      box-shadow: var(--surface-highlight), var(--shadow-xs);
      transition: border-color var(--motion-fast), box-shadow var(--motion-fast);
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      padding-bottom: var(--space-3-5);
      border-bottom: 1px solid var(--border-subtle);
      flex-wrap: wrap;
    }
    .panel-title-wrap {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      min-width: 0;
    }
    .panel-icon-box {
      width: 34px;
      height: 34px;
      border-radius: var(--radius-sm);
      background: var(--bg-surface-2);
      border: 1px solid var(--border-default);
      box-shadow: var(--surface-highlight-sm);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .panel-title {
      font-size: var(--text-sm);
      font-weight: 600;
      letter-spacing: -0.015em;
      color: var(--text-primary);
      margin: 0 0 2px 0;
    }
    .panel-desc {
      font-size: var(--text-xs);
      color: var(--text-tertiary);
      margin: 0;
      line-height: 1.4;
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
      justify-content: center;
      gap: var(--space-1-5);
      min-height: 36px;
      padding: 6px 14px;
      font-size: var(--text-xs);
      font-weight: 600;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-default);
      background: var(--bg-surface-2);
      box-shadow: var(--surface-highlight-sm);
      color: var(--text-secondary);
      cursor: pointer;
      transition: all var(--motion-fast);
      user-select: none;
    }
    .toggle-switch-btn:hover {
      border-color: var(--border-strong);
      background: var(--bg-surface-3);
      color: var(--text-primary);
    }
    .toggle-switch-btn:active {
      transform: scale(0.98);
    }
    .toggle-switch-btn.active {
      background: var(--emerald-bg);
      border-color: var(--emerald-border);
      color: var(--emerald-400);
    }

    .time-control-group {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
    }
    .time-input {
      width: 112px;
      min-height: 36px;
      text-align: center;
      font-size: var(--text-xs);
      font-weight: 600;
      padding: 6px 10px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-default);
      background: var(--bg-surface-2);
      color: var(--text-primary);
      transition: border-color var(--motion-fast), box-shadow var(--motion-fast);
    }
    .time-input:focus {
      outline: none;
      border-color: var(--brand-primary);
      box-shadow: 0 0 0 2px var(--brand-focus-ring);
      background: var(--bg-surface-1);
    }
    .tz-pill {
      font-size: 11px;
      font-family: var(--font-mono);
      color: var(--text-secondary);
      background: var(--bg-surface-2);
      border: 1px solid var(--border-default);
      box-shadow: var(--surface-highlight-sm);
      padding: 6px 10px;
      border-radius: var(--radius-xs);
      white-space: nowrap;
    }

    .score-control-group {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }
    .score-range {
      -webkit-appearance: none;
      appearance: none;
      width: 140px;
      height: 6px;
      border-radius: var(--radius-full);
      background: var(--bg-surface-3);
      border: 1px solid var(--border-default);
      cursor: pointer;
    }
    .score-range::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--brand-primary);
      border: 2px solid #ffffff;
      box-shadow: var(--shadow-xs);
      cursor: pointer;
      transition: transform var(--motion-fast), background-color var(--motion-fast);
    }
    .score-range::-webkit-slider-thumb:hover {
      background: var(--brand-primary-hover);
      transform: scale(1.1);
    }
    .score-range::-moz-range-thumb {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--brand-primary);
      border: 2px solid #ffffff;
      box-shadow: var(--shadow-xs);
      cursor: pointer;
      transition: transform var(--motion-fast), background-color var(--motion-fast);
    }
    .score-badge-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 52px;
      padding: 5px 9px;
      background: var(--bg-surface-2);
      border: 1px solid var(--border-default);
      box-shadow: var(--surface-highlight-sm);
      border-radius: var(--radius-xs);
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      font-weight: 700;
      color: var(--brand-accent);
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
      border-radius: var(--radius-sm);
      background: var(--bg-surface-2);
      border: 1px solid var(--border-default);
      box-shadow: var(--surface-highlight-sm);
      cursor: pointer;
      transition: all var(--motion-fast);
      user-select: none;
    }
    .theme-card:hover {
      border-color: var(--border-strong);
      background: var(--bg-surface-3);
      box-shadow: var(--surface-highlight-hover), var(--shadow-xs);
    }
    .theme-card:active {
      transform: scale(0.99);
    }
    .theme-card.active {
      border-color: var(--brand-primary);
      background: var(--brand-bg-subtle);
      box-shadow: inset 0 0 0 1px var(--brand-border-subtle), var(--surface-highlight-sm);
    }
    .theme-card-top {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
    }
    .theme-icon-wrap {
      width: 34px;
      height: 34px;
      border-radius: var(--radius-sm);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .dark-icon {
      background: #09090b;
      color: #818cf8;
      border: 1px solid #27272a;
      box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.08);
    }
    .light-icon {
      background: #ffffff;
      color: #4f46e5;
      border: 1px solid #cbd5e1;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
    }
    .theme-meta {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .theme-name {
      font-size: var(--text-sm);
      font-weight: 600;
      color: var(--text-primary);
    }
    .theme-desc {
      font-size: var(--text-xs);
      color: var(--text-secondary);
      line-height: 1.35;
    }
    .theme-radio {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      border: 1px solid var(--border-strong);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      color: #ffffff;
      background: var(--bg-surface-1);
      transition: all var(--motion-fast);
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
      border: 1px solid var(--border-default);
    }
    .dark-preview {
      background: #09090b;
      border-color: rgba(255, 255, 255, 0.1);
    }
    .light-preview {
      background: #f8fafc;
      border-color: rgba(15, 23, 42, 0.12);
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
    .dot-dark-bg { background: #16161a; border: 1px solid rgba(255,255,255,0.12); }
    .dot-dark-border { background: #2e2e36; }
    .dot-indigo-dark { background: #6366f1; }
    .dot-light-bg { background: #e2e8f0; border: 1px solid rgba(15,23,42,0.1); }
    .dot-light-border { background: #94a3b8; }
    .dot-indigo-light { background: #4f46e5; }
    .preview-chip {
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 500;
    }
    .dark-chip { color: #a1a1aa; }
    .light-chip { color: #475569; }

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
      border: 1px solid var(--border-default);
      box-shadow: var(--surface-highlight-sm);
      border-radius: var(--radius-sm);
    }
    .guardrail-icon-box {
      margin-top: 2px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .guardrail-info strong {
      font-size: var(--text-xs);
      color: var(--text-primary);
      font-weight: 600;
      display: block;
      margin-bottom: 2px;
    }
    .guardrail-info p {
      font-size: var(--text-xs);
      color: var(--text-secondary);
      margin: 0;
      line-height: 1.45;
    }

    /* Danger Zone */
    .danger-panel {
      border-color: var(--rose-border);
      background: linear-gradient(180deg, rgba(244, 63, 94, 0.04) 0%, var(--bg-surface-1) 50%);
      box-shadow: inset 0 1px 0 0 rgba(244, 63, 94, 0.16), var(--shadow-xs);
    }
    .danger-panel:hover {
      border-color: rgba(244, 63, 94, 0.45);
      box-shadow: inset 0 1px 0 0 rgba(244, 63, 94, 0.24), var(--shadow-sm);
    }
    .danger-header {
      border-bottom-color: rgba(244, 63, 94, 0.16);
    }
    .danger-icon-box {
      border-color: var(--rose-border);
      background: var(--rose-bg);
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
      border: 1px solid var(--rose-border);
      box-shadow: var(--surface-highlight-sm);
      border-radius: var(--radius-sm);
    }
    .admin-key-group {
      display: flex;
      flex-direction: column;
      gap: var(--space-1-5);
    }
    .admin-label {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1-5);
      font-size: var(--text-xs);
      font-weight: 600;
      color: var(--text-secondary);
    }
    .admin-input {
      min-height: 36px;
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      letter-spacing: 0.04em;
    }
    .confirm-box {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--space-3);
      background: var(--rose-bg);
      border: 1px solid var(--rose-border);
      border-radius: var(--radius-xs);
    }
    .confirm-warning {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-size: var(--text-xs);
      font-weight: 600;
      color: var(--rose-400);
      line-height: 1.4;
    }
    .confirm-actions {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
    }

    /* Utilities */
    .text-brand { color: var(--brand-accent); }
    .text-sky { color: var(--sky-400); }
    .text-emerald { color: var(--emerald-400); }
    .text-rose { color: var(--rose-400); }

    @media (max-width: 768px) {
      .settings-panel {
        padding: var(--space-4);
      }
      .setting-item {
        flex-direction: column;
        align-items: flex-start;
        gap: var(--space-3);
      }
      .toggle-switch-btn,
      .time-input,
      .admin-input {
        min-height: 44px;
      }
      .score-range {
        width: 160px;
        height: 8px;
      }
      .score-range::-webkit-slider-thumb {
        width: 22px;
        height: 22px;
      }
      .score-range::-moz-range-thumb {
        width: 22px;
        height: 22px;
      }
      .theme-grid {
        grid-template-columns: 1fr;
      }
      .panel-footer ui-button,
      .danger-action-flow ui-button {
        width: 100%;
      }
      .panel-footer ::ng-deep .ui-btn,
      .danger-action-flow ::ng-deep .ui-btn {
        width: 100%;
        min-height: 44px;
      }
      .confirm-actions ui-button {
        flex: 1 1 140px;
      }
    }
  `],
})
export class SettingsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly telegram = inject(TelegramService);
  readonly theme = inject(ThemeService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  profile = signal<CandidateProfile | null>(null);
  digestEnabled = signal<boolean>(true);
  digestTime: string = '09:00';
  digestThreshold: number = 70;
  isSaving = signal<boolean>(false);
  loadFailed = signal<boolean>(false);

  // Danger Zone
  adminKey: string = '';
  showWipeConfirm = signal<boolean>(false);
  isWiping = signal<boolean>(false);

  ngOnInit(): void {
    this.loadSettings();
  }

  loadSettings(): void {
    this.loadFailed.set(false);
    this.api
      .getProfile()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
          this.loadFailed.set(false);
          this.profile.set(p);
          this.digestEnabled.set(p.digest_enabled);
          this.digestTime = p.digest_time || '09:00';
          this.digestThreshold = p.digest_threshold ?? 70;
        },
        error: () => {
          this.loadFailed.set(true);
          this.toast.show(
            'Failed to load settings. Refresh before saving to prevent overwriting defaults.',
            'error'
          );
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
    if (this.loadFailed() || this.isSaving()) return;
    this.isSaving.set(true);
    this.telegram.haptic('medium');

    this.api
      .updateProfile({
        digest_enabled: this.digestEnabled(),
        digest_time: this.digestTime,
        digest_threshold: this.digestThreshold,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isSaving.set(false);
          this.telegram.haptic('success');
          this.toast.show('Settings & automation preferences saved!', 'success');
        },
        error: (err: unknown) => {
          this.isSaving.set(false);
          this.telegram.haptic('error');
          this.toast.show('Failed to save settings: ' + this.extractErrorMessage(err), 'error');
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

    this.api
      .wipeAndReset(this.adminKey.trim())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.isWiping.set(false);
          this.showWipeConfirm.set(false);
          this.adminKey = '';
          this.telegram.haptic('success');
          this.toast.show(res.message || 'Database successfully wiped and reset!', 'success');
          this.loadSettings();
        },
        error: (err: unknown) => {
          this.isWiping.set(false);
          this.telegram.haptic('error');
          this.toast.show('Failed to reset: ' + this.extractErrorMessage(err), 'error');
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
