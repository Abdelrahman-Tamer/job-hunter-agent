import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { TelegramService } from '../../core/services/telegram.service';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent } from '../../core/components/icon/icon.component';
import { CandidateProfile } from '../../core/models/job.model';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
    <div class="settings-view">
      <!-- Header -->
      <header class="settings-header">
        <div>
          <h1>Automation & Agent Preferences</h1>
          <p class="subtitle">Configure automated Telegram dispatches, matching thresholds, and security guardrails</p>
        </div>
      </header>

      <!-- Settings Stack -->
      <div class="settings-stack">
        <!-- Delivery Preferences Card -->
        <section class="panel settings-panel" aria-labelledby="delivery-title">
          <div class="panel-header">
            <div class="panel-title-wrap">
              <app-icon name="bell" [size]="16" class="panel-icon-accent"></app-icon>
              <h2 id="delivery-title">Daily Telegram Dispatch</h2>
            </div>
            <span class="status-badge" [class.active]="digestEnabled()">
              {{ digestEnabled() ? 'Daily Sweep Active' : 'Dispatch Paused' }}
            </span>
          </div>

          <div class="setting-item">
            <div class="item-text">
              <strong>Automated Morning Digest</strong>
              <p>Receive a curated summary of software engineering matches delivered directly to your Telegram chat.</p>
            </div>
            <div class="item-control">
              <button
                (click)="toggleDigest()"
                class="btn btn-sm"
                [class.btn-primary]="digestEnabled()"
                [class.btn-secondary]="!digestEnabled()"
              >
                <app-icon [name]="digestEnabled() ? 'check' : 'clock'" [size]="13"></app-icon>
                <span>{{ digestEnabled() ? 'Enabled' : 'Paused' }}</span>
              </button>
            </div>
          </div>

          <div class="setting-item">
            <div class="item-text">
              <strong>Scheduled Sweep Time</strong>
              <p>Daily time when the autonomous hunter initiates feed sweeping and sends your digest.</p>
            </div>
            <div class="item-control">
              <div class="time-control-group">
                <input
                  type="text"
                  [(ngModel)]="digestTime"
                  class="form-input time-input"
                  aria-label="Digest time"
                  placeholder="09:00"
                />
                <span class="tz-tag">Africa/Cairo (UTC+2)</span>
              </div>
            </div>
          </div>

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
                  aria-label="Threshold slider"
                />
                <div class="score-input-wrap">
                  <input
                    type="number"
                    [(ngModel)]="digestThreshold"
                    min="50"
                    max="95"
                    class="form-input score-input"
                    aria-label="Threshold number"
                  />
                  <span class="unit-text">%</span>
                </div>
              </div>
            </div>
          </div>

          <div class="panel-footer">
            <button (click)="saveSettings()" [disabled]="isSaving()" class="btn btn-primary">
              <app-icon [name]="isSaving() ? 'refresh' : 'check'" [size]="14" [class.spin]="isSaving()"></app-icon>
              <span>{{ isSaving() ? 'Saving Preferences...' : 'Save Preferences' }}</span>
            </button>
          </div>
        </section>

        <!-- Privacy & Safety Information Card -->
        <section class="panel settings-panel" aria-labelledby="privacy-title">
          <div class="panel-header">
            <div class="panel-title-wrap">
              <app-icon name="shield-check" [size]="16" class="text-green"></app-icon>
              <h2 id="privacy-title">Privacy & Security Guardrails</h2>
            </div>
            <span class="badge badge-green">Enforced by Engine</span>
          </div>

          <div class="guardrail-grid">
            <div class="guardrail-row">
              <div class="guardrail-icon-box">
                <app-icon name="check-circle" [size]="15" class="text-green"></app-icon>
              </div>
              <div class="guardrail-info">
                <strong>Zero Auto-Submission</strong>
                <p>The agent never submits applications on your behalf without your explicit manual review and deliberate application.</p>
              </div>
            </div>

            <div class="guardrail-row">
              <div class="guardrail-icon-box">
                <app-icon name="shield-check" [size]="15" class="text-green"></app-icon>
              </div>
              <div class="guardrail-info">
                <strong>Local PII Sanitization</strong>
                <p>CV files and personal identifiers are sanitized before parsing, keeping sensitive contact information confidential.</p>
              </div>
            </div>

            <div class="guardrail-row">
              <div class="guardrail-icon-box">
                <app-icon name="database" [size]="15" class="text-blue"></app-icon>
              </div>
              <div class="guardrail-info">
                <strong>Direct ATS Ingestion</strong>
                <p>All job postings are crawled from verified employer ATS feeds (Greenhouse, Lever, RemoteOK, Arbeitnow) with deduplication.</p>
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
    }

    .settings-header h1 {
      font-size: var(--text-2xl);
      letter-spacing: -0.025em;
      margin-bottom: 2px;
    }
    .subtitle {
      font-size: var(--text-sm);
      color: var(--color-text-secondary);
      margin: 0;
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
    }
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--color-border-subtle);
      padding-bottom: var(--space-3);
      margin-bottom: var(--space-2);
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
    .text-blue { color: var(--color-brand-accent); }

    .status-badge {
      font-size: 10px;
      font-family: var(--font-mono);
      font-weight: 700;
      padding: 3px 8px;
      border-radius: var(--radius-sm);
      background: var(--color-bg-surface-elevated);
      color: var(--color-text-muted);
      border: 1px solid var(--color-border-subtle);
    }
    .status-badge.active {
      background: var(--color-success-bg);
      color: var(--color-success-text);
      border-color: var(--color-success-border);
    }

    .setting-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-4);
      padding: var(--space-3-5) 0;
      border-bottom: 1px solid var(--color-border-subtle);
    }
    .setting-item:last-of-type {
      border-bottom: none;
    }

    .item-text {
      display: flex;
      flex-direction: column;
      gap: 3px;
      max-width: 680px;
    }
    .item-text strong {
      font-size: var(--text-sm);
      color: var(--color-text-primary);
    }
    .item-text p {
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
      margin: 0;
      line-height: 1.45;
    }

    .time-control-group {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .time-input {
      width: 80px;
      text-align: center;
      font-family: var(--font-mono);
      font-weight: 700;
      padding: 6px 8px;
    }
    .tz-tag {
      font-size: 10px;
      font-family: var(--font-mono);
      color: var(--color-text-muted);
      background: var(--color-bg-surface-elevated);
      border: 1px solid var(--color-border-subtle);
      padding: 5px 8px;
      border-radius: var(--radius-sm);
      white-space: nowrap;
    }

    .score-control-group {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }
    .score-range {
      width: 120px;
      cursor: pointer;
      accent-color: var(--color-brand-primary);
    }
    .score-input-wrap {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .score-input {
      width: 60px;
      text-align: center;
      font-family: var(--font-mono);
      font-weight: 700;
      padding: 6px 8px;
    }
    .unit-text {
      font-size: var(--text-xs);
      color: var(--color-text-muted);
      font-weight: 700;
    }

    .panel-footer {
      display: flex;
      justify-content: flex-end;
      padding-top: var(--space-4);
      margin-top: var(--space-2);
      border-top: 1px solid var(--color-border-subtle);
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
      background: var(--color-bg-surface-elevated-glass);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md);
      transition: background-color var(--motion-fast), border-color var(--motion-fast);
    }
    .guardrail-row:hover {
      background-color: var(--color-bg-surface-hover);
      border-color: var(--color-border-hover);
    }
    .guardrail-icon-box {
      margin-top: 2px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .guardrail-info strong {
      font-size: var(--text-xs);
      color: var(--color-text-primary);
      display: block;
      margin-bottom: 2px;
    }
    .guardrail-info p {
      font-size: var(--text-2xs);
      color: var(--color-text-secondary);
      margin: 0;
      line-height: 1.4;
    }

    .spin {
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    @media (max-width: 768px) {
      .setting-item {
        flex-direction: column;
        align-items: flex-start;
        gap: var(--space-2-5);
      }
      .panel-footer .btn {
        width: 100%;
      }
    }
  `],
})
export class SettingsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly telegram = inject(TelegramService);
  private readonly toast = inject(ToastService);

  profile = signal<CandidateProfile | null>(null);
  digestEnabled = signal<boolean>(true);
  digestTime: string = '09:00';
  digestThreshold: number = 70;
  isSaving = signal<boolean>(false);

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
    });
  }

  toggleDigest(): void {
    this.telegram.haptic('selection');
    this.digestEnabled.update((v) => !v);
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
          this.toast.show('Failed to save settings: ' + (err.error?.detail || err.message), 'error');
        },
      });
  }
}
