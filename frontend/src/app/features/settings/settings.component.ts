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
          <h1>Automation & Preferences</h1>
          <p class="subtitle">Configure automated Telegram dispatches, matching thresholds, and security guardrails</p>
        </div>
      </header>

      <div class="settings-stack">
        <!-- Delivery Preferences Card -->
        <section class="panel settings-card" aria-labelledby="delivery-title">
          <div class="panel-header">
            <div class="panel-title-wrap">
              <app-icon name="bell" [size]="18" class="panel-icon-accent"></app-icon>
              <h2 id="delivery-title">Daily Telegram Dispatch</h2>
            </div>
            <span class="status-pill" [class.active]="digestEnabled()">
              {{ digestEnabled() ? 'Daily Sweep Active' : 'Dispatch Paused' }}
            </span>
          </div>

          <div class="setting-row">
            <div class="row-info">
              <strong>Automated Morning Digest</strong>
              <p>Receive a curated summary of software engineering matches delivered directly to your Telegram chat.</p>
            </div>
            <div class="row-action">
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

          <div class="setting-row">
            <div class="row-info">
              <strong>Scheduled Execution Time</strong>
              <p>Daily time when the autonomous hunter initiates feed sweeping and sends your digest.</p>
            </div>
            <div class="row-action">
              <div class="time-input-group">
                <input
                  type="text"
                  [(ngModel)]="digestTime"
                  class="form-input time-input"
                  aria-label="Digest time"
                  placeholder="09:00"
                />
                <span class="tz-badge">Africa/Cairo</span>
              </div>
            </div>
          </div>

          <div class="setting-row">
            <div class="row-info">
              <strong>Minimum Match Score Threshold</strong>
              <p>Only opportunities matching at or above this score are included in your morning digest.</p>
            </div>
            <div class="row-action">
              <div class="score-slider-group">
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

          <div class="card-footer">
            <button (click)="saveSettings()" [disabled]="isSaving()" class="btn btn-primary">
              <app-icon [name]="isSaving() ? 'refresh' : 'check'" [size]="14" [class.spin]="isSaving()"></app-icon>
              <span>{{ isSaving() ? 'Saving Preferences...' : 'Save Preferences' }}</span>
            </button>
          </div>
        </section>

        <!-- Privacy & Safety Information Card -->
        <section class="panel settings-card" aria-labelledby="privacy-title">
          <div class="panel-header">
            <div class="panel-title-wrap">
              <app-icon name="shield-check" [size]="18" class="panel-icon-accent text-green"></app-icon>
              <h2 id="privacy-title">Privacy & Safety Guardrails</h2>
            </div>
            <span class="badge badge-green">Enforced by Agent</span>
          </div>

          <div class="info-list">
            <div class="info-item">
              <div class="info-icon-box">
                <app-icon name="check-circle" [size]="16" class="icon-check text-green"></app-icon>
              </div>
              <div class="info-text-block">
                <strong>Zero Auto-Submission</strong>
                <p>The agent never submits applications on your behalf without your explicit manual review and direct link submission.</p>
              </div>
            </div>

            <div class="info-item">
              <div class="info-icon-box">
                <app-icon name="shield-check" [size]="16" class="icon-check text-green"></app-icon>
              </div>
              <div class="info-text-block">
                <strong>Client-Side PII Sanitization</strong>
                <p>CV files and personal identifiers are sanitized before parsing, keeping sensitive contact information private.</p>
              </div>
            </div>

            <div class="info-item">
              <div class="info-icon-box">
                <app-icon name="database" [size]="16" class="icon-check text-blue"></app-icon>
              </div>
              <div class="info-text-block">
                <strong>Clean Source Verification</strong>
                <p>All job postings are crawled from verified employer ATS feeds (Greenhouse, Lever, RemoteOK, Arbeitnow) with duplicate filtering.</p>
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

    .settings-card {
      padding: var(--space-5);
    }
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--color-border-subtle);
      padding-bottom: var(--space-3);
      margin-bottom: var(--space-4);
    }
    .panel-title-wrap {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .panel-title-wrap h2 {
      font-size: var(--text-base);
      font-weight: 700;
      margin: 0;
    }
    .panel-icon-accent {
      color: var(--color-brand-accent);
    }
    .text-green { color: var(--color-success-text); }
    .text-blue { color: var(--color-brand-accent); }

    .status-pill {
      font-size: var(--text-2xs);
      font-family: var(--font-mono);
      font-weight: 600;
      padding: 3px 9px;
      border-radius: var(--radius-pill);
      background: var(--color-bg-surface-elevated);
      color: var(--color-text-muted);
      border: 1px solid var(--color-border-subtle);
    }
    .status-pill.active {
      background: var(--color-success-bg);
      color: var(--color-success-text);
      border-color: var(--color-success-border);
    }

    .setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-4);
      padding: var(--space-3-5) 0;
      border-bottom: 1px solid var(--color-border-subtle);
    }
    .setting-row:last-of-type {
      border-bottom: none;
    }

    .row-info {
      display: flex;
      flex-direction: column;
      gap: 3px;
      max-width: 680px;
    }
    .row-info strong {
      font-size: var(--text-sm);
      color: var(--color-text-primary);
    }
    .row-info p {
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
      margin: 0;
      line-height: 1.45;
    }

    .time-input-group {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .time-input {
      width: 88px;
      text-align: center;
      font-family: var(--font-mono);
      font-weight: 700;
    }
    .tz-badge {
      font-size: var(--text-2xs);
      font-family: var(--font-mono);
      color: var(--color-text-muted);
      background: var(--color-bg-surface-elevated);
      border: 1px solid var(--color-border-subtle);
      padding: 5px 9px;
      border-radius: var(--radius-md);
      white-space: nowrap;
    }

    .score-slider-group {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }
    .score-range {
      width: 130px;
      cursor: pointer;
      accent-color: var(--color-brand-primary);
    }
    .score-input-wrap {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .score-input {
      width: 64px;
      text-align: center;
      font-family: var(--font-mono);
      font-weight: 700;
    }
    .unit-text {
      font-size: var(--text-xs);
      color: var(--color-text-muted);
      font-weight: 700;
    }

    .card-footer {
      display: flex;
      justify-content: flex-end;
      padding-top: var(--space-4);
      margin-top: var(--space-2);
      border-top: 1px solid var(--color-border-subtle);
    }

    /* Info Items */
    .info-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .info-item {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-3-5);
      background: var(--color-bg-surface-elevated-glass);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md);
    }
    .info-icon-box {
      margin-top: 2px;
    }
    .info-text-block strong {
      font-size: var(--text-xs);
      color: var(--color-text-primary);
      display: block;
      margin-bottom: 2px;
    }
    .info-text-block p {
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
      .setting-row {
        flex-direction: column;
        align-items: flex-start;
        gap: var(--space-2-5);
      }
      .card-footer .btn {
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
