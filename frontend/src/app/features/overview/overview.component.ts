import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { CandidateProfile, DailyRunRecord, JobSummary, SourceInfo } from '../../core/models/job.model';

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="overview-container">
      <!-- Candidate Hero Banner -->
      <section class="hero-banner">
        <div class="hero-content">
          <h1>🎯 Job Hunter Agent</h1>
          <p class="hero-subtitle">
            Personal job discovery and matching for <strong>Software Engineering & Web Development</strong>.
          </p>
          <div class="hero-tags">
            <span class="badge priority">Priority: Angular / Frontend</span>
            <span class="badge location">Base: Egypt (EG) 🇪🇬</span>
            <span class="badge schedule">Daily Digest: 09:00 Africa/Cairo</span>
          </div>
        </div>
        <div class="hero-actions">
          <button (click)="triggerSync()" [disabled]="isTriggering()" class="btn primary-btn">
            {{ isTriggering() ? '⏳ Running Pipeline...' : '⚡ Trigger Discovery Run' }}
          </button>
        </div>
      </section>

      <!-- KPI Metrics -->
      <section class="metrics-grid">
        <div class="metric-card">
          <span class="metric-icon">💼</span>
          <div class="metric-info">
            <span class="metric-label">Discovered Jobs</span>
            <span class="metric-value">{{ totalJobs() }}</span>
          </div>
        </div>
        <div class="metric-card">
          <span class="metric-icon">⭐</span>
          <div class="metric-info">
            <span class="metric-label">Saved Opportunities</span>
            <span class="metric-value">{{ savedCount() }}</span>
          </div>
        </div>
        <div class="metric-card">
          <span class="metric-icon">📝</span>
          <div class="metric-info">
            <span class="metric-label">Applied Tracked</span>
            <span class="metric-value">{{ appliedCount() }}</span>
          </div>
        </div>
        <div class="metric-card">
          <span class="metric-icon">🔄</span>
          <div class="metric-info">
            <span class="metric-label">Last Run Status</span>
            <span class="metric-value status" [class.success]="lastRun()?.status === 'COMPLETED'">
              {{ lastRun()?.status || 'IDLE' }}
            </span>
          </div>
        </div>
      </section>

      <!-- Sources Health & Latest Top Matches -->
      <div class="content-split">
        <!-- Top Matches Section -->
        <section class="panel top-matches">
          <div class="panel-header">
            <h2>🔥 Top Eligible Opportunities (Score ≥ 70)</h2>
            <a routerLink="/jobs" class="view-all-link">Explore all jobs →</a>
          </div>

          <div *ngIf="topJobs().length === 0" class="empty-state">
            <p>No high-scoring matches discovered yet. Click "Trigger Discovery Run" to ingest live postings.</p>
          </div>

          <div class="jobs-list" *ngIf="topJobs().length > 0">
            <div *ngFor="let job of topJobs()" class="job-mini-card">
              <div class="job-mini-header">
                <h3>{{ job.title }}</h3>
                <span class="score-badge" [class.excellent]="job.match_score >= 85">
                  {{ job.match_score }} / 100
                </span>
              </div>
              <p class="company-loc">🏢 {{ job.company }} • 🌍 {{ job.raw_location || 'Remote' }}</p>
              <div class="tags-row">
                <span class="tag eligibility">{{ job.eligibility }}</span>
                <span class="tag seniority">{{ job.seniority }}</span>
                <span class="tag source">{{ job.source_name }}</span>
              </div>
              <div class="card-footer">
                <a [href]="job.original_application_url" target="_blank" rel="noopener" class="btn small-btn">
                  Apply Link ↗
                </a>
              </div>
            </div>
          </div>
        </section>

        <!-- Sources Status Section -->
        <section class="panel sources-panel">
          <div class="panel-header">
            <h2>🔌 Connected Sources & Health</h2>
          </div>
          <div class="sources-list">
            <div *ngFor="let s of sources()" class="source-item">
              <div class="source-header">
                <strong>{{ s.name }}</strong>
                <span class="status-indicator" [class.active]="s.is_enabled">
                  {{ s.is_enabled ? 'Active' : 'Disabled' }}
                </span>
              </div>
              <p class="source-meta">
                <small>{{ s.attribution }}</small>
              </p>
              <div class="sync-status">
                <span>Last Sync: {{ s.last_sync_at ? (s.last_sync_at | date:'short') : 'Pending' }}</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  `,
  styles: [`
    .overview-container { display: flex; flex-direction: column; gap: 24px; }
    .hero-banner {
      background: linear-gradient(135deg, #1e293b, #0f172a);
      color: #fff;
      border-radius: 12px;
      padding: 28px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    .hero-banner h1 { margin: 0 0 8px 0; font-size: 1.75rem; }
    .hero-subtitle { margin: 0 0 16px 0; color: #94a3b8; font-size: 1rem; }
    .hero-tags { display: flex; gap: 10px; flex-wrap: wrap; }
    .badge {
      font-size: 0.8rem;
      padding: 4px 10px;
      border-radius: 20px;
      font-weight: 500;
    }
    .badge.priority { background: #3b82f6; color: #fff; }
    .badge.location { background: #10b981; color: #fff; }
    .badge.schedule { background: #8b5cf6; color: #fff; }

    .primary-btn {
      background: #2563eb;
      color: #fff;
      padding: 10px 20px;
      border: none;
      border-radius: 8px;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    .primary-btn:hover:not(:disabled) { background: #1d4ed8; }
    .primary-btn:disabled { opacity: 0.6; cursor: not-allowed; }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
    }
    .metric-card {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 18px;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .metric-icon { font-size: 2rem; }
    .metric-info { display: flex; flex-direction: column; }
    .metric-label { font-size: 0.85rem; color: #64748b; font-weight: 500; }
    .metric-value { font-size: 1.4rem; font-weight: 700; color: #1e293b; }
    .metric-value.status { font-size: 1rem; text-transform: uppercase; }
    .metric-value.status.success { color: #10b981; }

    .content-split {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 24px;
    }
    @media (max-width: 900px) {
      .content-split { grid-template-columns: 1fr; }
    }
    .panel {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 20px;
    }
    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      border-bottom: 1px solid #f1f5f9;
      padding-bottom: 12px;
    }
    .panel-header h2 { font-size: 1.15rem; margin: 0; color: #0f172a; }
    .view-all-link { color: #2563eb; text-decoration: none; font-size: 0.9rem; font-weight: 500; }

    .job-mini-card {
      border: 1px solid #f1f5f9;
      background: #f8fafc;
      border-radius: 8px;
      padding: 14px;
      margin-bottom: 12px;
    }
    .job-mini-header { display: flex; justify-content: space-between; align-items: flex-start; }
    .job-mini-header h3 { margin: 0 0 6px 0; font-size: 1rem; color: #1e293b; }
    .score-badge {
      background: #e2e8f0;
      color: #334155;
      padding: 3px 8px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 0.85rem;
    }
    .score-badge.excellent { background: #dcfce7; color: #166534; }
    .company-loc { margin: 0 0 10px 0; font-size: 0.85rem; color: #64748b; }
    .tags-row { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
    .tag { font-size: 0.75rem; padding: 2px 6px; border-radius: 4px; background: #e2e8f0; color: #475569; }
    .tag.eligibility { background: #dbeafe; color: #1e40af; }
    .small-btn {
      display: inline-block;
      font-size: 0.8rem;
      padding: 5px 12px;
      background: #fff;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      color: #1e293b;
      text-decoration: none;
      font-weight: 500;
    }
    .small-btn:hover { background: #f1f5f9; }

    .source-item {
      padding: 12px 0;
      border-bottom: 1px solid #f1f5f9;
    }
    .source-item:last-child { border-bottom: none; }
    .source-header { display: flex; justify-content: space-between; align-items: center; }
    .status-indicator { font-size: 0.75rem; padding: 2px 6px; border-radius: 4px; background: #f1f5f9; }
    .status-indicator.active { background: #dcfce7; color: #15803d; }
    .source-meta { margin: 4px 0; color: #64748b; }
    .sync-status { font-size: 0.75rem; color: #94a3b8; }
  `],
})
export class OverviewComponent implements OnInit {
  private readonly api = inject(ApiService);

  totalJobs = signal<number>(0);
  savedCount = signal<number>(0);
  appliedCount = signal<number>(0);
  lastRun = signal<DailyRunRecord | null>(null);
  topJobs = signal<JobSummary[]>([]);
  sources = signal<SourceInfo[]>([]);
  isTriggering = signal<boolean>(false);

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.api.getJobs({ limit: 5, min_score: 70 }).subscribe({
      next: (res) => {
        this.totalJobs.set(res.total);
        this.topJobs.set(res.items);
      },
    });

    this.api.getTrackedJobs().subscribe({
      next: (items) => {
        this.savedCount.set(items.filter((i) => i.status === 'SAVED').length);
        this.appliedCount.set(items.filter((i) => i.status === 'APPLIED').length);
      },
    });

    this.api.getRuns().subscribe({
      next: (runs) => {
        if (runs.length > 0) {
          this.lastRun.set(runs[0]);
        }
      },
    });

    this.api.getSources().subscribe({
      next: (s) => this.sources.set(s),
    });
  }

  triggerSync(): void {
    this.isTriggering.set(true);
    this.api.triggerRun(true).subscribe({
      next: () => {
        this.isTriggering.set(false);
        this.loadData();
      },
      error: () => this.isTriggering.set(false),
    });
  }
}
