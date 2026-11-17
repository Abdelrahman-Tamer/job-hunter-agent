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
      <!-- Top Tracker Header & View Switcher -->
      <header class="tracker-header">
        <div class="header-left">
          <h1>Application Pipeline</h1>
          <p class="subtitle">Track and progress candidate opportunities across hiring stages</p>
        </div>

        <div class="view-switch-rail" role="group" aria-label="Tracker view switcher">
          <button
            (click)="setViewMode('kanban')"
            [class.active]="viewMode() === 'kanban'"
            class="switch-btn"
          >
            <app-icon name="grid" [size]="13"></app-icon>
            <span>Kanban</span>
          </button>
          <button
            (click)="setViewMode('tabs')"
            [class.active]="viewMode() === 'tabs'"
            class="switch-btn"
          >
            <app-icon name="list" [size]="13"></app-icon>
            <span>Stage List</span>
          </button>
        </div>
      </header>

      <!-- Pipeline Funnel Telemetry Bar -->
      <section class="funnel-strip" aria-label="Pipeline metrics">
        <div class="funnel-cell">
          <span class="funnel-num">{{ allItems().length }}</span>
          <span class="funnel-tag">Tracked</span>
        </div>
        <span class="funnel-sep">/</span>
        <div class="funnel-cell">
          <span class="funnel-num text-amber">{{ getCountForStatus('SAVED') }}</span>
          <span class="funnel-tag">Saved</span>
        </div>
        <span class="funnel-sep">/</span>
        <div class="funnel-cell">
          <span class="funnel-num text-blue">{{ getCountForStatus('APPLIED') }}</span>
          <span class="funnel-tag">Applied</span>
        </div>
        <span class="funnel-sep">/</span>
        <div class="funnel-cell">
          <span class="funnel-num text-purple">{{ getCountForStatus('INTERVIEW') }}</span>
          <span class="funnel-tag">Interviews</span>
        </div>
        <span class="funnel-sep">/</span>
        <div class="funnel-cell">
          <span class="funnel-num text-green">{{ getCountForStatus('OFFER') }}</span>
          <span class="funnel-tag">Offers</span>
        </div>
      </section>

      <!-- VIEW MODE 1: KANBAN BOARD -->
      <section class="kanban-stage-area" *ngIf="viewMode() === 'kanban'" aria-label="Kanban board">
        <div class="kanban-grid-cols">
          <!-- Column: Saved -->
          <div class="kanban-col">
            <div class="col-head head-saved">
              <div class="col-indicator">
                <span class="dot-indicator dot-amber"></span>
                <span class="col-name">Saved</span>
              </div>
              <span class="col-counter">{{ getCountForStatus('SAVED') }}</span>
            </div>

            <div class="cards-list">
              <div *ngIf="getItemsForStage('SAVED').length === 0" class="empty-col">
                <span>No saved roles</span>
              </div>

              <article
                *ngFor="let item of getItemsForStage('SAVED')"
                class="kanban-role-card"
                (click)="inspectTracked(item)"
                tabindex="0"
                (keyup.enter)="inspectTracked(item)"
              >
                <div class="card-top-row">
                  <span class="company-avatar">{{ item.company.charAt(0) }}</span>
                  <span class="match-score-text">{{ roundScore(item.match_score) }}%</span>
                </div>
                <h4 class="role-title-text">{{ item.title }}</h4>
                <span class="company-subtext">{{ item.company }}</span>

                <div *ngIf="item.follow_up_at" class="follow-up-badge" [class.due]="isFollowUpDue(item.follow_up_at)">
                  <app-icon name="bell" [size]="10"></app-icon>
                  <span>{{ formatFollowUpLabel(item.follow_up_at) }}</span>
                </div>

                <div class="card-bottom-actions" (click)="$event.stopPropagation()">
                  <button (click)="advanceStatus(item, 'APPLIED')" class="btn-advance">
                    <span>Apply →</span>
                  </button>
                </div>
              </article>
            </div>
          </div>

          <!-- Column: Applied -->
          <div class="kanban-col">
            <div class="col-head head-applied">
              <div class="col-indicator">
                <span class="dot-indicator dot-blue"></span>
                <span class="col-name">Applied</span>
              </div>
              <span class="col-counter">{{ getCountForStatus('APPLIED') }}</span>
            </div>

            <div class="cards-list">
              <div *ngIf="getItemsForStage('APPLIED').length === 0" class="empty-col">
                <span>No applications sent</span>
              </div>

              <article
                *ngFor="let item of getItemsForStage('APPLIED')"
                class="kanban-role-card"
                (click)="inspectTracked(item)"
                tabindex="0"
                (keyup.enter)="inspectTracked(item)"
              >
                <div class="card-top-row">
                  <span class="company-avatar">{{ item.company.charAt(0) }}</span>
                  <span class="match-score-text">{{ roundScore(item.match_score) }}%</span>
                </div>
                <h4 class="role-title-text">{{ item.title }}</h4>
                <span class="company-subtext">{{ item.company }}</span>

                <div *ngIf="item.follow_up_at" class="follow-up-badge" [class.due]="isFollowUpDue(item.follow_up_at)">
                  <app-icon name="bell" [size]="10"></app-icon>
                  <span>{{ formatFollowUpLabel(item.follow_up_at) }}</span>
                </div>

                <div class="card-bottom-actions" (click)="$event.stopPropagation()">
                  <button (click)="advanceStatus(item, 'INTERVIEW')" class="btn-advance">
                    <span>Interview →</span>
                  </button>
                </div>
              </article>
            </div>
          </div>

          <!-- Column: Interview -->
          <div class="kanban-col">
            <div class="col-head head-interview">
              <div class="col-indicator">
                <span class="dot-indicator dot-purple"></span>
                <span class="col-name">Interview</span>
              </div>
              <span class="col-counter">{{ getCountForStatus('INTERVIEW') }}</span>
            </div>

            <div class="cards-list">
              <div *ngIf="getItemsForStage('INTERVIEW').length === 0" class="empty-col">
                <span>No interviews yet</span>
              </div>

              <article
                *ngFor="let item of getItemsForStage('INTERVIEW')"
                class="kanban-role-card"
                (click)="inspectTracked(item)"
                tabindex="0"
                (keyup.enter)="inspectTracked(item)"
              >
                <div class="card-top-row">
                  <span class="company-avatar">{{ item.company.charAt(0) }}</span>
                  <span class="match-score-text text-green">{{ roundScore(item.match_score) }}%</span>
                </div>
                <h4 class="role-title-text">{{ item.title }}</h4>
                <span class="company-subtext">{{ item.company }}</span>

                <div *ngIf="item.follow_up_at" class="follow-up-badge" [class.due]="isFollowUpDue(item.follow_up_at)">
                  <app-icon name="bell" [size]="10"></app-icon>
                  <span>{{ formatFollowUpLabel(item.follow_up_at) }}</span>
                </div>

                <div class="card-bottom-actions" (click)="$event.stopPropagation()">
                  <button (click)="advanceStatus(item, 'OFFER')" class="btn-advance text-green">
                    <span>Offer! 🎉</span>
                  </button>
                </div>
              </article>
            </div>
          </div>

          <!-- Column: Offer -->
          <div class="kanban-col">
            <div class="col-head head-offer">
              <div class="col-indicator">
                <span class="dot-indicator dot-green"></span>
                <span class="col-name">Offer</span>
              </div>
              <span class="col-counter">{{ getCountForStatus('OFFER') }}</span>
            </div>

            <div class="cards-list">
              <div *ngIf="getItemsForStage('OFFER').length === 0" class="empty-col">
                <span>No offers received</span>
              </div>

              <article
                *ngFor="let item of getItemsForStage('OFFER')"
                class="kanban-role-card offer-highlight"
                (click)="inspectTracked(item)"
                tabindex="0"
                (keyup.enter)="inspectTracked(item)"
              >
                <div class="card-top-row">
                  <span class="company-avatar">{{ item.company.charAt(0) }}</span>
                  <span class="match-score-text text-green font-bold">Offer 🎉</span>
                </div>
                <h4 class="role-title-text">{{ item.title }}</h4>
                <span class="company-subtext">{{ item.company }}</span>

                <div *ngIf="item.follow_up_at" class="follow-up-badge" [class.due]="isFollowUpDue(item.follow_up_at)">
                  <app-icon name="bell" [size]="10"></app-icon>
                  <span>{{ formatFollowUpLabel(item.follow_up_at) }}</span>
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>

      <!-- VIEW MODE 2: STAGE TABS VIEW -->
      <section class="tabs-stage-area" *ngIf="viewMode() === 'tabs'" aria-label="Stage view">
        <!-- Segmented Stage Switcher -->
        <div class="stage-segmented-nav" role="tablist">
          <button
            *ngFor="let tab of tabs"
            (click)="selectTab(tab.status)"
            [class.active]="selectedStatus() === tab.status"
            class="tab-item-btn"
            role="tab"
          >
            <span>{{ tab.label }}</span>
            <span class="tab-badge-num">{{ getCountForStatus(tab.status) }}</span>
          </button>
        </div>

        <!-- Tracked Roles List -->
        <div class="tracked-rows-list">
          <div *ngIf="filteredItems().length === 0" class="empty-panel">
            <app-icon name="bookmark" [size]="28" class="text-muted"></app-icon>
            <p>No opportunities in this pipeline stage.</p>
            <a routerLink="/jobs" class="btn btn-primary btn-sm">
              <span>Find Opportunities</span>
            </a>
          </div>

          <article
            *ngFor="let item of filteredItems()"
            class="tracked-row-item"
            (click)="inspectTracked(item)"
            tabindex="0"
            (keyup.enter)="inspectTracked(item)"
          >
            <div class="row-left-content">
              <span class="company-avatar">{{ item.company.charAt(0) }}</span>
              <div class="row-info-wrap">
                <div class="row-title-line">
                  <h4 class="row-title">{{ item.title }}</h4>
                  <span class="score-badge">{{ roundScore(item.match_score) }}% match</span>
                </div>
                <div class="row-sub-line">
                  <span class="company-name-text">{{ item.company }}</span>
                  <span class="meta-dot">·</span>
                  <span class="stage-tag" [attr.data-status]="item.status">{{ formatStatus(item.status) }}</span>
                  <span class="meta-dot" *ngIf="item.applied_at">·</span>
                  <span class="date-text" *ngIf="item.applied_at">{{ item.applied_at | date:'mediumDate' }}</span>
                </div>
              </div>
            </div>

            <div class="row-right-actions" (click)="$event.stopPropagation()">
              <select
                [ngModel]="item.status"
                (ngModelChange)="onStatusChange(item.job_id, $event)"
                class="form-select status-dropdown"
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

              <button (click)="inspectTracked(item)" class="btn btn-secondary btn-sm">
                <app-icon name="eye" [size]="12"></app-icon>
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
                <app-icon name="external-link" [size]="11"></app-icon>
              </a>
            </div>
          </article>
        </div>
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
      gap: var(--space-3);
      width: 100%;
    }

    .tracker-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      flex-wrap: wrap;
    }
    .header-left h1 {
      font-size: var(--text-xl);
      letter-spacing: -0.025em;
      margin: 0;
    }
    .subtitle {
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
      margin: 2px 0 0 0;
    }

    /* Switch Rail */
    .view-switch-rail {
      display: flex;
      align-items: center;
      background: var(--color-bg-surface-elevated);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-sm);
      padding: 2px;
      gap: 2px;
    }
    .switch-btn {
      background: transparent;
      border: none;
      padding: 6px 14px;
      border-radius: var(--radius-sm);
      color: var(--color-text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 600;
      transition: background-color var(--motion-fast), color var(--motion-fast);
    }
    .switch-btn:hover { color: var(--color-text-primary); }
    .switch-btn.active {
      background: var(--color-bg-surface);
      color: var(--color-brand-accent);
      box-shadow: var(--shadow-xs);
    }

    /* Funnel Strip */
    .funnel-strip {
      background: var(--color-bg-surface-glass);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md);
      padding: 8px 14px;
      display: flex;
      align-items: center;
      gap: var(--space-4);
      overflow-x: auto;
    }
    .funnel-cell {
      display: flex;
      align-items: baseline;
      gap: 5px;
    }
    .funnel-num {
      font-size: var(--text-sm);
      font-weight: 800;
      font-family: var(--font-mono);
      color: var(--color-text-primary);
    }
    .funnel-tag {
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 600;
      color: var(--color-text-muted);
      letter-spacing: 0.04em;
    }
    .funnel-sep {
      color: var(--color-border-default);
      font-size: 11px;
    }

    .text-amber { color: var(--color-warning-text); }
    .text-blue { color: var(--color-brand-accent); }
    .text-purple { color: #a78bfa; }
    .text-green { color: var(--color-success-text); }
    .text-muted { color: var(--color-text-muted); }

    /* Kanban Area */
    .kanban-grid-cols {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: var(--space-3);
      width: 100%;
    }
    .kanban-col {
      background: var(--color-bg-surface-glass);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md);
      padding: var(--space-3);
      display: flex;
      flex-direction: column;
      gap: var(--space-2-5);
      min-height: 440px;
    }
    .col-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--color-border-subtle);
    }
    .col-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .dot-indicator {
      width: 6px;
      height: 6px;
      border-radius: var(--radius-full);
    }
    .dot-amber { background: var(--color-warning); }
    .dot-blue { background: var(--color-brand-primary); }
    .dot-purple { background: #8b5cf6; }
    .dot-green { background: var(--color-success); }

    .col-name {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .col-counter {
      font-size: 10px;
      font-family: var(--font-mono);
      font-weight: 700;
      color: var(--color-text-muted);
      background: var(--color-bg-surface-elevated);
      padding: 1px 5px;
      border-radius: var(--radius-xs);
    }

    .cards-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex: 1;
    }
    .empty-col {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 80px;
      border: 1px dashed var(--color-border-subtle);
      border-radius: var(--radius-xs);
      color: var(--color-text-muted);
      font-size: 11px;
    }

    .kanban-role-card {
      background: var(--color-bg-surface-elevated);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-sm);
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      cursor: pointer;
      /* Silky hover, NO jump */
      transition: background-color var(--motion-fast), border-color var(--motion-fast);
    }
    .kanban-role-card:hover {
      background-color: var(--color-bg-surface-hover);
      border-color: var(--color-border-hover);
    }
    .follow-up-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      font-weight: 600;
      color: var(--color-brand-accent);
      background: var(--color-brand-subtle);
      border: 1px solid var(--color-brand-border);
      border-radius: var(--radius-pill);
      padding: 1.5px 7px;
      margin-top: 3px;
      width: fit-content;
    }
    .follow-up-badge.due {
      color: var(--color-error-text);
      background: var(--color-error-bg);
      border-color: var(--color-error-border);
    }
    .offer-highlight {
      border-color: var(--color-success-border);
    }

    .card-top-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .match-score-text {
      font-size: 10px;
      font-family: var(--font-mono);
      font-weight: 700;
      color: var(--color-brand-accent);
    }
    .role-title-text {
      font-size: 11px;
      font-weight: 700;
      color: var(--color-text-primary);
      margin: 0;
      line-height: 1.3;
    }
    .company-subtext {
      font-size: 10px;
      color: var(--color-text-muted);
    }
    .card-bottom-actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 2px;
    }
    .btn-advance {
      background: var(--color-bg-surface-elevated);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-sm);
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 600;
      color: var(--color-text-secondary);
      cursor: pointer;
      transition: background-color var(--motion-fast), color var(--motion-fast), border-color var(--motion-fast);
    }
    .btn-advance:hover {
      color: var(--color-text-primary);
      border-color: var(--color-border-hover);
      background: var(--color-bg-surface-hover);
    }

    /* Tabs Stage View */
    .stage-segmented-nav {
      display: flex;
      gap: 4px;
      background: var(--color-bg-surface-elevated);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md);
      padding: 3px;
      overflow-x: auto;
    }
    .tab-item-btn {
      background: transparent;
      border: none;
      padding: 7px 14px;
      border-radius: var(--radius-sm);
      color: var(--color-text-muted);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
      transition: color var(--motion-fast), background-color var(--motion-fast);
    }
    .tab-item-btn:hover { color: var(--color-text-primary); }
    .tab-item-btn.active {
      background: var(--color-bg-surface);
      color: var(--color-text-primary);
      box-shadow: var(--shadow-xs);
    }
    .tab-badge-num {
      font-size: 10px;
      font-family: var(--font-mono);
      background: var(--color-bg-surface-elevated);
      padding: 0 4px;
      border-radius: var(--radius-xs);
    }

    .tracked-rows-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: var(--space-2);
    }
    .tracked-row-item {
      background: var(--color-bg-surface-glass);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md);
      padding: 10px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      cursor: pointer;
      transition: background-color var(--motion-fast), border-color var(--motion-fast);
    }
    .tracked-row-item:hover {
      background-color: var(--color-bg-surface-hover);
      border-color: var(--color-border-hover);
    }

    .row-left-content {
      display: flex;
      align-items: center;
      gap: var(--space-2-5);
      min-width: 0;
      flex: 1;
    }
    .row-info-wrap {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      flex: 1;
    }
    .row-title-line {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .row-title {
      font-size: var(--text-xs);
      font-weight: 700;
      color: var(--color-text-primary);
      margin: 0;
    }
    .score-badge {
      font-size: 10px;
      font-family: var(--font-mono);
      color: var(--color-brand-accent);
      font-weight: 700;
    }
    .row-sub-line {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      color: var(--color-text-muted);
    }
    .company-name-text {
      font-weight: 600;
      color: var(--color-text-secondary);
    }
    .meta-dot { color: var(--color-border-default); }
    .stage-tag {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      padding: 1px 5px;
      border-radius: var(--radius-xs);
      background: var(--color-bg-surface-elevated);
      color: var(--color-text-secondary);
    }
    .stage-tag[data-status="SAVED"] { color: var(--color-warning-text); }
    .stage-tag[data-status="APPLIED"] { color: var(--color-brand-accent); }
    .stage-tag[data-status="INTERVIEW"] { color: #a78bfa; }
    .stage-tag[data-status="OFFER"] { color: var(--color-success-text); }

    .date-text { font-size: 10px; }

    .row-right-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .status-dropdown {
      width: 105px;
      height: 28px;
      padding: 3px 20px 3px 6px;
      font-size: 11px;
      border-radius: var(--radius-xs);
    }

    .empty-panel {
      padding: var(--space-6);
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2);
      color: var(--color-text-muted);
      font-size: var(--text-xs);
    }

    @media (max-width: 860px) {
      .kanban-grid-cols {
        grid-template-columns: 1fr;
      }
      .tracked-row-item {
        flex-direction: column;
        align-items: stretch;
      }
      .row-right-actions {
        justify-content: flex-end;
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
        this.toast.show(`Role moved to ${newStatus}`, 'success');
        this.loadTrackerItems();
      },
      error: () => this.toast.show('Failed to update stage', 'error'),
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

  isFollowUpDue(dateStr: string): boolean {
    return new Date(dateStr).getTime() <= Date.now();
  }

  formatFollowUpLabel(dateStr: string): string {
    const target = new Date(dateStr).getTime();
    const now = Date.now();
    const diffDays = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) {
      return 'Follow-up Due Today!';
    }
    return `Follow-up in ${diffDays}d`;
  }
}
