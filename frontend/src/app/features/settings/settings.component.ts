import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { TelegramService } from '../../core/services/telegram.service';
import { CandidateProfile } from '../../core/models/job.model';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="settings-view">
      <header class="settings-header">
        <h1>⚙️ System Settings & Daily Schedule</h1>
        <p class="subtitle">Configure delivery schedule and digest matching thresholds.</p>
      </header>

      <div *ngIf="savedNotice()" class="alert success-alert">
        <span>✅ Settings saved successfully!</span>
        <button (click)="savedNotice.set(false)" class="close-alert">&times;</button>
      </div>

      <div class="settings-card">
        <h2>Schedule & Delivery Preferences</h2>

        <div class="setting-item">
          <div class="item-info">
            <strong>Daily Telegram Digest</strong>
            <p>Send a curated summary of eligible new matches once every morning.</p>
          </div>
          <div class="item-control">
            <button
              (click)="toggleDigest()"
              class="btn"
              [class.active-btn]="digestEnabled()"
              [class.paused-btn]="!digestEnabled()"
            >
              {{ digestEnabled() ? '✅ Active' : '⏸️ Paused' }}
            </button>
          </div>
        </div>

        <div class="setting-item">
          <div class="item-info">
            <strong>Digest Dispatch Time</strong>
            <p>Scheduled daily execution time in Cairo timezone.</p>
          </div>
          <div class="item-control">
            <input type="text" [(ngModel)]="digestTime" class="input-control time-input" />
            <small class="tz-label">Africa/Cairo</small>
          </div>
        </div>

        <div class="setting-item">
          <div class="item-info">
            <strong>Minimum Match Score Threshold</strong>
            <p>Jobs scored below this threshold are stored but excluded from the morning digest.</p>
          </div>
          <div class="item-control">
            <input type="number" [(ngModel)]="digestThreshold" min="50" max="95" class="input-control num-input" />
            <span class="unit-label">/ 100</span>
          </div>
        </div>

        <div class="settings-actions">
          <button (click)="saveSettings()" [disabled]="isSaving()" class="btn primary-btn full-mobile">
            {{ isSaving() ? 'Saving...' : 'Save Configuration' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .settings-view { display: flex; flex-direction: column; gap: 16px; max-width: 800px; width: 100%; box-sizing: border-box; }
    .settings-header h1 { margin: 0 0 4px 0; font-size: 1.45rem; color: #0f172a; font-weight: 700; }
    .subtitle { margin: 0; color: #64748b; font-size: 0.9rem; line-height: 1.4; }

    .alert { padding: 12px 16px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; }
    .success-alert { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; font-weight: 500; }
    .close-alert { background: none; border: none; font-size: 1.2rem; cursor: pointer; color: inherit; }

    .settings-card {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 20px;
      box-sizing: border-box;
      box-shadow: 0 1px 2px rgba(0,0,0,0.02);
    }
    .settings-card h2 { margin: 0 0 16px 0; font-size: 1.15rem; color: #0f172a; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px; font-weight: 600; }

    .setting-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 0;
      border-bottom: 1px solid #f1f5f9;
      gap: 16px;
    }
    .item-info strong { display: block; font-size: 0.92rem; color: #1e293b; margin-bottom: 4px; }
    .item-info p { margin: 0; font-size: 0.82rem; color: #64748b; line-height: 1.35; }

    .item-control { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
    .input-control {
      padding: 8px 12px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 0.9rem;
      box-sizing: border-box;
    }
    .time-input { width: 90px; text-align: center; }
    .num-input { width: 80px; text-align: center; }
    .tz-label, .unit-label { font-size: 0.82rem; color: #64748b; }

    .btn { padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; border: none; font-size: 0.88rem; transition: background 0.15s; }
    .primary-btn { background: #2563eb; color: #fff; margin-top: 16px; }
    .primary-btn:hover:not(:disabled) { background: #1d4ed8; }
    .primary-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .active-btn { background: #dcfce7; color: #166534; }
    .paused-btn { background: #fee2e2; color: #991b1b; }

    /* Mobile & Telegram Mini App Optimizations (<= 768px) */
    @media (max-width: 768px) {
      .settings-header h1 { font-size: 1.3rem; }
      .settings-card { padding: 16px; }
      .setting-item {
        flex-direction: column;
        align-items: flex-start;
        gap: 10px;
        padding: 12px 0;
      }
      .item-control {
        width: 100%;
        justify-content: flex-start;
      }
      .primary-btn.full-mobile {
        width: 100%;
        text-align: center;
        padding: 12px;
      }
    }
  `],
})
export class SettingsComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly telegram = inject(TelegramService);

  digestEnabled = signal<boolean>(true);
  isSaving = signal<boolean>(false);
  savedNotice = signal<boolean>(false);
  digestTime: string = '09:00';
  digestThreshold: number = 70;

  ngOnInit(): void {
    this.api.getProfile().subscribe({
      next: (p) => {
        this.digestEnabled.set(p.digest_enabled);
        this.digestTime = p.digest_time || '09:00';
        this.digestThreshold = p.digest_threshold || 70;
      },
    });
  }

  toggleDigest(): void {
    this.telegram.haptic('selection');
    this.digestEnabled.update((val) => !val);
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
          this.savedNotice.set(true);
          this.telegram.haptic('success');
          setTimeout(() => this.savedNotice.set(false), 4000);
        },
        error: () => {
          this.isSaving.set(false);
        },
      });
  }
}
