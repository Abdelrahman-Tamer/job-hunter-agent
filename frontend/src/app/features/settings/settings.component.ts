import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
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
          <button (click)="saveSettings()" class="btn primary-btn">Save Configuration</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .settings-view { display: flex; flex-direction: column; gap: 20px; max-width: 800px; }
    .settings-header h1 { margin: 0 0 4px 0; font-size: 1.5rem; color: #0f172a; }
    .subtitle { margin: 0; color: #64748b; font-size: 0.95rem; }

    .settings-card {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 24px;
    }
    .settings-card h2 { margin: 0 0 20px 0; font-size: 1.2rem; color: #0f172a; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px; }

    .setting-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 0;
      border-bottom: 1px solid #f1f5f9;
      gap: 16px;
    }
    .item-info strong { display: block; font-size: 0.95rem; color: #1e293b; margin-bottom: 4px; }
    .item-info p { margin: 0; font-size: 0.85rem; color: #64748b; }

    .item-control { display: flex; align-items: center; gap: 8px; }
    .input-control {
      padding: 8px 12px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 0.9rem;
    }
    .time-input { width: 90px; text-align: center; }
    .num-input { width: 80px; text-align: center; }
    .tz-label, .unit-label { font-size: 0.85rem; color: #64748b; }

    .btn { padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; border: none; font-size: 0.9rem; }
    .primary-btn { background: #2563eb; color: #fff; margin-top: 20px; }
    .active-btn { background: #dcfce7; color: #166534; }
    .paused-btn { background: #fee2e2; color: #991b1b; }
  `],
})
export class SettingsComponent implements OnInit {
  private readonly api = inject(ApiService);

  digestEnabled = signal<boolean>(true);
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
    this.digestEnabled.update((val) => !val);
  }

  saveSettings(): void {
    this.api
      .updateProfile({
        digest_enabled: this.digestEnabled(),
        digest_time: this.digestTime,
        digest_threshold: this.digestThreshold,
      })
      .subscribe({
        next: () => alert('Settings saved successfully!'),
      });
  }
}
