import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { TelegramService } from '../../core/services/telegram.service';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent } from '../../core/components/icon/icon.component';
import { JobDrawerComponent } from '../../core/components/job-drawer/job-drawer.component';
import { ApplicationStatus, TrackedJobItem, JobSummary } from '../../core/models/job.model';

interface StatusTab {
  status: string;
  label: string;
}

@Component({
  selector: 'app-tracker',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IconComponent, JobDrawerComponent],
  template: `
    <div class="tracker-view">
      <!-- Executive Tracker Header -->
      <header class="tracker-header">
        <div class="header-text-block">
          <h1>Application Pipeline</h1>
          <p class="subtitle">Organize and advance your job opportunities across every stage of the hiring journey</p>
        </div>

        <div class="view-mode-toggle" role="group" aria-label="Tracker view mode">
          <button
            (click)="setViewMode('kanban')"
            [class.active]="viewMode() === 'kanban'"
            class="toggle-mode-btn"
          >
            <app-icon name="grid" [size]="14"></app-icon>
            <span>Kanban Board</span>
          </button>
          <button
            (click)="setViewMode('tabs')"
            [class.active]="viewMode() === 'tabs'"
            class="toggle-mode-btn"
          >
            <app-icon name="list" [size]="14"></app-icon>
            <span>Stage View</span>
          </button>
        </div>
      </header>

      <!-- Funnel Metrics Velocity Banner -->
      <section class="funnel-metrics-banner" aria-label="Pipeline metrics">
        <div class="funnel-metric">
          <span class="funnel-label">Total Tracked</span>
          <span class="funnel-value">{{ allItems().length }}</span>
        </div>
        <div class="funnel-divider">→</div>
        <div class="funnel-metric">
          <span class="funnel-label">Saved</span>
          <span class="funnel-value text-amber">{{ getCountForStatus('SAVED') }}</span>
        </div>
        <div class="funnel-divider">→</div>
        <div class="funnel-metric">
          <span class="funnel-label">Applied</span>
          <span class="funnel-value text-blue">{{ getCountForStatus('APPLIED') }}</span>
        </div>
        <div class="funnel-divider">→</div>
        <div class="funnel-metric">
          <span class="funnel-label">Interviews</span>
          <span class="funnel-value text-purple">{{ getCountForStatus('INTERVIEW') }}</span>
        </div>
        <div class="funnel-divider">→</div>
        <div class="funnel-metric">
          <span class="funnel-label">Offers</span>
          <span class="funnel-value text-green">{{ getCountForStatus('OFFER') }}</span>
        </div>
      </section>

      <!-- VIEW MODE 1: KANBAN BOARD -->
      <section class="kanban-board-container" *ngIf="viewMode() === 'kanban'" aria-label="Kanban application board">
        <div class="kanban-columns-track">
          <!-- Column: Saved -->
          <div class="kanban-column">
            <div class="kanban-col-header col-saved">
              <div class="col-title-wrap">
                <span class="col-dot"></span>
                <h3>Saved</h3>
              </div>
              <span class="col-count">{{ getCountForStatus('SAVED') }}</span>
            </div>

            <div class="kanban-cards-stack">
              <div *ngIf="getItemsForStage('SAVED').length === 0" class="empty-col-placeholder">
                <p>No saved roles.</p>
              </div>

              <article
                *ngFor="let item of getItemsForStage('SAVED')"
                class="kanban-card"
                (click)="inspectTracked(item)"
                tabindex="0"
                (keyup.enter)="inspectTracked(item)"
              >
                <div class="kanban-card-top">
                  <span class="company-avatar">{{ item.company.charAt(0) }}</span>
                  <span class="kanban-score">{{ roundScore(item.match_score) }}%</span>
                </div>
                <h4 class="kanban-card-title">{{ item.title }}</h4>
                <span class="kanban-company-text">{{ item.company }}</span>

                <div class="kanban-card-actions" (click)="$event.stopPropagation()">
                  <button (click)="advanceStatus(item, 'APPLIED')" class="btn btn-secondary btn-sm btn-advance">
                    <span>Move to Applied</span>
                    <app-icon name="arrow-right" [size]="12"></app-icon>
                  </button>
                </div>
              </article>
            </div>
          </div>

          <!-- Column: Applied -->
          <div class="kanban-column">
            <div class="kanban-col-header col-applied">
              <div class="col-title-wrap">
                <span class="col-dot"></span>
                <h3>Applied</h3>
              </div>
              <span class="col-count">{{ getCountForStatus('APPLIED') }}</span>
            </div>

            <div class="kanban-cards-stack">
              <div *ngIf="getItemsForStage('APPLIED').length === 0" class="empty-col-placeholder">
                <p>No submitted applications yet.</p>
              </div>

              <article
                *ngFor="let item of getItemsForStage('APPLIED')"
                class="kanban-card"
                (click)="inspectTracked(item)"
                tabindex="0"
                (keyup.enter)="inspectTracked(item)"
              >
                <div class="kanban-card-top">
                  <span class="company-avatar">{{ item.company.charAt(0) }}</span>
                  <span class="kanban-score">{{ roundScore(item.match_score) }}%</span>
                </div>
                <h4 class="kanban-card-title">{{ item.title }}</h4>
                <span class="kanban-company-text">{{ item.company }}</span>

                <div class="kanban-card-actions" (click)="$event.stopPropagation()">
                  <button (click)="advanceStatus(item, 'INTERVIEW')" class="btn btn-secondary btn-sm btn-advance">
                    <span>Set Interview</span>
                    <app-icon name="arrow-right" [size]="12"></app-icon>
                  </button>
                </div>
              </article>
            </div>
          </div>

          <!-- Column: Interview -->
          <div class="kanban-column">
            <div class="kanban-col-header col-interview">
              <div class="col-title-wrap">
                <span class="col-dot"></span>
                <h3>Interview</h3>
              </div>
              <span class="col-count">{{ getCountForStatus('INTERVIEW') }}</span>
            </div>

            <div class="kanban-cards-stack">
              <div *ngIf="getItemsForStage('INTERVIEW').length === 0" class="empty-col-placeholder">
                <p>No active interviews scheduled.</p>
              </div>

              <article
                *ngFor="let item of getItemsForStage('INTERVIEW')"
                class="kanban-card"
                (click)="inspectTracked(item)"
                tabindex="0"
                (keyup.enter)="inspectTracked(item)"
              >
                <div class="kanban-card-top">
                  <span class="company-avatar">{{ item.company.charAt(0) }}</span>
                  <span class="kanban-score text-green">{{ roundScore(item.match_score) }}%</span>
                </div>
                <h4 class="kanban-card-title">{{ item.title }}</h4>
                <span class="kanban-company-text">{{ item.company }}</span>

                <div class="kanban-card-actions" (click)="$event.stopPropagation()">
                  <button (click)="advanceStatus(item, 'OFFER')" class="btn btn-primary btn-sm btn-advance">
                    <span>Received Offer!</span>
                    <app-icon name="sparkles" [size]="12"></app-icon>
                  </button>
                </div>
              </article>
            </div>
          </div>

          <!-- Column: Offer -->
          <div class="kanban-column">
            <div class="kanban-col-header col-offer">
              <div class="col-title-wrap">
                <span class="col-dot"></span>
                <h3>Offer</h3>
              </div>
              <span class="col-count">{{ getCountForStatus('OFFER') }}</span>
            </div>

            <div class="kanban-cards-stack">
              <div *ngIf="getItemsForStage('OFFER').length === 0" class="empty-col-placeholder">
                <p>Keep applying to earn offers.</p>
              </div>

              <article
                *ngFor="let item of getItemsForStage('OFFER')"
                class="kanban-card offer-card"
                (click)="inspectTracked(item)"
                tabindex="0"
                (keyup.enter)="inspectTracked(item)"
              >
                <div class="kanban-card-top">
                  <span class="company-avatar">{{ item.company.charAt(0) }}</span>
                  <span class="score-pill score-top">Offer! 🎉</span>
                </div>
                <h4 class="kanban-card-title">{{ item.title }}</h4>
                <span class="kanban-company-text">{{ item.company }}</span>
              </article>
            </div>
          </div>
        </div>
      </section>

      <!-- VIEW MODE 2: TABBED STAGE VIEW -->
      <section class="tabbed-view-section" *ngIf="viewMode() === 'tabs'" aria-label="Tabbed stage view">
        <!-- Horizontal Tabs -->
        <nav class="status-tabs-container" aria-label="Application stages">
          <div class="tabs-scroll">
            <button
              *ngFor="let tab of tabs"
              (click)="selectTab(tab.status)"
              [class.active]="selectedStatus() === tab.status"
              class="tab-btn"
            >
              <span>{{ tab.label }}</span>
              <span class="tab-count" *ngIf="getCountForStatus(tab.status) as c">{{ c }}</span>
            </button>
          </div>
        </nav>

        <!-- Tracked Jobs List -->
        <section class="tracked-list" aria-label="Tracked applications">
          <div *ngIf="filteredItems().length === 0" class="empty-state card">
            <app-icon name="bookmark" [size]="36" class="empty-icon"></app-icon>
            <h3>No opportunities in this stage</h3>
            <p>Bookmark or mark roles as applied from the Jobs feed to organize them here.</p>
            <a routerLink="/jobs" class="btn btn-primary btn-sm">
              <span>Discover Jobs</span>
              <app-icon name="arrow-right" [size]="14"></app-icon>
            </a>
          </div>

          <div class="items-grid" *ngIf="filteredItems().length > 0">
            <article
              *ngFor="let item of filteredItems()"
              class="tracked-card"
              (click)="inspectTracked(item)"
              tabindex="0"
              (keyup.enter)="inspectTracked(item)"
            >
              <div class="item-main">
                <div class="item-meta-top">
                  <div class="company-row">
                    <span class="company-avatar">{{ item.company.charAt(0) }}</span>
                    <span class="company-name">{{ item.company }}</span>
                  </div>
                  <span class="match-score">
                    {{ roundScore(item.match_score) }}% match
                  </span>
                </div>

                <h3 class="item-title">{{ item.title }}</h3>

                <div class="meta-bottom-row">
                  <span class="status-stage-pill" [attr.data-status]="item.status">
                    <span class="stage-dot"></span>
                    {{ formatStatus(item.status) }}
                  </span>
                  <span class="date-text" *ngIf="item.applied_at">
                    <app-icon name="calendar" [size]="12"></app-icon>
                    Applied: {{ item.applied_at | date:'mediumDate' }}
                  </span>
                </div>
              </div>

              <div class="item-controls" (click)="$event.stopPropagation()">
                <div class="status-select-wrap">
                  <select
                    [ngModel]="item.status"
                    (ngModelChange)="onStatusChange(item.job_id, $event)"
                    class="form-select status-select"
                    aria-label="Change status"
                  >
                    <option value="DISCOVERED">Discovered</option>
                    <option value="SAVED">Saved</option>
                    <option value="INTERESTED">Interested</option>
                    <option value="APPLIED">Applied</option>
                    <option value="INTERVIEW">Interview</option>
                    <option value="OFFER">Offer</option>
                    <option value="REJECTED">Rejected</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                </div>

                <button (click)="inspectTracked(item)" class="btn btn-secondary btn-sm">
                  <app-icon name="eye" [size]="13"></app-icon>
                  <span>Inspect</span>
                </button>

                <a
                  *ngIf="item.original_application_url"
                  [href]="item.original_application_url"
                  target="_blank"
                  rel="noopener noreferrer"
                  (click)="onOpenLink($event, item.original_application_url)"
                  class="btn btn-primary btn-sm"
                >
                  <span>Apply</span>
                  <app-icon name="external-link" [size]="12"></app-icon>
                </a>
              </div>
            </article>
          </div>
        </section>
      </section>

      <!-- Integrated Job Drawer Inspector -->
      <app-job-drawer
        [isOpen]="isDrawerOpen()"
        [job]="selectedJob()"
        (closeDrawer)="closeDrawer()"
        (statusUpdated)="onJobStatusUpdated($event)"
      ></app-job-drawer>
    </div>
  `,
  styles: [`
    .tracker-view {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      width: 100%;
    }

    .tracker-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-4);
      flex-wrap: wrap;
    }
    .tracker-header h1 {
      font-size: var(--text-2xl);
      letter-spacing: -0.025em;
      margin: 0;
    }
    .subtitle {
      font-size: var(--text-sm);
      color: var(--color-text-secondary);
      margin: 2px 0 0 0;
    }

    /* View Mode Switcher */
    .view-mode-toggle {
      display: flex;
      align-items: center;
      background: var(--color-bg-surface-elevated);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md);
      padding: 3px;
      gap: 3px;
    }
    .toggle-mode-btn {
      background: transparent;
      border: none;
      padding: 6px 12px;
      border-radius: var(--radius-sm);
      color: var(--color-text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: var(--text-xs);
      font-weight: 600;
      transition: all var(--motion-fast);
    }
    .toggle-mode-btn:hover {
      color: var(--color-text-primary);
    }
    .toggle-mode-btn.active {
      background: var(--color-bg-surface);
      color: var(--color-brand-accent);
      box-shadow: var(--shadow-xs);
    }

    /* Funnel Metrics Banner */
    .funnel-metrics-banner {
      background: var(--color-bg-surface-glass);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 1px solid var(--color-border-default);
      border-radius: var(--radius-lg);
      padding: var(--space-3) var(--space-5);
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: var(--shadow-xs);
      overflow-x: auto;
    }
    .funnel-metric {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      min-width: 70px;
    }
    .funnel-label {
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 700;
      color: var(--color-text-muted);
      letter-spacing: 0.05em;
    }
    .funnel-value {
      font-size: var(--text-xl);
      font-weight: 800;
      color: var(--color-text-primary);
      font-variant-numeric: tabular-nums;
    }
    .funnel-divider {
      color: var(--color-border-default);
      font-weight: 700;
      user-select: none;
    }
    .text-amber { color: var(--color-warning-text); }
    .text-blue { color: var(--color-brand-accent); }
    .text-purple { color: #a78bfa; }
    .text-green { color: var(--color-success-text); }

    /* KANBAN BOARD */
    .kanban-board-container {
      width: 100%;
      overflow-x: auto;
      padding-bottom: var(--space-4);
    }
    .kanban-columns-track {
      display: grid;
      grid-template-columns: repeat(4, minmax(260px, 1fr));
      gap: var(--space-3-5);
      min-width: 1080px;
    }
    .kanban-column {
      background: var(--color-bg-surface-glass);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid var(--color-border-default);
      border-radius: var(--radius-lg);
      padding: var(--space-3);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      min-height: 480px;
    }
    .kanban-col-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: var(--space-2-5);
      border-bottom: 1px solid var(--color-border-subtle);
    }
    .col-title-wrap {
      display: flex;
      align-items: center;
      gap: 7px;
    }
    .col-title-wrap h3 {
      font-size: var(--text-xs);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0;
    }
    .col-dot {
      width: 8px;
      height: 8px;
      border-radius: var(--radius-full);
    }
    .col-saved .col-dot { background: var(--color-warning); }
    .col-applied .col-dot { background: var(--color-brand-primary); }
    .col-interview .col-dot { background: #8b5cf6; }
    .col-offer .col-dot { background: var(--color-success); }

    .col-count {
      font-size: 11px;
      font-family: var(--font-mono);
      font-weight: 700;
      background: var(--color-bg-surface-elevated);
      color: var(--color-text-secondary);
      padding: 1px 7px;
      border-radius: var(--radius-pill);
    }

    .kanban-cards-stack {
      display: flex;
      flex-direction: column;
      gap: var(--space-2-5);
      flex: 1;
    }
    .empty-col-placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 120px;
      border: 1px dashed var(--color-border-subtle);
      border-radius: var(--radius-md);
      color: var(--color-text-muted);
      font-size: var(--text-xs);
    }

    .kanban-card {
      background: var(--color-bg-surface-elevated-glass);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md);
      padding: var(--space-3);
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      box-shadow: var(--shadow-xs);
      cursor: pointer;
      transition: all var(--motion-fast);
    }
    .kanban-card:hover {
      border-color: var(--color-border-hover);
      box-shadow: var(--shadow-sm);
      transform: translateY(-2px);
    }
    .offer-card {
      border-color: var(--color-success-border);
      background: linear-gradient(135deg, rgba(16, 185, 129, 0.06) 0%, rgba(15, 20, 34, 0.7) 100%);
    }

    .kanban-card-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .kanban-score {
      font-size: var(--text-2xs);
      font-family: var(--font-mono);
      font-weight: 700;
      color: var(--color-brand-accent);
    }
    .kanban-card-title {
      font-size: var(--text-xs);
      font-weight: 700;
      color: var(--color-text-primary);
      margin: 0;
      line-height: 1.3;
    }
    .kanban-company-text {
      font-size: 11px;
      color: var(--color-text-secondary);
    }
    .kanban-card-actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 4px;
    }
    .btn-advance {
      font-size: 11px;
      padding: 4px 8px;
    }

    /* Tabs */
    .status-tabs-container {
      width: 100%;
      overflow-x: auto;
      padding-bottom: var(--space-1);
    }
    .tabs-scroll {
      display: flex;
      gap: var(--space-1-5);
      border-bottom: 1px solid var(--color-border-subtle);
      padding-bottom: var(--space-2);
      min-width: max-content;
    }
    .tab-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      background: transparent;
      border: 1px solid transparent;
      border-radius: var(--radius-md);
      color: var(--color-text-secondary);
      font-size: var(--text-xs);
      font-weight: 600;
      cursor: pointer;
      transition: all var(--motion-fast);
    }
    .tab-btn:hover {
      color: var(--color-text-primary);
      background: var(--color-bg-surface-elevated-glass);
    }
    .tab-btn.active {
      color: var(--color-text-primary);
      background: var(--color-bg-surface-elevated);
      border-color: var(--color-border-default);
      box-shadow: var(--shadow-xs);
    }
    .tab-count {
      font-size: 10px;
      font-family: var(--font-mono);
      background: var(--color-bg-surface-muted);
      border: 1px solid var(--color-border-subtle);
      padding: 1px 6px;
      border-radius: var(--radius-pill);
      color: var(--color-text-muted);
    }
    .tab-btn.active .tab-count {
      background: var(--color-brand-primary);
      color: #ffffff;
      border-color: var(--color-brand-primary);
    }

    /* Tracked Cards */
    .tracked-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .items-grid {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .tracked-card {
      background: var(--color-bg-surface-glass);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid var(--color-border-default);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--space-4);
      box-shadow: var(--shadow-xs);
      transition: all var(--motion-fast);
      cursor: pointer;
    }
    .tracked-card:hover {
      border-color: var(--color-border-hover);
      box-shadow: var(--shadow-sm);
      transform: translateY(-1.5px);
    }
    .item-main {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      flex: 1;
      min-width: 0;
    }
    .item-meta-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
    }
    .company-row {
      display: flex;
      align-items: center;
      gap: var(--space-2-5);
    }
    .company-name {
      font-size: var(--text-xs);
      font-weight: 700;
      color: var(--color-text-primary);
    }
    .match-score {
      font-size: var(--text-xs);
      font-family: var(--font-mono);
      font-weight: 700;
      color: var(--color-brand-accent);
    }
    .item-title {
      font-size: var(--text-base);
      font-weight: 700;
      color: var(--color-text-primary);
      margin: 0;
      line-height: 1.35;
    }
    .meta-bottom-row {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      flex-wrap: wrap;
    }
    .status-stage-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: var(--text-2xs);
      font-weight: 700;
      padding: 2px 8px;
      border-radius: var(--radius-pill);
      background: var(--color-bg-surface-elevated);
      border: 1px solid var(--color-border-subtle);
      color: var(--color-text-secondary);
    }
    .stage-dot {
      width: 6px;
      height: 6px;
      border-radius: var(--radius-full);
      background: currentColor;
    }
    .status-stage-pill[data-status="SAVED"] { color: var(--color-warning-text); }
    .status-stage-pill[data-status="APPLIED"] { color: var(--color-brand-accent); }
    .status-stage-pill[data-status="INTERVIEW"] { color: #a78bfa; }
    .status-stage-pill[data-status="OFFER"] { color: var(--color-success-text); }

    .date-text {
      font-size: var(--text-2xs);
      color: var(--color-text-muted);
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .item-controls {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-shrink: 0;
    }
    .status-select {
      width: 130px;
      padding: 6px 10px;
      font-size: var(--text-xs);
    }

    .empty-state {
      padding: var(--space-8) var(--space-4);
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2-5);
    }
    .empty-icon {
      color: var(--color-text-muted);
      opacity: 0.5;
    }

    @media (max-width: 768px) {
      .tracked-card {
        flex-direction: column;
        align-items: stretch;
        gap: var(--space-3);
      }
      .item-controls {
        justify-content: flex-end;
      }
      .kanban-columns-track {
        grid-template-columns: 1fr;
        min-width: 0;
      }
    }
  `],
})
export class TrackerComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly telegram = inject(TelegramService);
  private readonly toast = inject(ToastService);

  readonly allItems = signal<TrackedJobItem[]>([]);
  readonly selectedStatus = signal<string>('ALL');
  readonly viewMode = signal<'kanban' | 'tabs'>('kanban');

  // Drawer state
  readonly isDrawerOpen = signal<boolean>(false);
  readonly selectedJob = signal<JobSummary | null>(null);

  readonly tabs: StatusTab[] = [
    { status: 'ALL', label: 'All Roles' },
    { status: 'SAVED', label: 'Saved' },
    { status: 'APPLIED', label: 'Applied' },
    { status: 'INTERVIEW', label: 'Interview' },
    { status: 'OFFER', label: 'Offer' },
    { status: 'REJECTED', label: 'Rejected' },
    { status: 'ARCHIVED', label: 'Archived' },
  ];

  ngOnInit(): void {
    this.loadTrackerItems();
  }

  loadTrackerItems(): void {
    this.api.getTrackedJobs().subscribe({
      next: (items) => this.allItems.set(items),
      error: (e) => console.error('Failed to load tracked jobs:', e),
    });
  }

  setViewMode(mode: 'kanban' | 'tabs'): void {
    this.viewMode.set(mode);
    this.telegram.haptic('selection');
  }

  selectTab(status: string): void {
    this.selectedStatus.set(status);
    this.telegram.haptic('selection');
  }

  filteredItems(): TrackedJobItem[] {
    const s = this.selectedStatus();
    if (s === 'ALL') return this.allItems();
    return this.allItems().filter((item) => item.status === s);
  }

  getItemsForStage(stage: string): TrackedJobItem[] {
    return this.allItems().filter((i) => i.status === stage);
  }

  getCountForStatus(status: string): number {
    if (status === 'ALL') return this.allItems().length;
    return this.allItems().filter((item) => item.status === status).length;
  }

  onStatusChange(jobId: number, newStatus: ApplicationStatus): void {
    this.telegram.haptic('medium');
    this.api.updateJobStatus(jobId, newStatus).subscribe({
      next: () => {
        this.toast.show(`Role stage updated to ${newStatus}`, 'success');
        this.loadTrackerItems();
      },
      error: (e) => {
        console.error('Failed to update job status:', e);
        this.toast.show('Failed to update stage', 'error');
      },
    });
  }

  advanceStatus(item: TrackedJobItem, nextStatus: ApplicationStatus): void {
    this.onStatusChange(item.job_id, nextStatus);
  }

  inspectTracked(item: TrackedJobItem): void {
    this.telegram.haptic('selection');
    const summary: JobSummary = {
      id: item.job_id,
      source_name: 'MONITORED_FEED',
      company: item.company,
      title: item.title,
      raw_location: null,
      workplace_type: 'REMOTE',
      eligibility: 'REMOTE_WORLDWIDE',
      seniority: 'MID',
      match_score: item.match_score,
      match_band: 'STRONG',
      published_at: null,
      first_seen_at: item.applied_at || new Date().toISOString(),
      original_application_url: item.original_application_url || '',
      required_skills: [],
      tracker_status: item.status,
    };
    this.selectedJob.set(summary);
    this.isDrawerOpen.set(true);
  }

  closeDrawer(): void {
    this.isDrawerOpen.set(false);
  }

  onJobStatusUpdated(event: { jobId: number; status: ApplicationStatus }): void {
    this.loadTrackerItems();
  }

  onOpenLink(event: MouseEvent, url: string): void {
    this.telegram.haptic('selection');
    if (this.telegram.isTelegram()) {
      event.preventDefault();
      this.telegram.openExternalLink(url);
    }
  }

  roundScore(score: number): number {
    return Math.round(score);
  }

  formatStatus(st: string): string {
    return st.charAt(0) + st.slice(1).toLowerCase();
  }
}
