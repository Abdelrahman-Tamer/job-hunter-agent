import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { TelegramService } from '../../core/services/telegram.service';
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
          <h1>Settings</h1>
          <p class="subtitle">Notification preferences, match thresholds, and automation settings</p>
        </div>
      </header>

      <!-- Alert -->
      <div *ngIf="savedNotice()" class="alert-box" role="status">
        <app-icon name="check-circle" [size]="16" class="alert-icon"></app-icon>
        <span class="alert-text">Settings saved successfully!</span>
        <button (click)="savedNotice.set(false)" class="alert-close" aria-label="Dismiss">
          <app-icon name="x" [size]="14"></app-icon>
        </button>
      </div>

      <div class="settings-stack">
        <!-- Delivery Preferences -->
        <section class="panel settings-card" aria-labelledby="delivery-title">
          <div class="panel-header">
            <div class="panel-title-wrap">
              <app-icon name="bell" [size]="18" class="panel-icon-accent"></app-icon>
              <h2 id="delivery-title">Digest & Delivery Schedule</h2>
            </div>
          </div>

          <div class="setting-row">
            <div class="row-info">
              <strong>Daily Telegram Digest</strong>
              <p>Send a curated summary of eligible matches to your Telegram chat every morning.</p>
            </div>
            <div class="row-action">
              <button
                (click)="toggleDigest()"
                class="btn btn-sm"
                [class.btn-primary]="digestEnabled()"
                [class.btn-secondary]="!digestEnabled()"
              >
                <app-icon [name]="digestEnabled() ? 'check' : 'clock'" [size]="13"></app-icon>
                <span>{{ digestEnabled() ? 'Active' : 'Paused' }}</span>
              </button>
            </div>
          </div>

          <div class="setting-row">
            <div class="row-info">
              <strong>Dispatch Time</strong>
              <p>Scheduled daily execution time in Cairo timezone.</p>
            </div>
            <div class="row-action">
              <div class="time-input-group">
                <input type="text" [(ngModel)]="digestTime" class="form-input time-input" aria-label="Digest time" />
                <span class="tz-badge">Africa/Cairo</span>
              </div>
            </div>
          </div>

          <div class="setting-row">
            <div class="row-info">
              <strong>Minimum Match Score for Digest</strong>
              <p>Jobs scored below this threshold are saved in feed but omitted from morning digest.</p>
            </div>
            <div class="row-action">
              <div class="score-input-group">
                <input type="number" [(ngModel)]="digestThreshold" min="50" max="95" class="form-input score-input" aria-label="Threshold" />
                <span class="unit-text">%</span>
              </div>
            </div>
          </div>

          <div class="card-footer">
            <button (click)="saveSettings()" [disabled]="isSaving()" class="btn btn-primary">
              <app-icon [name]="isSaving() ? 'refresh' : 'check'" [size]="14" [class.spin]="isSaving()"></app-icon>
              <span>{{ isSaving() ? 'Saving...' : 'Save Settings' }}</span>
            </button>
          </div>
        </section>

        <!-- Privacy & Safety Info -->
        <section class="panel settings-card" aria-labelledby="privacy-title">
          <div class="panel-header">
            <div class="panel-title-wrap">
              <app-icon name="alert-circle" [size]="18" class="panel-icon-accent"></app-icon>
              <h2 id="privacy-title">Privacy & Safety Guardrails</h2>
            </div>
          </div>

          <div class="info-list">
            <div class="info-item">
              <app-icon name="check-circle" [size]="15" class="icon-check"></app-icon>
              <div>
                <strong>Zero Auto-Submit</strong>
                <p>The agent never submits applications on your behalf without your explicit review and direct application link.</p>
              </div>
            </div>

            <div class="info-item">
              <app-icon name="check-circle" [size]="15" class="icon-check"></app-icon>
              <div>
                <strong>Local CV Processing</strong>
                <p>CV documents are processed locally on your machine with strict PII sanitization.</p>
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

    /* Alert */
    .alert-box {
      display: flex;
      align-items: center;
      gap: var(--space-2-5);
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-md);
      background-color: var(--color-success-bg);
      border: 1px solid var(--color-success-border);
      color: var(--color-success-text);
      font-size: var(--text-sm);
    }
    .alert-icon {
      color: var(--color-success-text);
    }
    .alert-text {
      flex: 1;
    }
    .alert-close {
      background: transparent;
      border: none;
      color: var(--color-success-text);
      cursor: pointer;
      display: flex;
      align-items: center;
    }

    .settings-stack {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      max-width: 800px;
    }

    .panel-header {
      border-bottom: 1px solid var(--color-border-subtle);
      padding-bottom: var(--space-3);
      margin-bottom: var(--space-3-5);
    }
    .panel-title-wrap {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .panel-title-wrap h2 {
      font-size: var(--text-base);
      font-weight: 600;
      margin: 0;
    }
    .panel-icon-accent {
      color: var(--color-brand-accent);
    }

    .setting-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--space-3-5) 0;
      border-bottom: 1px solid var(--color-border-subtle);
      gap: var(--space-4);
    }
    .setting-row:last-of-type {
      border-bottom: none;
    }
    .row-info {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .row-info strong {
      font-size: var(--text-sm);
      color: var(--color-text-primary);
    }
    .row-info p {
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
      margin: 0;
    }
    .row-action {
      flex-shrink: 0;
    }

    .time-input-group, .score-input-group {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .time-input {
      width: 90px;
      text-align: center;
      font-family: var(--font-mono);
      font-size: var(--text-xs);
    }
    .score-input {
      width: 70px;
      text-align: center;
      font-family: var(--font-mono);
      font-size: var(--text-xs);
    }
    .tz-badge {
      font-size: var(--text-2xs);
      color: var(--color-text-muted);
      font-family: var(--font-mono);
      background: var(--color-bg-surface-elevated);
      padding: 3px 7px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--color-border-subtle);
    }
    .unit-text {
      font-size: var(--text-xs);
      color: var(--color-text-muted);
      font-family: var(--font-mono);
    }

    .card-footer {
      display: flex;
      justify-content: flex-end;
      padding-top: var(--space-4);
      border-top: 1px solid var(--color-border-subtle);
      margin-top: var(--space-2);
    }

    /* Info list */
    .info-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .info-item {
      display: flex;
      align-items: flex-start;
      gap: var(--space-2-5);
    }
    .icon-check {
      color: var(--color-success-text);
      margin-top: 2px;
      flex-shrink: 0;
    }
    .info-item strong {
      font-size: var(--text-xs);
      color: var(--color-text-primary);
      display: block;
      margin-bottom: 2px;
    }
    .info-item p {
      font-size: var(--text-2xs);
      color: var(--color-text-secondary);
      margin: 0;
      line-height: 1.45;
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
        gap: var(--space-2);
      }
      .card-footer .btn {
        width: 100%;
      }
    }
  `],
})
export class SettingsComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly telegram = inject(TelegramService);

  profile = signal<CandidateProfile | null>(null);
  digestEnabled = signal<boolean>(true);
  digestTime: string = '09:00';
  digestThreshold: number = 70;
  isSaving = signal<boolean>(false);
  savedNotice = signal<boolean>(false);

  ngOnInit(): void {
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
    this.digestEnabled.update((val) => !val);
  }

  saveSettings(): void {
    this.telegram.haptic('medium');
    this.isSaving.set(true);

    this.api
      .updateProfile({
        digest_enabled: this.digestEnabled(),
        digest_time: this.digestTime,
        digest_threshold: this.digestThreshold,
      })
      .subscribe({
        next: () => {
          this.isSaving.set(false);
          this.savedNotice.set(true);
          this.telegram.haptic('success');
          setTimeout(() => this.savedNotice.set(false), 3000);
        },
        error: () => {
          this.isSaving.set(false);
          this.telegram.haptic('error');
        },
      });
  }
}
