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

        <!-- View Switcher -->
        <div class="header-controls">
          <div class="segmented-control" role="tablist" aria-label="Pipeline view layout">
            <button
              type="button"
              role="tab"
              [attr.aria-selected]="viewMode() === 'kanban'"
              (click)="setViewMode('kanban')"
              [class.active]="viewMode() === 'kanban'"
              class="segment-btn"
            >
              <app-icon name="grid" [size]="13"></app-icon>
              <span>Board</span>
            </button>
            <button
              type="button"
              role="tab"
              [attr.aria-selected]="viewMode() === 'list'"
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
        <button
          type="button"
          class="funnel-stat-card"
          (click)="selectFilterStatus('ALL')"
          [class.active]="filterStatus() === 'ALL'"
          [attr.aria-pressed]="filterStatus() === 'ALL'"
        >
          <span class="stat-count">{{ allItems().length }}</span>
          <span class="stat-name">Total Roles</span>
        </button>
        <button
          type="button"
          class="funnel-stat-card"
          (click)="selectFilterStatus('SAVED')"
          [class.active]="filterStatus() === 'SAVED'"
          [attr.aria-pressed]="filterStatus() === 'SAVED'"
        >
          <span class="stat-count text-brand">{{ getCountForStatus('SAVED') }}</span>
          <span class="stat-name">Saved</span>
        </button>
        <button
          type="button"
          class="funnel-stat-card"
          (click)="selectFilterStatus('APPLIED')"
          [class.active]="filterStatus() === 'APPLIED'"
          [attr.aria-pressed]="filterStatus() === 'APPLIED'"
        >
          <span class="stat-count text-indigo">{{ getCountForStatus('APPLIED') }}</span>
          <span class="stat-name">Applied</span>
        </button>
        <button
          type="button"
          class="funnel-stat-card"
          (click)="selectFilterStatus('INTERVIEW')"
          [class.active]="filterStatus() === 'INTERVIEW'"
          [attr.aria-pressed]="filterStatus() === 'INTERVIEW'"
        >
          <span class="stat-count text-purple">{{ getCountForStatus('INTERVIEW') }}</span>
          <span class="stat-name">Interviews</span>
        </button>
        <button
          type="button"
          class="funnel-stat-card"
          (click)="selectFilterStatus('OFFER')"
          [class.active]="filterStatus() === 'OFFER'"
          [attr.aria-pressed]="filterStatus() === 'OFFER'"
        >
          <span class="stat-count text-emerald">{{ getCountForStatus('OFFER') }}</span>
          <span class="stat-name">Offers</span>
        </button>
        <button
          type="button"
          class="funnel-stat-card"
          (click)="selectFilterStatus('REJECTED')"
          [class.active]="filterStatus() === 'REJECTED'"
          [attr.aria-pressed]="filterStatus() === 'REJECTED'"
        >
          <span class="stat-count text-muted">{{ getCountForStatus('REJECTED') + getCountForStatus('ARCHIVED') }}</span>
          <span class="stat-name">Archived</span>
        </button>
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
          <div
            *ngFor="let col of kanbanColumns"
            class="kanban-column"
            [class.is-highlighted]="filterStatus() === col.status"
            [class.is-dimmed]="filterStatus() !== 'ALL' && filterStatus() !== col.status && filterStatus() !== 'REJECTED'"
          >
            <header class="column-header">
              <div class="column-title-left">
                <span class="column-dot" [style.background-color]="col.dotColor" aria-hidden="true"></span>
                <span class="column-label">{{ col.label }}</span>
              </div>
              <div class="column-metrics-right tabular-nums">
                <span
                  *ngIf="getCountForStatus(col.status) > 0"
                  class="column-avg-pill"
                  title="Average fit score in stage"
                >
                  Avg {{ getAvgFitForStage(col.status) }}%
                </span>
                <span class="column-count-badge">{{ getCountForStatus(col.status) }}</span>
              </div>
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
                (keydown.space)="$event.preventDefault(); openDrawer(item)"
                [attr.aria-label]="item.title + ' at ' + item.company + ', ' + roundScore(item.match_score) + '% match'"
              >
                <!-- Card Header -->
                <div class="card-head-row">
                  <span class="company-badge-name" dir="auto">{{ item.company }}</span>
                  <span
                    class="score-pill tabular-nums"
                    [attr.data-band]="getScoreBand(item.match_score)"
                  >
                    {{ roundScore(item.match_score) }}%
                  </span>
                </div>

                <h3 class="role-title-heading" dir="auto">{{ item.title }}</h3>

                <!-- Follow-Up Alert Pill (when due or active) -->
                <div
                  *ngIf="item.follow_up_at"
                  class="follow-up-badge tabular-nums"
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
                      <span>Applied</span>
                      <app-icon name="arrow-right" [size]="11"></app-icon>
                    </button>

                    <button
                      *ngIf="col.status === 'APPLIED'"
                      type="button"
                      (click)="advanceStatus(item, 'INTERVIEW')"
                      class="advance-action-btn"
                      title="Move to Interview"
                    >
                      <span>Interview</span>
                      <app-icon name="arrow-right" [size]="11"></app-icon>
                    </button>

                    <button
                      *ngIf="col.status === 'INTERVIEW'"
                      type="button"
                      (click)="advanceStatus(item, 'OFFER')"
                      class="advance-action-btn offer"
                      title="Mark as Offer"
                    >
                      <app-icon name="star" [size]="11"></app-icon>
                      <span>Offer</span>
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
                    <app-icon name="external-link" [size]="13"></app-icon>
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
        <div *ngIf="filteredItems().length === 0" class="list-empty-slot">
          <span>No tracked opportunities match the selected stage filter.</span>
          <button type="button" (click)="selectFilterStatus('ALL')" class="reset-stage-btn">
            Show All Roles
          </button>
        </div>

        <div *ngIf="filteredItems().length > 0" class="table-container">
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
              (keydown.space)="$event.preventDefault(); openDrawer(item)"
              [attr.aria-label]="item.title + ' at ' + item.company"
            >
              <div class="col-td td-company">
                <span class="item-role-title" dir="auto">{{ item.title }}</span>
                <span class="item-company-name" dir="auto">{{ item.company }}</span>
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
                  <option value="OFFER">Offer</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>

              <div class="col-td td-followup tabular-nums">
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
                  <app-icon name="external-link" [size]="14"></app-icon>
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
      min-width: 0;
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
      gap: 3px;
    }

    .title-row {
      display: flex;
      align-items: center;
      gap: var(--space-2-5);
      flex-wrap: wrap;
    }

    .page-title {
      margin: 0;
      font-size: var(--text-2xl);
      font-weight: 700;
      letter-spacing: -0.03em;
      color: var(--text-primary);
    }

    .page-subtitle {
      margin: 0;
      font-size: var(--text-sm);
      color: var(--text-secondary);
      line-height: 1.45;
    }

    /* Recessed Track Segmented Control */
    .segmented-control {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      background-color: var(--bg-surface-2);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      padding: 3px;
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.2);
    }

    .segment-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 6px 13px;
      background: transparent;
      border: 1px solid transparent;
      border-radius: var(--radius-xs);
      font-size: 12px;
      font-weight: 500;
      color: var(--text-secondary);
      cursor: pointer;
      user-select: none;
      transition: all var(--motion-fast);
      white-space: nowrap;
    }
    .segment-btn:hover {
      color: var(--text-primary);
      background-color: var(--bg-surface-hover);
    }
    .segment-btn:active {
      transform: scale(0.98);
    }
    .segment-btn.active {
      background-color: var(--bg-surface-1);
      color: var(--text-primary);
      border-color: var(--border-default);
      font-weight: 600;
      box-shadow: var(--surface-highlight-sm), var(--shadow-xs);
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
      background-color: var(--bg-surface-1);
      border: 1px solid var(--border-default);
      box-shadow: var(--surface-highlight), var(--shadow-xs);
      border-radius: var(--radius-xs);
      padding: 9px 11px;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
      text-align: left;
      cursor: pointer;
      transition: all var(--motion-fast);
    }
    .funnel-stat-card:hover {
      background-color: var(--bg-surface-2);
      border-color: var(--border-strong);
      box-shadow: var(--surface-highlight-hover), var(--shadow-sm);
      transform: translateY(-1px);
    }
    .funnel-stat-card:active {
      transform: scale(0.98);
    }
    .funnel-stat-card.active {
      border-color: var(--brand-primary);
      background-color: var(--brand-bg-subtle);
      box-shadow: inset 0 0 0 1px var(--brand-border-subtle), var(--surface-highlight-sm);
    }

    .stat-count {
      font-size: 17px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text-primary);
      line-height: 1.2;
    }
    .stat-name {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-tertiary);
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
      padding: 7px 14px;
      background-color: var(--brand-primary);
      border: 1px solid var(--brand-primary);
      box-shadow: var(--surface-highlight-sm);
      color: #ffffff;
      border-radius: var(--radius-xs);
      font-size: 12px;
      font-weight: 600;
      text-decoration: none;
      transition: all var(--motion-fast);
    }
    .find-roles-btn:hover {
      background-color: var(--brand-primary-hover);
      box-shadow: var(--shadow-glow-brand);
    }
    .find-roles-btn:active {
      transform: scale(0.98);
    }

    /* ==========================================================================
       Kanban Board Workspace
       ========================================================================== */
    .kanban-workspace {
      width: 100%;
      overflow-x: auto;
      padding-bottom: var(--space-3);
      -webkit-overflow-scrolling: touch;
      overscroll-behavior-x: contain;
    }

    .kanban-columns-container {
      display: grid;
      grid-template-columns: repeat(4, minmax(260px, 1fr));
      gap: var(--space-3);
      align-items: start;
    }

    .kanban-column {
      background-color: var(--bg-surface-1);
      border: 1px solid var(--border-default);
      box-shadow: var(--surface-highlight), var(--shadow-xs);
      border-radius: var(--radius-sm);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      max-height: calc(100vh - 240px);
      transition: border-color var(--motion-fast), opacity var(--motion-fast), box-shadow var(--motion-fast);
    }
    .kanban-column.is-highlighted {
      border-color: var(--brand-primary);
      box-shadow: inset 0 0 0 1px var(--brand-border-subtle), var(--surface-highlight), var(--shadow-sm);
    }
    .kanban-column.is-dimmed {
      opacity: 0.52;
    }
    .kanban-column.is-dimmed:hover {
      opacity: 0.9;
    }

    .column-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      padding: 9px 12px;
      border-bottom: 1px solid var(--border-subtle);
      background-color: var(--bg-surface-2);
      box-shadow: var(--surface-highlight-sm);
    }

    .column-title-left {
      display: flex;
      align-items: center;
      gap: 7px;
      min-width: 0;
    }
    .column-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .column-label {
      font-size: 12px;
      font-weight: 600;
      letter-spacing: -0.01em;
      color: var(--text-primary);
    }

    .column-metrics-right {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .column-avg-pill {
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 600;
      color: var(--text-secondary);
      background-color: var(--bg-surface-1);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-xs);
      padding: 1px 6px;
    }
    .column-count-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      height: 18px;
      padding: 0 5px;
      border-radius: var(--radius-xs);
      background-color: var(--bg-surface-3);
      font-size: 11px;
      color: var(--text-primary);
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
      padding: var(--space-5) var(--space-2);
      text-align: center;
      font-size: 11px;
      color: var(--text-tertiary);
    }

    /* Kanban Card */
    .kanban-card {
      background-color: var(--bg-surface-2);
      border: 1px solid var(--border-default);
      box-shadow: var(--surface-highlight-sm);
      border-radius: var(--radius-xs);
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 7px;
      cursor: pointer;
      transition: all var(--motion-fast);
    }
    .kanban-card:hover {
      background-color: var(--bg-surface-3);
      border-color: var(--border-strong);
      box-shadow: var(--surface-highlight-hover), var(--shadow-sm);
      transform: translateY(-1px);
    }
    .kanban-card:active {
      transform: scale(0.985);
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
      color: var(--text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
      flex: 1;
    }

    .score-pill {
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 3px;
      border: 1px solid var(--border-default);
      background-color: var(--bg-surface-1);
      box-shadow: var(--surface-highlight-sm);
      flex-shrink: 0;
    }
    .score-pill[data-band="emerald"] {
      border-color: var(--emerald-border);
      background-color: var(--emerald-bg);
      color: var(--emerald-400);
    }
    .score-pill[data-band="indigo"] {
      border-color: var(--brand-border-subtle);
      background-color: var(--brand-bg-subtle);
      color: var(--brand-accent);
    }
    .score-pill[data-band="amber"] {
      border-color: var(--amber-border);
      background-color: var(--amber-bg);
      color: var(--amber-400);
    }
    .score-pill[data-band="muted"] {
      color: var(--text-tertiary);
    }

    .role-title-heading {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: -0.015em;
      color: var(--text-primary);
      line-height: 1.38;
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
      align-self: flex-start;
      font-size: 10px;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 3px;
      background-color: var(--sky-bg);
      border: 1px solid var(--sky-border);
      color: var(--sky-400);
    }
    .follow-up-badge.due {
      background-color: var(--rose-bg);
      border-color: var(--rose-border);
      color: var(--rose-400);
    }

    /* Card Footer Actions */
    .card-footer-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 7px;
      border-top: 1px solid var(--border-subtle);
      margin-top: 2px;
    }

    .stage-advance-btn-group {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .advance-action-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      border-radius: var(--radius-xs);
      font-size: 11px;
      font-weight: 600;
      background-color: var(--bg-surface-1);
      border: 1px solid var(--border-default);
      box-shadow: var(--surface-highlight-sm);
      color: var(--text-secondary);
      cursor: pointer;
      transition: all var(--motion-fast);
    }
    .advance-action-btn:hover {
      background-color: var(--brand-bg-subtle);
      border-color: var(--brand-border-subtle);
      color: var(--brand-accent);
    }
    .advance-action-btn:active {
      transform: scale(0.97);
    }
    .advance-action-btn.offer {
      color: var(--emerald-400);
      border-color: var(--emerald-border);
      background-color: var(--emerald-bg);
    }

    .card-external-link {
      color: var(--text-tertiary);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: var(--radius-xs);
      border: 1px solid transparent;
      transition: all var(--motion-fast);
    }
    .card-external-link:hover {
      color: var(--brand-accent);
      background-color: var(--bg-surface-1);
      border-color: var(--border-default);
    }
    .card-external-link:active {
      transform: scale(0.96);
    }

    /* ==========================================================================
       List Table Workspace
       ========================================================================== */
    .list-table-workspace {
      width: 100%;
      background-color: var(--bg-surface-1);
      border: 1px solid var(--border-default);
      box-shadow: var(--surface-highlight), var(--shadow-xs);
      border-radius: var(--radius-sm);
      overflow: hidden;
    }

    .list-empty-slot {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2-5);
      padding: var(--space-8) var(--space-4);
      font-size: var(--text-sm);
      color: var(--text-secondary);
      text-align: center;
    }
    .reset-stage-btn {
      padding: 6px 12px;
      border-radius: var(--radius-xs);
      border: 1px solid var(--border-default);
      background-color: var(--bg-surface-2);
      box-shadow: var(--surface-highlight-sm);
      color: var(--text-primary);
      font-size: var(--text-xs);
      font-weight: 600;
      cursor: pointer;
      transition: all var(--motion-fast);
    }
    .reset-stage-btn:hover {
      background-color: var(--bg-surface-3);
      border-color: var(--border-strong);
    }
    .reset-stage-btn:active {
      transform: scale(0.98);
    }

    .table-container {
      width: 100%;
      display: flex;
      flex-direction: column;
    }

    .table-header-row {
      display: grid;
      grid-template-columns: 2fr 100px 148px 150px 64px;
      padding: 9px 14px;
      background-color: var(--bg-surface-2);
      border-bottom: 1px solid var(--border-default);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-tertiary);
    }

    .table-body {
      display: flex;
      flex-direction: column;
    }

    .table-item-row {
      display: grid;
      grid-template-columns: 2fr 100px 148px 150px 64px;
      align-items: center;
      gap: var(--space-2);
      padding: 10px 14px;
      border-bottom: 1px solid var(--border-subtle);
      cursor: pointer;
      transition: background-color var(--motion-fast);
    }
    .table-item-row:last-child {
      border-bottom: none;
    }
    .table-item-row:hover {
      background-color: var(--bg-surface-hover);
    }
    .table-item-row:active {
      background-color: var(--bg-surface-active);
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
      letter-spacing: -0.01em;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .item-company-name {
      font-size: 11px;
      color: var(--text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .stage-select-compact {
      height: 30px;
      width: 100%;
      max-width: 140px;
      padding: 0 8px;
      background-color: var(--bg-surface-2);
      border: 1px solid var(--border-default);
      box-shadow: var(--surface-highlight-sm);
      border-radius: var(--radius-xs);
      font-size: 11px;
      font-weight: 500;
      color: var(--text-primary);
      cursor: pointer;
      transition: border-color var(--motion-fast), box-shadow var(--motion-fast);
    }
    .stage-select-compact:hover {
      border-color: var(--border-strong);
    }
    .stage-select-compact:focus {
      outline: none;
      border-color: var(--brand-primary);
      box-shadow: 0 0 0 2px var(--brand-focus-ring);
    }

    .follow-up-pill {
      font-size: 11px;
      color: var(--text-secondary);
    }
    .follow-up-pill.due {
      color: var(--rose-400);
      font-weight: 600;
    }

    .table-icon-btn {
      width: 30px;
      height: 30px;
      border-radius: var(--radius-xs);
      border: 1px solid var(--border-default);
      box-shadow: var(--surface-highlight-sm);
      background-color: var(--bg-surface-2);
      color: var(--text-secondary);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all var(--motion-fast);
    }
    .table-icon-btn:hover {
      color: var(--brand-accent);
      background-color: var(--bg-surface-3);
      border-color: var(--border-strong);
    }
    .table-icon-btn:active {
      transform: scale(0.96);
    }

    .text-emerald { color: var(--emerald-400); }
    .text-brand { color: var(--brand-accent); }
    .text-indigo { color: var(--brand-primary); }
    .text-purple { color: #c084fc; }
    .text-amber { color: var(--amber-400); }
    .text-muted { color: var(--text-tertiary); }

    @media (max-width: 860px) {
      .funnel-metrics-bar {
        grid-template-columns: repeat(3, 1fr);
      }
      .funnel-stat-card {
        min-height: 52px;
      }
      .segment-btn {
        min-height: 44px;
        padding: 8px 16px;
      }
      .kanban-workspace {
        scroll-snap-type: x proximity;
        margin: 0 calc(var(--space-1) * -1);
        padding: 0 var(--space-1) var(--space-3) var(--space-1);
      }
      .kanban-columns-container {
        grid-template-columns: repeat(4, minmax(272px, 84vw));
      }
      .kanban-column {
        scroll-snap-align: start;
        max-height: 64vh;
      }
      .advance-action-btn {
        min-height: 44px;
        padding: 0 12px;
      }
      .card-external-link {
        width: 44px;
        height: 44px;
      }
      .table-header-row {
        display: none;
      }
      .table-item-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2-5);
        padding: 12px;
      }
      .td-company {
        flex: 1 1 100%;
      }
      .item-role-title {
        white-space: normal;
        line-height: 1.35;
      }
      .td-stage {
        flex: 1 1 140px;
      }
      .stage-select-compact {
        min-height: 44px;
        max-width: none;
        font-size: 12px;
      }
      .table-icon-btn {
        width: 44px;
        height: 44px;
      }
    }

    @media (max-width: 400px) {
      .funnel-metrics-bar {
        grid-template-columns: repeat(2, 1fr);
      }
      .kanban-columns-container {
        grid-template-columns: repeat(4, minmax(260px, 86vw));
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
    { status: 'SAVED', label: 'Saved', dotColor: '#38BDF8' },
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
    if (status === 'REJECTED' && this.viewMode() === 'kanban') {
      this.viewMode.set('list');
    }
  }

  filteredItems(): TrackedJobItem[] {
    const s = this.filterStatus();
    if (s === 'ALL') return this.allItems();
    if (s === 'REJECTED') {
      return this.allItems().filter(
        (item) => item.status === 'REJECTED' || item.status === 'ARCHIVED'
      );
    }
    return this.allItems().filter((item) => item.status === s);
  }

  getItemsForStage(stage: ApplicationStatus): TrackedJobItem[] {
    return this.allItems().filter((item) => item.status === stage);
  }

  getCountForStatus(status: string): number {
    if (status === 'ALL') return this.allItems().length;
    return this.allItems().filter((item) => item.status === status).length;
  }

  getAvgFitForStage(stage: ApplicationStatus): number {
    const items = this.getItemsForStage(stage);
    if (items.length === 0) return 0;
    const totalScore = items.reduce((acc, item) => acc + (item.match_score || 0), 0);
    return Math.round(totalScore / items.length);
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
