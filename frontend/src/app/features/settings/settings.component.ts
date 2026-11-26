import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { TelegramService } from '../../core/services/telegram.service';
import { ThemeService, ThemeMode } from '../../core/services/theme.service';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent } from '../../core/components/icon/icon.component';
import {
  UiArchitecturalMotifComponent,
  UiBadgeComponent,
  UiButtonComponent,
  UiCardComponent,
} from '../../core/components/ui';
import { CandidateProfile, SourceInfo } from '../../core/models/job.model';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    FormsModule,
    IconComponent,
    UiArchitecturalMotifComponent,
    UiBadgeComponent,
    UiButtonComponent,
    UiCardComponent,
  ],
  template: `
    <div class="settings-view">
      <!-- Architectural Header -->
      <header class="settings-hero">
        <ui-architectural-motif variant="header" />

        <div class="hero-inner">
          <div>
            <h1 class="page-title">Settings &amp; Controls</h1>
            <p class="subtitle">
              Manage appearance, radar source adapters, Telegram digest thresholds, and database controls.
            </p>
          </div>
          <ui-badge
            [tone]="telegram.isTelegram() ? 'emerald' : 'glass'"
            size="sm"
            [dot]="true"
          >
            {{ telegram.isTelegram() ? 'Telegram Mini App Linked' : 'Web Studio Session' }}
          </ui-badge>
        </div>
      </header>

      <div class="settings-stack">
        <!-- Section 1: Appearance & Visual System -->
        <ui-card variant="elevated" padding="lg" aria-labelledby="theme-title">
          <div class="panel-header">
            <div class="panel-title-wrap">
              <div class="panel-icon-box text-copper">
                <app-icon name="sparkles" [size]="16" />
              </div>
              <div>
                <h2 id="theme-title" class="panel-title">Appearance &amp; Theme</h2>
                <p class="panel-desc">Studio Obsidian &amp; Daylight Pearl surfaces stay synced with Telegram WebApp.</p>
              </div>
            </div>
            <ui-badge tone="copper" size="sm" [dot]="true">
              {{ theme.isDark() ? 'Studio Obsidian' : 'Daylight Pearl' }}
            </ui-badge>
          </div>

          <div class="theme-grid">
            <!-- Studio Obsidian Preview Card -->
            <div
              class="theme-card"
              [class.active]="theme.isDark()"
              (click)="selectTheme('dark')"
              role="button"
              tabindex="0"
              [attr.aria-pressed]="theme.isDark()"
              (keydown.enter)="selectTheme('dark')"
              (keydown.space)="$event.preventDefault(); selectTheme('dark')"
              aria-label="Select Studio Obsidian Dark Theme"
            >
              <div class="theme-card-top">
                <div class="theme-icon-wrap dark-icon">
                  <app-icon name="moon" [size]="16" />
                </div>
                <div class="theme-meta">
                  <strong class="theme-name">Studio Obsidian</strong>
                  <span class="theme-desc">Obsidian canvas with Warm Copper focal nodes</span>
                </div>
                <div class="theme-radio" [class.checked]="theme.isDark()">
                  @if (theme.isDark()) {
                    <app-icon name="check" [size]="11" />
                  }
                </div>
              </div>

              <div class="theme-preview dark-preview">
                <div class="preview-bar">
                  <span class="preview-dot dot-dark-bg"></span>
                  <span class="preview-dot dot-dark-border"></span>
                  <span class="preview-dot dot-copper"></span>
                </div>
                <div class="preview-chip dark-chip">#0C0D10 · Obsidian</div>
              </div>
            </div>

            <!-- Daylight Pearl Preview Card -->
            <div
              class="theme-card"
              [class.active]="!theme.isDark()"
              (click)="selectTheme('light')"
              role="button"
              tabindex="0"
              [attr.aria-pressed]="!theme.isDark()"
              (keydown.enter)="selectTheme('light')"
              (keydown.space)="$event.preventDefault(); selectTheme('light')"
              aria-label="Select Daylight Pearl Light Theme"
            >
              <div class="theme-card-top">
                <div class="theme-icon-wrap light-icon">
                  <app-icon name="sun" [size]="16" />
                </div>
                <div class="theme-meta">
                  <strong class="theme-name">Daylight Pearl</strong>
                  <span class="theme-desc">Warm mineral canvas with crisp architectural hairlines</span>
                </div>
                <div class="theme-radio" [class.checked]="!theme.isDark()">
                  @if (!theme.isDark()) {
                    <app-icon name="check" [size]="11" />
                  }
                </div>
              </div>

              <div class="theme-preview light-preview">
                <div class="preview-bar">
                  <span class="preview-dot dot-light-bg"></span>
                  <span class="preview-dot dot-light-border"></span>
                  <span class="preview-dot dot-copper"></span>
                </div>
                <div class="preview-chip light-chip">#F7F7F5 · Pearl</div>
              </div>
            </div>
          </div>
        </ui-card>

        <!-- Section 2: Radar Sources Health -->
        <ui-card variant="elevated" padding="lg" aria-labelledby="sources-title">
          <div class="panel-header">
            <div class="panel-title-wrap">
              <div class="panel-icon-box text-copper">
                <app-icon name="database" [size]="16" />
              </div>
              <div>
                <h2 id="sources-title" class="panel-title">Radar Sources &amp; Adapter Health</h2>
                <p class="panel-desc">Active discovery pipelines across regional boards, LinkedIn surfaces, and global ATS feeds</p>
              </div>
            </div>

            <div class="sources-header-actions">
              <ui-badge tone="emerald" size="sm" [dot]="true" [mono]="true">
                {{ enabledSourcesCount() }}/{{ sources().length }} Enabled
              </ui-badge>
              <ui-button
                variant="secondary"
                size="sm"
                [loading]="isCheckingHealth()"
                (clicked)="probeSourcesHealth()"
              >
                <app-icon name="activity" [size]="13" />
                <span>{{ isCheckingHealth() ? 'Probing...' : 'Check Health' }}</span>
              </ui-button>
            </div>
          </div>

          <div class="sources-grid">
            @for (src of sources(); track src.name) {
              <div class="source-adapter-row">
                <div class="source-row-left">
                  <span class="source-dot" [class.enabled]="src.is_enabled" aria-hidden="true"></span>
                  <div class="source-copy">
                    <span class="source-name">{{ formatSourceName(src.name) }}</span>
                    <span class="source-meta tabular-nums">
                      {{ src.source_type }} · {{ src.rate_limit_per_min }}/min
                      @if (src.last_sync_status) {
                        <span>· {{ src.last_sync_status }}</span>
                      }
                    </span>
                  </div>
                </div>

                <div class="source-row-badges">
                  @if (healthMap()[src.name] !== undefined) {
                    <ui-badge
                      [tone]="healthMap()[src.name] ? 'emerald' : 'amber'"
                      size="sm"
                    >
                      {{ healthMap()[src.name] ? 'Reachable' : 'Degraded' }}
                    </ui-badge>
                  }
                  <ui-badge [tone]="src.is_enabled ? 'emerald' : 'neutral'" size="sm">
                    {{ src.is_enabled ? 'Enabled' : 'Paused' }}
                  </ui-badge>
                </div>
              </div>
            }
          </div>
        </ui-card>

        <!-- Section 3: Notification / Digest Thresholds & Telegram Sync -->
        <ui-card variant="elevated" padding="lg" aria-labelledby="delivery-title">
          <div class="panel-header">
            <div class="panel-title-wrap">
              <div class="panel-icon-box text-copper">
                <app-icon name="bell" [size]="16" />
              </div>
              <div>
                <h2 id="delivery-title" class="panel-title">Daily Telegram Dispatch &amp; Sync</h2>
                <p class="panel-desc">Automated morning briefings and match score threshold configuration</p>
              </div>
            </div>
            <ui-badge [tone]="digestEnabled() ? 'emerald' : 'neutral'" [dot]="true">
              {{ digestEnabled() ? 'Active Sweep' : 'Dispatch Paused' }}
            </ui-badge>
          </div>

          <div class="panel-body">
            <div class="setting-item">
              <div class="item-text">
                <strong>Automated Morning Digest</strong>
                <p>Receive a curated daily summary of high-affinity software engineering matches straight to Telegram.</p>
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
                  <app-icon [name]="digestEnabled() ? 'check' : 'clock'" [size]="13" />
                  <span>{{ digestEnabled() ? 'Active' : 'Paused' }}</span>
                </button>
              </div>
            </div>

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

            <div class="setting-item">
              <div class="item-text">
                <strong>Minimum Match Score Threshold</strong>
                <p>Only opportunities matching at or above this threshold are included in your morning digest.</p>
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

            <div class="setting-item">
              <div class="item-text">
                <strong>Telegram WebApp Context</strong>
                <p>
                  @if (telegram.telegramUser(); as tgUser) {
                    Connected as {{ tgUser.first_name }}@if (tgUser.username) { (&#64;{{ tgUser.username }}) } with native theme and haptic sync.
                  } @else {
                    Open via Telegram Mini App to activate native haptic feedback and seamless chat deep-links.
                  }
                </p>
              </div>
              <div class="item-control">
                <ui-badge [tone]="telegram.isTelegram() ? 'emerald' : 'neutral'" size="sm">
                  {{ telegram.isTelegram() ? 'Sync Active' : 'Standalone Browser' }}
                </ui-badge>
              </div>
            </div>
          </div>

          <div class="panel-footer">
            <ui-button
              variant="primary"
              size="md"
              [loading]="isSaving()"
              [disabled]="loadFailed() || isSaving()"
              (clicked)="saveSettings()"
            >
              <app-icon name="check" [size]="14" />
              <span>{{ isSaving() ? 'Saving...' : 'Save Preferences' }}</span>
            </ui-button>
          </div>
        </ui-card>

        <!-- Section 4: Privacy & Security Guardrails -->
        <ui-card variant="elevated" padding="lg" aria-labelledby="privacy-title">
          <div class="panel-header">
            <div class="panel-title-wrap">
              <div class="panel-icon-box text-emerald">
                <app-icon name="shield-check" [size]="16" />
              </div>
              <div>
                <h2 id="privacy-title" class="panel-title">Privacy &amp; Security Guardrails</h2>
                <p class="panel-desc">Safety guarantees enforced at pipeline level</p>
              </div>
            </div>
            <ui-badge tone="emerald" size="sm">Engine Enforced</ui-badge>
          </div>

          <div class="guardrail-grid">
            <div class="guardrail-row">
              <app-icon name="check-circle" [size]="15" class="text-emerald" />
              <div class="guardrail-info">
                <strong>Zero Auto-Submission Guarantee</strong>
                <p>The agent never submits job applications automatically without your explicit action.</p>
              </div>
            </div>

            <div class="guardrail-row">
              <app-icon name="shield-check" [size]="15" class="text-emerald" />
              <div class="guardrail-info">
                <strong>Local PII Sanitization</strong>
                <p>Uploaded CV files and contact details are sanitized locally prior to skill extraction.</p>
              </div>
            </div>
          </div>
        </ui-card>

        <!-- Section 5: Danger Zone -->
        <ui-card variant="elevated" padding="lg" class="danger-panel" aria-labelledby="danger-title">
          <div class="panel-header danger-header">
            <div class="panel-title-wrap">
              <div class="panel-icon-box danger-icon-box text-crimson">
                <app-icon name="alert-circle" [size]="16" />
              </div>
              <div>
                <h2 id="danger-title" class="panel-title text-crimson">Danger Zone</h2>
                <p class="panel-desc">Irreversible database purge and candidate profile re-initialization</p>
              </div>
            </div>
            <ui-badge tone="crimson" size="sm">Irreversible</ui-badge>
          </div>

          <div class="danger-box">
            <div class="danger-info">
              <strong>Wipe Database &amp; Reset Profile</strong>
              <p>Permanently purges all scraped jobs, tracker stages, notes, and notification logs.</p>
            </div>

            <div class="danger-action-flow">
              <div class="admin-key-group">
                <label for="adminKeyInput" class="admin-label">
                  <app-icon name="lock" [size]="12" />
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
                  variant="danger"
                  size="md"
                  [disabled]="!adminKey.trim() || isWiping()"
                  (clicked)="requestWipe()"
                >
                  <app-icon name="trash" [size]="14" />
                  <span>Wipe Database &amp; Reset</span>
                </ui-button>
              } @else {
                <div class="confirm-box">
                  <div class="confirm-warning">
                    <app-icon name="alert-circle" [size]="14" class="text-crimson" />
                    <span>Are you sure? All tracked jobs and logs will be permanently deleted.</span>
                  </div>
                  <div class="confirm-actions">
                    <ui-button
                      variant="danger"
                      size="md"
                      [loading]="isWiping()"
                      (clicked)="executeWipe()"
                    >
                      <app-icon name="trash" [size]="14" />
                      <span>Yes, Permanently Wipe</span>
                    </ui-button>
                    <ui-button
                      variant="ghost"
                      size="md"
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
        </ui-card>
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
      max-width: 1040px;
      margin: 0 auto;
      min-width: 0;
    }

    /* Architectural Hero */
    .settings-hero {
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
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--space-3);
      flex-wrap: wrap;
    }

    .page-title {
      font-family: var(--font-display);
      font-size: var(--text-h1);
      font-weight: 700;
      letter-spacing: var(--tracking-tight);
      color: var(--ink-primary);
      margin: 0 0 4px 0;
    }

    .subtitle {
      font-size: var(--text-sm);
      color: var(--ink-secondary);
      margin: 0;
      line-height: 1.5;
    }

    .settings-stack {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      width: 100%;
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      padding-bottom: var(--space-3-5);
      border-bottom: 1px solid var(--border-hairline);
      flex-wrap: wrap;
    }

    .panel-title-wrap {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      min-width: 0;
    }

    .panel-icon-box {
      width: 36px;
      height: 36px;
      border-radius: var(--radius-sm);
      background: var(--surface-subtle);
      border: 1px solid var(--border-hairline);
      box-shadow: var(--border-specular-sm);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .panel-title {
      font-family: var(--font-display);
      font-size: var(--text-md);
      font-weight: 600;
      letter-spacing: var(--tracking-snug);
      color: var(--ink-primary);
      margin: 0 0 2px 0;
    }

    .panel-desc {
      font-size: var(--text-xs);
      color: var(--ink-muted);
      margin: 0;
      line-height: 1.4;
    }

    .panel-body {
      padding-top: var(--space-2);
    }

    /* Theme Grid */
    .theme-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-3);
      margin-top: var(--space-4);
    }

    .theme-card {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--space-4);
      border-radius: var(--radius-md);
      background: var(--surface-subtle);
      border: 1px solid var(--border-hairline);
      box-shadow: var(--border-specular-sm);
      cursor: pointer;
      transition:
        border-color var(--dur-fast) var(--ease-spring),
        background-color var(--dur-fast) var(--ease-spring),
        box-shadow var(--dur-fast) var(--ease-spring);
      user-select: none;
    }

    .theme-card:hover {
      border-color: var(--border-strong);
      background: var(--surface-muted);
    }

    .theme-card.active {
      border-color: var(--border-copper);
      background: var(--accent-copper-soft);
    }

    .theme-card-top {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
    }

    .theme-icon-wrap {
      width: 36px;
      height: 36px;
      border-radius: var(--radius-sm);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .dark-icon {
      background: #0C0D10;
      color: #D95D39;
      border: 1px solid rgba(255, 255, 255, 0.12);
    }

    .light-icon {
      background: #FFFFFF;
      color: #D95D39;
      border: 1px solid rgba(17, 19, 24, 0.12);
    }

    .theme-meta {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .theme-name {
      font-family: var(--font-display);
      font-size: var(--text-sm);
      font-weight: 600;
      color: var(--ink-primary);
    }

    .theme-desc {
      font-size: var(--text-xs);
      color: var(--ink-secondary);
      line-height: 1.4;
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
      color: #FFFFFF;
      background: var(--surface-elevated);
    }

    .theme-radio.checked {
      background: var(--accent-copper);
      border-color: var(--accent-copper);
    }

    .theme-preview {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-2) var(--space-2-5);
      border-radius: var(--radius-xs);
      border: 1px solid var(--border-hairline);
    }

    .dark-preview {
      background: #0C0D10;
      border-color: rgba(255, 255, 255, 0.09);
    }

    .light-preview {
      background: #F7F7F5;
      border-color: rgba(17, 19, 24, 0.08);
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

    .dot-dark-bg { background: #14161B; border: 1px solid rgba(255, 255, 255, 0.14); }
    .dot-dark-border { background: #2D323E; }
    .dot-light-bg { background: #FFFFFF; border: 1px solid rgba(17, 19, 24, 0.12); }
    .dot-light-border { background: #D1D5DB; }
    .dot-copper { background: #D95D39; }

    .preview-chip {
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 500;
    }

    .dark-chip { color: #9CA3AF; }
    .light-chip { color: #525866; }

    /* Radar Sources Grid */
    .sources-header-actions {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
    }

    .sources-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-2);
      margin-top: var(--space-4);
    }

    .source-adapter-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      padding: var(--space-2-5) var(--space-3);
      background-color: var(--surface-subtle);
      border: 1px solid var(--border-hairline);
      border-radius: var(--radius-sm);
      min-width: 0;
    }

    .source-row-left {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-width: 0;
    }

    .source-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background-color: var(--ink-muted);
      flex-shrink: 0;
    }

    .source-dot.enabled {
      background-color: var(--semantic-emerald);
    }

    .source-copy {
      display: flex;
      flex-direction: column;
      gap: 1px;
      min-width: 0;
    }

    .source-name {
      font-size: var(--text-xs);
      font-weight: 600;
      color: var(--ink-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .source-meta {
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--ink-muted);
    }

    .source-row-badges {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }

    /* Setting Items */
    .setting-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-4);
      padding: var(--space-4) 0;
      border-bottom: 1px solid var(--border-hairline);
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
      color: var(--ink-primary);
      font-weight: 600;
    }

    .item-text p {
      font-size: var(--text-xs);
      color: var(--ink-secondary);
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
      border: 1px solid var(--border-hairline);
      background: var(--surface-subtle);
      color: var(--ink-secondary);
      cursor: pointer;
      transition:
        background-color var(--dur-fast) var(--ease-spring),
        border-color var(--dur-fast) var(--ease-spring),
        color var(--dur-fast) var(--ease-spring);
    }

    .toggle-switch-btn.active {
      background: var(--semantic-emerald-soft);
      border-color: var(--semantic-emerald-border);
      color: var(--semantic-emerald-text);
    }

    .time-control-group {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
    }

    .time-input {
      width: 118px;
      min-height: 38px;
      text-align: center;
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      font-weight: 600;
    }

    .tz-pill {
      font-size: 11px;
      font-family: var(--font-mono);
      color: var(--ink-secondary);
      background: var(--surface-subtle);
      border: 1px solid var(--border-hairline);
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
      background: var(--surface-muted);
      border: 1px solid var(--border-hairline);
      cursor: pointer;
    }

    .score-range::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--accent-copper);
      border: 2px solid #FFFFFF;
      box-shadow: var(--shadow-xs);
      cursor: pointer;
    }

    .score-range::-moz-range-thumb {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--accent-copper);
      border: 2px solid #FFFFFF;
      box-shadow: var(--shadow-xs);
      cursor: pointer;
    }

    .score-badge-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 52px;
      padding: 6px 10px;
      background: var(--accent-copper-soft);
      border: 1px solid var(--border-copper);
      border-radius: var(--radius-xs);
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      font-weight: 700;
      color: var(--accent-copper-text);
    }

    .panel-footer {
      display: flex;
      justify-content: flex-end;
      padding-top: var(--space-4);
      margin-top: var(--space-2);
      border-top: 1px solid var(--border-hairline);
    }

    /* Guardrails */
    .guardrail-grid {
      display: flex;
      flex-direction: column;
      gap: var(--space-2-5);
      margin-top: var(--space-4);
    }

    .guardrail-row {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
      padding: var(--space-3);
      background: var(--surface-subtle);
      border: 1px solid var(--border-hairline);
      border-radius: var(--radius-sm);
    }

    .guardrail-info strong {
      font-size: var(--text-xs);
      color: var(--ink-primary);
      font-weight: 600;
      display: block;
      margin-bottom: 2px;
    }

    .guardrail-info p {
      font-size: var(--text-xs);
      color: var(--ink-secondary);
      margin: 0;
      line-height: 1.45;
    }

    /* Danger Zone */
    .danger-panel {
      display: block;
      border-color: var(--semantic-crimson-border);
    }

    .danger-header {
      border-bottom-color: var(--semantic-crimson-border);
    }

    .danger-icon-box {
      border-color: var(--semantic-crimson-border);
      background: var(--semantic-crimson-soft);
    }

    .danger-box {
      display: flex;
      flex-direction: column;
      gap: var(--space-3-5);
      padding-top: var(--space-4);
    }

    .danger-info strong {
      font-size: var(--text-sm);
      color: var(--ink-primary);
      font-weight: 600;
      display: block;
      margin-bottom: 3px;
    }

    .danger-info p {
      font-size: var(--text-xs);
      color: var(--ink-secondary);
      margin: 0;
      line-height: 1.45;
    }

    .danger-action-flow {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--space-3-5);
      background: var(--surface-subtle);
      border: 1px solid var(--semantic-crimson-border);
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
      gap: var(--space-1-5);
      font-size: var(--text-xs);
      font-weight: 600;
      color: var(--ink-secondary);
    }

    .admin-input {
      min-height: 38px;
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      letter-spacing: 0.04em;
    }

    .confirm-box {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--space-3);
      background: var(--semantic-crimson-soft);
      border: 1px solid var(--semantic-crimson-border);
      border-radius: var(--radius-sm);
    }

    .confirm-warning {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-size: var(--text-xs);
      font-weight: 600;
      color: var(--semantic-crimson-text);
      line-height: 1.4;
    }

    .confirm-actions {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
    }

    .text-copper { color: var(--accent-copper-text); }
    .text-emerald { color: var(--semantic-emerald-text); }
    .text-crimson { color: var(--semantic-crimson-text); }

    @media (max-width: 767px) {
      .settings-hero {
        padding: var(--space-4);
      }

      .theme-grid,
      .sources-grid {
        grid-template-columns: minmax(0, 1fr);
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
    }
  `],
})
export class SettingsComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly telegram = inject(TelegramService);
  readonly theme = inject(ThemeService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly profile = signal<CandidateProfile | null>(null);
  readonly sources = signal<SourceInfo[]>([]);
  readonly healthMap = signal<Record<string, boolean>>({});
  readonly isCheckingHealth = signal<boolean>(false);

  readonly digestEnabled = signal<boolean>(true);
  digestTime = '09:00';
  digestThreshold = 70;
  readonly isSaving = signal<boolean>(false);
  readonly loadFailed = signal<boolean>(false);

  adminKey = '';
  readonly showWipeConfirm = signal<boolean>(false);
  readonly isWiping = signal<boolean>(false);

  ngOnInit(): void {
    this.loadSettings();
    this.loadSources();
  }

  enabledSourcesCount(): number {
    return this.sources().filter((s) => s.is_enabled).length;
  }

  formatSourceName(name: string): string {
    const labels: Record<string, string> = {
      wuzzuf: 'Wuzzuf Egypt',
      linkedin_jobs: 'LinkedIn Jobs',
      linkedin_social: 'LinkedIn Social Posts',
      major_boards_dork: 'Major Boards Search',
      ats_dork: 'Global ATS Discovery',
      egypt_community: 'Egypt Community Feeds',
      himalayas: 'Himalayas Remote',
      remotive: 'Remotive Remote',
      jobicy: 'Jobicy Tech',
    };
    return labels[name] || name.replace(/_/g, ' ');
  }

  loadSources(): void {
    this.api
      .getSources()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => this.sources.set(list),
        error: () => {},
      });
  }

  probeSourcesHealth(): void {
    if (this.isCheckingHealth()) return;
    this.isCheckingHealth.set(true);
    this.telegram.haptic('selection');
    this.api
      .getSourcesHealth()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.healthMap.set(result);
          this.isCheckingHealth.set(false);
          this.telegram.haptic('success');
          this.toast.show('Source adapter health check complete', 'info', 2000);
        },
        error: () => {
          this.isCheckingHealth.set(false);
          this.toast.show('Could not complete live source probe', 'error');
        },
      });
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
