import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ApplicationStatus, TrackedJobItem } from '../../core/models/job.model';

@Component({
  selector: 'app-tracker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="tracker-view">
      <header class="tracker-header">
        <div>
          <h1>📌 Application Tracker</h1>
          <p class="subtitle">Track opportunities without ever submitting automatic applications.</p>
        </div>
      </header>

      <!-- Status Tabs -->
      <nav class="status-tabs">
        <button
          *ngFor="let tab of tabs"
          (click)="selectTab(tab.status)"
          [class.active]="selectedStatus() === tab.status"
          class="tab-btn"
        >
          {{ tab.label }}
        </button>
      </nav>

      <!-- Tracked Jobs List -->
      <div class="tracked-list">
        <div *ngIf="items().length === 0" class="empty-state">
          <p>No jobs currently in this stage.</p>
        </div>

        <div *ngFor="let item of items()" class="tracked-item">
          <div class="item-main">
            <h3>{{ item.title }}</h3>
            <p class="company-sub">🏢 {{ item.company }}</p>
            <div class="meta-row">
              <span class="score-badge">Match: {{ item.match_score }}/100</span>
              <span *ngIf="item.applied_at" class="applied-date">
                🗓️ Applied on: {{ item.applied_at | date:'yyyy-MM-dd' }}
              </span>
            </div>
          </div>

          <div class="item-actions">
            <select
              [ngModel]="item.status"
              (ngModelChange)="onStatusChange(item.job_id, $event)"
              class="status-select"
            >
              <option value="SAVED">⭐ Saved</option>
              <option value="INTERESTED">💡 Interested</option>
              <option value="APPLIED">✅ Applied</option>
              <option value="INTERVIEW">🎙️ Interview</option>
              <option value="OFFER">🎉 Offer</option>
              <option value="REJECTED">❌ Rejected</option>
              <option value="ARCHIVED">📦 Archived</option>
            </select>

            <a [href]="item.original_application_url" target="_blank" rel="noopener" class="btn open-link-btn">
              Apply URL ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .tracker-view { display: flex; flex-direction: column; gap: 20px; }
    .tracker-header h1 { margin: 0 0 4px 0; font-size: 1.5rem; color: #0f172a; }
    .subtitle { margin: 0; color: #64748b; font-size: 0.95rem; }

    .status-tabs {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 8px;
    }
    .tab-btn {
      background: none;
      border: 1px solid transparent;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 0.85rem;
      font-weight: 500;
      color: #64748b;
      cursor: pointer;
    }
    .tab-btn:hover { background: #f1f5f9; }
    .tab-btn.active {
      background: #eff6ff;
      border-color: #bfdbfe;
      color: #1d4ed8;
      font-weight: 600;
    }

    .tracked-list { display: flex; flex-direction: column; gap: 12px; }
    .empty-state {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 32px;
      text-align: center;
      color: #94a3b8;
    }
    .tracked-item {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }
    @media (max-width: 600px) {
      .tracked-item { flex-direction: column; align-items: flex-start; }
    }
    .item-main h3 { margin: 0 0 4px 0; font-size: 1rem; color: #1e293b; }
    .company-sub { margin: 0 0 8px 0; font-size: 0.85rem; color: #64748b; }
    .meta-row { display: flex; gap: 12px; align-items: center; }
    .score-badge { font-size: 0.8rem; background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
    .applied-date { font-size: 0.8rem; color: #10b981; }

    .item-actions { display: flex; gap: 10px; align-items: center; }
    .status-select {
      padding: 6px 12px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 0.85rem;
      background: #fff;
    }
    .open-link-btn {
      background: #2563eb;
      color: #fff;
      padding: 6px 14px;
      border-radius: 6px;
      text-decoration: none;
      font-size: 0.85rem;
      font-weight: 500;
    }
  `],
})
export class TrackerComponent implements OnInit {
  private readonly api = inject(ApiService);

  selectedStatus = signal<ApplicationStatus | undefined>(undefined);
  items = signal<TrackedJobItem[]>([]);

  tabs = [
    { label: 'All Tracked', status: undefined },
    { label: '⭐ Saved', status: 'SAVED' as ApplicationStatus },
    { label: '💡 Interested', status: 'INTERESTED' as ApplicationStatus },
    { label: '✅ Applied', status: 'APPLIED' as ApplicationStatus },
    { label: '🎙️ Interview', status: 'INTERVIEW' as ApplicationStatus },
    { label: '🎉 Offer', status: 'OFFER' as ApplicationStatus },
    { label: '❌ Rejected', status: 'REJECTED' as ApplicationStatus },
  ];

  ngOnInit(): void {
    this.loadTracked();
  }

  selectTab(status?: ApplicationStatus): void {
    this.selectedStatus.set(status);
    this.loadTracked();
  }

  loadTracked(): void {
    this.api.getTrackedJobs(this.selectedStatus()).subscribe({
      next: (data) => this.items.set(data),
    });
  }

  onStatusChange(jobId: number, newStatus: ApplicationStatus): void {
    this.api.updateJobStatus(jobId, newStatus).subscribe({
      next: () => this.loadTracked(),
    });
  }
}
