import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { TelegramService } from '../../core/services/telegram.service';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent } from '../../core/components/icon/icon.component';
import { JobDrawerComponent } from '../../core/components/job-drawer/job-drawer.component';
import { UiBadgeComponent } from '../../shared/ui/ui-badge.component';
import { UiSkeletonComponent } from '../../shared/ui/ui-skeleton.component';
import { UiEmptyStateComponent } from '../../shared/ui/ui-empty-state.component';
import {
  ApplicationStatus,
  JobSummary,
  TrackedJobItem,
} from '../../core/models/job.model';

interface StatusColumn {
  status: ApplicationStatus;
  label: string;
  dotColor: string;
}

@Component({
  selector: 'app-tracker',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    IconComponent,
    JobDrawerComponent,
    UiBadgeComponent,
    UiSkeletonComponent,
    UiEmptyStateComponent,
  ],
  template: `
    <div class="tracker-pipeline-view">
      <!-- Top Command Header & View Switcher -->
      <header class="tracker-header">
        <div class="header-titles">
          <div class="title-row">
            <h1 class="page-title">Application Pipeline</h1>
            <ui-badge variant="brand" size="sm" class="tabular-nums">
              {{ allItems().length }} Tracked
            </ui-badge>
          </div>
          <p class="page-subtitle">
            Manage stage transitions, track recruiter follow-ups, and progress opportunities.
          </p>
        </div>

        <!-- View Switcher & Stage Quick Filters -->
        <div class="header-controls">
          <div class="segmented-control" role="group" aria-label="Pipeline view layout">
            <button
              type="button"
              (click)="setViewMode('kanban')"
              [class.active]="viewMode() === 'kanban'"
              class="segment-btn"
            >
              <app-icon name="grid" [size]="13"></app-icon>
              <span>Board</span>
            </button>
            <button
              type="button"
              (click)="setViewMode('list')"
              [class.active]="viewMode() === 'list'"
              class="segment-btn"
            >
              <app-icon name="list" [size]="13"></app-icon>
              <span>List</span>
            </button>
          </div>
        </div>
      </header>

      <!-- Stage Funnel Metrics Bar -->
      <section class="funnel-metrics-bar tabular-nums" aria-label="Stage distribution">
        <div class="funnel-stat-card" (click)="selectFilterStatus('ALL')" [class.active]="filterStatus() === 'ALL'">
          <span class="stat-count">{{ allItems().length }}</span>
          <span class="stat-name">Total Roles</span>
        </div>
        <div class="funnel-stat-card" (click)="selectFilterStatus('SAVED')" [class.active]="filterStatus() === 'SAVED'">
          <span class="stat-count text-brand">{{ getCountForStatus('SAVED') }}</span>
          <span class="stat-name">Saved</span>
        </div>
        <div class="funnel-stat-card" (click)="selectFilterStatus('APPLIED')" [class.active]="filterStatus() === 'APPLIED'">
          <span class="stat-count text-indigo">{{ getCountForStatus('APPLIED') }}</span>
          <span class="stat-name">Applied</span>
        </div>
        <div class="funnel-stat-card" (click)="selectFilterStatus('INTERVIEW')" [class.active]="filterStatus() === 'INTERVIEW'">
          <span class="stat-count text-purple">{{ getCountForStatus('INTERVIEW') }}</span>
          <span class="stat-name">Interviews</span>
        </div>
        <div class="funnel-stat-card" (click)="selectFilterStatus('OFFER')" [class.active]="filterStatus() === 'OFFER'">
          <span class="stat-count text-emerald">{{ getCountForStatus('OFFER') }}</span>
          <span class="stat-name">Offers 🎉</span>
        </div>
        <div class="funnel-stat-card" (click)="selectFilterStatus('REJECTED')" [class.active]="filterStatus() === 'REJECTED'">
          <span class="stat-count text-muted">{{ getCountForStatus('REJECTED') + getCountForStatus('ARCHIVED') }}</span>
          <span class="stat-name">Archived</span>
        </div>
      </section>

      <!-- Loading State -->
      <div *ngIf="isLoading()" class="skeletons-container">
        <div class="skeletons-grid">
          <ui-skeleton *ngFor="let col of [1, 2, 3, 4]" height="320px" rounded="sm"></ui-skeleton>
        </div>
      </div>

      <!-- Empty State -->
      <div *ngIf="!isLoading() && allItems().length === 0" class="empty-feed-container">
        <ui-empty-state
          icon="bookmark"
          title="Your Pipeline Is Clean"
          subtitle="Discover verified opportunities on the radar and save them to track your application journey."
        >
          <div action>
            <a routerLink="/jobs" class="find-roles-btn">
              <app-icon name="search" [size]="13"></app-icon>
              <span>Explore Opportunities</span>
            </a>
          </div>
        </ui-empty-state>
      </div>

      <!-- VIEW 1: KANBAN BOARD -->
      <section
        *ngIf="!isLoading() && allItems().length > 0 && viewMode() === 'kanban'"
        class="kanban-workspace custom-scrollbar"
        aria-label="Kanban pipeline board"
      >
        <div class="kanban-columns-container">
          <!-- Stage Column Loop -->
          <div *ngFor="let col of kanbanColumns" class="kanban-column">
            <header class="column-header">
              <div class="column-title-left">
                <span class="column-dot" [style.background-color]="col.dotColor"></span>
                <span class="column-label">{{ col.label }}</span>
              </div>
              <span class="column-count-badge tabular-nums">{{ getCountForStatus(col.status) }}</span>
            </header>

            <div class="column-cards-list custom-scrollbar">
              <div *ngIf="getItemsForStage(col.status).length === 0" class="empty-column-slot">
                <span>No roles in {{ col.label.toLowerCase() }}</span>
              </div>

              <!-- Kanban Card -->
              <article
                *ngFor="let item of getItemsForStage(col.status)"
                (click)="openDrawer(item)"
                class="kanban-card"
                tabindex="0"
                (keydown.enter)="openDrawer(item)"
                [attr.aria-label]="item.title + ' at ' + item.company"
              >
                <!-- Card Header -->
                <div class="card-head-row">
                  <span class="company-badge-name">{{ item.company }}</span>
                  <span
                    class="score-pill tabular-nums"
                    [attr.data-band]="getScoreBand(item.match_score)"
                  >
                    {{ roundScore(item.match_score) }}%
                  </span>
                </div>

                <h3 class="role-title-heading">{{ item.title }}</h3>

                <!-- Follow-Up Alert Pill (when due or active) -->
                <div
                  *ngIf="item.follow_up_at"
                  class="follow-up-badge"
                  [class.due]="isFollowUpDue(item.follow_up_at)"
                >
                  <app-icon name="clock" [size]="11"></app-icon>
                  <span>{{ formatFollowUpLabel(item.follow_up_at) }}</span>
                </div>

                <!-- Stage Transition Actions -->
                <div class="card-footer-actions" (click)="$event.stopPropagation()">
                  <div class="stage-advance-btn-group">
                    <button
                      *ngIf="col.status === 'SAVED'"
                      type="button"
                      (click)="advanceStatus(item, 'APPLIED')"
                      class="advance-action-btn"
                      title="Move to Applied"
                    >
                      <span>Applied →</span>
                    </button>

                    <button
                      *ngIf="col.status === 'APPLIED'"
                      type="button"
                      (click)="advanceStatus(item, 'INTERVIEW')"
                      class="advance-action-btn"
                      title="Move to Interview"
                    >
                      <span>Interview →</span>
                    </button>

                    <button
                      *ngIf="col.status === 'INTERVIEW'"
                      type="button"
                      (click)="advanceStatus(item, 'OFFER')"
                      class="advance-action-btn offer"
                      title="Mark as Offer"
                    >
                      <span>Offer! 🎉</span>
                    </button>
                  </div>

                  <a
                    *ngIf="item.original_application_url"
                    [href]="item.original_application_url"
                    target="_blank"
                    rel="noopener noreferrer"
                    (click)="onOpenLink($event, item.original_application_url)"
                    class="card-external-link"
                    title="Direct portal link"
                    aria-label="Direct apply link"
                  >
                    <app-icon name="external-link" [size]="12"></app-icon>
                  </a>
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>

      <!-- VIEW 2: HIGH-DENSITY LIST / TABLE VIEW -->
      <section
        *ngIf="!isLoading() && allItems().length > 0 && viewMode() === 'list'"
        class="list-table-workspace"
        aria-label="List table view"
      >
        <div class="table-container">
          <div class="table-header-row">
            <span class="col-th th-company">Opportunity & Company</span>
            <span class="col-th th-score">Fit Score</span>
            <span class="col-th th-stage">Current Stage</span>
            <span class="col-th th-followup">Follow-Up Alert</span>
            <span class="col-th th-actions">Actions</span>
          </div>

          <div class="table-body">
            <article
              *ngFor="let item of filteredItems()"
              (click)="openDrawer(item)"
              class="table-item-row"
              tabindex="0"
              (keydown.enter)="openDrawer(item)"
            >
              <div class="col-td td-company">
                <span class="item-role-title">{{ item.title }}</span>
                <span class="item-company-name">{{ item.company }}</span>
              </div>

              <div class="col-td td-score">
                <span
                  class="score-pill tabular-nums"
                  [attr.data-band]="getScoreBand(item.match_score)"
                >
                  {{ roundScore(item.match_score) }}%
                </span>
              </div>

              <div class="col-td td-stage" (click)="$event.stopPropagation()">
                <select
                  [ngModel]="item.status"
                  (ngModelChange)="onStatusChange(item.job_id, $event)"
                  class="stage-select-compact"
                  aria-label="Change stage"
                >
                  <option value="DISCOVERED">Discovered</option>
                  <option value="SAVED">Saved</option>
                  <option value="APPLIED">Applied</option>
                  <option value="INTERVIEW">Interview</option>
                  <option value="OFFER">Offer 🎉</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>

              <div class="col-td td-followup">
                <span
                  *ngIf="item.follow_up_at"
                  class="follow-up-pill"
                  [class.due]="isFollowUpDue(item.follow_up_at)"
                >
                  {{ formatFollowUpLabel(item.follow_up_at) }}
                </span>
                <span *ngIf="!item.follow_up_at" class="text-muted">—</span>
              </div>

              <div class="col-td td-actions" (click)="$event.stopPropagation()">
                <a
                  *ngIf="item.original_application_url"
                  [href]="item.original_application_url"
                  target="_blank"
                  rel="noopener noreferrer"
                  (click)="onOpenLink($event, item.original_application_url)"
                  class="table-icon-btn"
                  title="Direct link"
                  aria-label="Direct link"
                >
                  <app-icon name="external-link" [size]="13"></app-icon>
                </a>
              </div>
            </article>
          </div>
        </div>
      </section>

      <!-- Job Detail Drawer Integration -->
      <app-job-drawer
        [isOpen]="isDrawerOpen()"
        [job]="selectedJob()"
        (closeDrawer)="closeDrawer()"
        (statusUpdated)="onDrawerStatusUpdated($event)"
      ></app-job-drawer>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
    }

    .tracker-pipeline-view {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      width: 100%;
      max-width: 1240px;
      margin: 0 auto;
    }

    /* ==========================================================================
       Header
       ========================================================================== */
    .tracker-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-4);
      flex-wrap: wrap;
    }

    .header-titles {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .title-row {
      display: flex;
      align-items: center;
      gap: var(--space-2-5);
    }

    .page-title {
      margin: 0;
      font-size: var(--text-lg);
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--color-text-primary);
    }

    .page-subtitle {
      margin: 0;
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
    }

    /* Segmented Control */
    .segmented-control {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      background-color: var(--color-bg-surface-2);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-sm);
      padding: 2px;
    }

    .segment-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 5px 12px;
      background: transparent;
      border: 1px solid transparent;
      border-radius: var(--radius-xs);
      font-size: 12px;
      font-weight: 500;
      color: var(--color-text-secondary);
      cursor: pointer;
      user-select: none;
      transition: all var(--motion-fast);
    }
    .segment-btn:hover {
      color: var(--color-text-primary);
    }
    .segment-btn.active {
      background-color: var(--color-bg-surface-1);
      color: var(--color-text-primary);
      border-color: var(--color-border-subtle);
      font-weight: 600;
      box-shadow: var(--shadow-xs);
    }

    /* ==========================================================================
       Stage Funnel Metrics Bar
       ========================================================================== */
    .funnel-metrics-bar {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: var(--space-2);
    }

    .funnel-stat-card {
      background-color: var(--color-bg-surface-1);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xs);
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      cursor: pointer;
      transition: all var(--motion-fast);
    }
    .funnel-stat-card:hover {
      background-color: var(--color-bg-surface-2);
      border-color: var(--color-border-default);
    }
    .funnel-stat-card.active {
      border-color: var(--color-brand-accent);
      background-color: var(--color-brand-subtle);
    }

    .stat-count {
      font-size: 16px;
      font-weight: 700;
      color: var(--color-text-primary);
      line-height: 1.2;
    }
    .stat-name {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--color-text-muted);
    }

    /* Skeletons */
    .skeletons-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: var(--space-3);
    }

    /* Empty state */
    .find-roles-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      background-color: var(--color-brand-accent);
      color: #ffffff;
      border-radius: var(--radius-xs);
      font-size: 12px;
      font-weight: 600;
      text-decoration: none;
      transition: background-color var(--motion-fast);
    }
    .find-roles-btn:hover {
      background-color: var(--color-brand-hover);
    }

    /* ==========================================================================
       Kanban Board Workspace
       ========================================================================== */
    .kanban-workspace {
      width: 100%;
      overflow-x: auto;
      padding-bottom: var(--space-3);
    }

    .kanban-columns-container {
      display: grid;
      grid-template-columns: repeat(4, minmax(260px, 1fr));
      gap: var(--space-3);
      align-items: start;
    }

    .kanban-column {
      background-color: var(--color-bg-surface-1);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-sm);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      max-height: calc(100vh - 240px);
    }

    .column-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 9px 12px;
      border-bottom: 1px solid var(--color-border-subtle);
      background-color: var(--color-bg-surface-2);
    }

    .column-title-left {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .column-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }
    .column-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--color-text-primary);
    }
    .column-count-badge {
      font-size: 11px;
      color: var(--color-text-muted);
      font-family: var(--font-mono);
      font-weight: 600;
    }

    .column-cards-list {
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      overflow-y: auto;
    }

    .empty-column-slot {
      padding: var(--space-4) var(--space-2);
      text-align: center;
      font-size: 11px;
      color: var(--color-text-muted);
      font-style: italic;
    }

    /* Kanban Card */
    .kanban-card {
      background-color: var(--color-bg-surface-2);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xs);
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      cursor: pointer;
      transition: all var(--motion-fast);
    }
    .kanban-card:hover {
      background-color: var(--color-bg-surface-hover);
      border-color: var(--color-border-default);
      transform: translateY(-1px);
    }

    .card-head-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }

    .company-badge-name {
      font-size: 11px;
      font-weight: 600;
      color: var(--color-text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 160px;
    }

    .score-pill {
      font-size: 10px;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 3px;
      border: 1px solid var(--color-border-subtle);
      background-color: var(--color-bg-surface-1);
    }
    .score-pill[data-band="emerald"] {
      border-color: rgba(16, 185, 129, 0.4);
      background-color: rgba(16, 185, 129, 0.08);
      color: var(--color-success);
    }
    .score-pill[data-band="indigo"] {
      border-color: var(--color-brand-border);
      background-color: var(--color-brand-subtle);
      color: var(--color-brand-accent);
    }
    .score-pill[data-band="amber"] {
      border-color: rgba(245, 158, 11, 0.4);
      background-color: rgba(245, 158, 11, 0.08);
      color: var(--color-warning);
    }
    .score-pill[data-band="muted"] {
      color: var(--color-text-muted);
    }

    .role-title-heading {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
      color: var(--color-text-primary);
      line-height: 1.35;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    /* Follow up alert pill */
    .follow-up-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 3px;
      background-color: rgba(59, 130, 246, 0.08);
      border: 1px solid rgba(59, 130, 246, 0.2);
      color: var(--color-brand-accent);
    }
    .follow-up-badge.due {
      background-color: rgba(239, 68, 68, 0.1);
      border-color: rgba(239, 68, 68, 0.3);
      color: var(--color-danger);
    }

    /* Card Footer Actions */
    .card-footer-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 6px;
      border-top: 1px solid var(--color-border-subtle);
      margin-top: 2px;
    }

    .stage-advance-btn-group {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .advance-action-btn {
      padding: 2px 7px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 600;
      background-color: var(--color-bg-surface-1);
      border: 1px solid var(--color-border-subtle);
      color: var(--color-text-secondary);
      cursor: pointer;
      transition: all var(--motion-fast);
    }
    .advance-action-btn:hover {
      background-color: var(--color-brand-subtle);
      border-color: var(--color-brand-border);
      color: var(--color-brand-accent);
    }
    .advance-action-btn.offer {
      color: var(--color-success);
    }

    .card-external-link {
      color: var(--color-text-muted);
      display: inline-flex;
      padding: 2px;
    }
    .card-external-link:hover {
      color: var(--color-brand-accent);
    }

    /* ==========================================================================
       List Table Workspace
       ========================================================================== */
    .list-table-workspace {
      width: 100%;
      background-color: var(--color-bg-surface-1);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-sm);
      overflow: hidden;
    }

    .table-container {
      width: 100%;
      display: flex;
      flex-direction: column;
    }

    .table-header-row {
      display: grid;
      grid-template-columns: 2fr 100px 140px 140px 60px;
      padding: 8px 14px;
      background-color: var(--color-bg-surface-2);
      border-bottom: 1px solid var(--color-border-subtle);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--color-text-muted);
    }

    .table-body {
      display: flex;
      flex-direction: column;
    }

    .table-item-row {
      display: grid;
      grid-template-columns: 2fr 100px 140px 140px 60px;
      align-items: center;
      padding: 10px 14px;
      border-bottom: 1px solid var(--color-border-subtle);
      cursor: pointer;
      transition: background-color var(--motion-fast);
    }
    .table-item-row:last-child {
      border-bottom: none;
    }
    .table-item-row:hover {
      background-color: var(--color-bg-surface-hover);
    }

    .td-company {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .item-role-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--color-text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .item-company-name {
      font-size: 11px;
      color: var(--color-text-secondary);
    }

    .stage-select-compact {
      height: 26px;
      background-color: var(--color-bg-surface-2);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xs);
      font-size: 11px;
      font-weight: 500;
      color: var(--color-text-secondary);
      cursor: pointer;
    }
    .stage-select-compact:focus {
      outline: none;
      border-color: var(--color-brand-accent);
    }

    .follow-up-pill {
      font-size: 11px;
      color: var(--color-text-muted);
    }
    .follow-up-pill.due {
      color: var(--color-danger);
      font-weight: 600;
    }

    .table-icon-btn {
      width: 28px;
      height: 28px;
      border-radius: var(--radius-xs);
      border: 1px solid var(--color-border-subtle);
      background-color: var(--color-bg-surface-2);
      color: var(--color-text-secondary);
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .table-icon-btn:hover {
      color: var(--color-brand-accent);
      border-color: var(--color-border-default);
    }

    .text-emerald { color: var(--color-success); }
    .text-brand { color: var(--color-brand-accent); }
    .text-indigo { color: #6366f1; }
    .text-purple { color: #a855f7; }
    .text-amber { color: var(--color-warning); }
    .text-muted { color: var(--color-text-muted); }

    @media (max-width: 860px) {
      .funnel-metrics-bar {
        grid-template-columns: repeat(3, 1fr);
      }
      .kanban-columns-container {
        grid-template-columns: 1fr;
      }
      .table-header-row {
        display: none;
      }
      .table-item-row {
        grid-template-columns: 1fr;
        gap: var(--space-2);
      }
    }
  `],
})
export class TrackerComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly telegram = inject(TelegramService);
  private readonly toast = inject(ToastService);

  readonly allItems = signal<TrackedJobItem[]>([]);
  readonly filterStatus = signal<string>('ALL');
  readonly viewMode = signal<'kanban' | 'list'>('kanban');
  readonly isLoading = signal<boolean>(false);

  // Drawer integration
  readonly isDrawerOpen = signal<boolean>(false);
  readonly selectedJob = signal<JobSummary | null>(null);

  readonly kanbanColumns: StatusColumn[] = [
    { status: 'SAVED', label: 'Saved', dotColor: '#3B82F6' },
    { status: 'APPLIED', label: 'Applied', dotColor: '#6366F1' },
    { status: 'INTERVIEW', label: 'Interview', dotColor: '#A855F7' },
    { status: 'OFFER', label: 'Offer', dotColor: '#10B981' },
  ];

  ngOnInit(): void {
    this.loadTrackerItems();
  }

  loadTrackerItems(): void {
    this.isLoading.set(true);
    this.api.getTrackedJobs().subscribe({
      next: (items) => {
        this.allItems.set(items);
        this.isLoading.set(false);
      },
      error: (e) => {
        console.error('Failed to load tracked jobs:', e);
        this.toast.show('Failed to fetch tracker items', 'error');
        this.isLoading.set(false);
      },
    });
  }

  setViewMode(mode: 'kanban' | 'list'): void {
    this.telegram.haptic('selection');
    this.viewMode.set(mode);
  }

  selectFilterStatus(status: string): void {
    this.telegram.haptic('selection');
    this.filterStatus.set(status);
  }

  filteredItems(): TrackedJobItem[] {
    const s = this.filterStatus();
    if (s === 'ALL') return this.allItems();
    return this.allItems().filter((item) => item.status === s);
  }

  getItemsForStage(stage: ApplicationStatus): TrackedJobItem[] {
    return this.allItems().filter((item) => item.status === stage);
  }

  getCountForStatus(status: string): number {
    if (status === 'ALL') return this.allItems().length;
    return this.allItems().filter((item) => item.status === status).length;
  }

  onStatusChange(jobId: number, newStatus: ApplicationStatus): void {
    this.telegram.haptic('medium');
    this.api.updateJobStatus(jobId, newStatus).subscribe({
      next: () => {
        this.toast.show(`Role moved to ${this.formatStatus(newStatus)}`, 'success', 2000);
        this.loadTrackerItems();
      },
      error: () => this.toast.show('Failed to update stage', 'error'),
    });
  }

  advanceStatus(item: TrackedJobItem, nextStatus: ApplicationStatus): void {
    this.onStatusChange(item.job_id, nextStatus);
  }

  openDrawer(item: TrackedJobItem): void {
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
    this.selectedJob.set(null);
  }

  onDrawerStatusUpdated(event: { jobId: number; status: ApplicationStatus }): void {
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

  getScoreBand(score: number): 'emerald' | 'indigo' | 'amber' | 'muted' {
    if (score >= 80) return 'emerald';
    if (score >= 65) return 'indigo';
    if (score >= 50) return 'amber';
    return 'muted';
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
      return 'Follow-Up Due Today!';
    }
    return `Follow-Up in ${diffDays}d`;
  }
}
