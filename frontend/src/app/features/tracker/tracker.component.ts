import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { TelegramService } from '../../core/services/telegram.service';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent } from '../../core/components/icon/icon.component';
import { JobDrawerComponent } from '../../core/components/job-drawer/job-drawer.component';
import {
  UiArchitecturalMotifComponent,
  UiBadgeComponent,
  UiButtonComponent,
  UiCardComponent,
  UiEmptyStateComponent,
  UiMatchPillComponent,
  UiSkeletonComponent,
} from '../../core/components/ui';
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
    FormsModule,
    RouterLink,
    IconComponent,
    JobDrawerComponent,
    UiArchitecturalMotifComponent,
    UiBadgeComponent,
    UiButtonComponent,
    UiCardComponent,
    UiEmptyStateComponent,
    UiMatchPillComponent,
    UiSkeletonComponent,
  ],
  template: `
    <div class="tracker-pipeline-view">
      <!-- Architectural Hero Header -->
      <header class="tracker-hero">
        <ui-architectural-motif variant="header" />

        <div class="hero-inner">
          <div class="header-titles">
            <div class="title-row">
              <h1 class="page-title">Application Pipeline</h1>
              <ui-badge tone="copper" size="sm" [mono]="true">
                {{ allItems().length }} tracked
              </ui-badge>
            </div>
            <p class="page-subtitle">
              Track stage progression, follow-up deadlines, and application outcomes in one place.
            </p>
          </div>

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
                <app-icon name="grid" [size]="13" />
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
                <app-icon name="list" [size]="13" />
                <span>List</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <!-- Stage Distribution Funnel Bar -->
      <section class="funnel-metrics-bar tabular-nums" aria-label="Stage distribution">
        <button
          type="button"
          class="funnel-stat-card"
          (click)="selectFilterStatus('ALL')"
          [class.active]="filterStatus() === 'ALL'"
          [attr.aria-pressed]="filterStatus() === 'ALL'"
        >
          <span class="stat-count">{{ allItems().length }}</span>
          <span class="stat-name">Total</span>
        </button>

        <button
          type="button"
          class="funnel-stat-card"
          (click)="selectFilterStatus('SAVED')"
          [class.active]="filterStatus() === 'SAVED'"
          [attr.aria-pressed]="filterStatus() === 'SAVED'"
        >
          <span class="stat-count text-steel">{{ getCountForStatus('SAVED') }}</span>
          <span class="stat-name">Saved</span>
        </button>

        <button
          type="button"
          class="funnel-stat-card"
          (click)="selectFilterStatus('APPLIED')"
          [class.active]="filterStatus() === 'APPLIED'"
          [attr.aria-pressed]="filterStatus() === 'APPLIED'"
        >
          <span class="stat-count text-copper">{{ getCountForStatus('APPLIED') }}</span>
          <span class="stat-name">Applied</span>
        </button>

        <button
          type="button"
          class="funnel-stat-card"
          (click)="selectFilterStatus('INTERVIEW')"
          [class.active]="filterStatus() === 'INTERVIEW'"
          [attr.aria-pressed]="filterStatus() === 'INTERVIEW'"
        >
          <span class="stat-count text-amber">{{ getCountForStatus('INTERVIEW') }}</span>
          <span class="stat-name">Interviewing</span>
        </button>

        <button
          type="button"
          class="funnel-stat-card"
          (click)="selectFilterStatus('OFFER')"
          [class.active]="filterStatus() === 'OFFER'"
          [attr.aria-pressed]="filterStatus() === 'OFFER'"
        >
          <span class="stat-count text-emerald">{{ getCountForStatus('OFFER') }}</span>
          <span class="stat-name">Offer</span>
        </button>

        <button
          type="button"
          class="funnel-stat-card"
          (click)="selectFilterStatus('REJECTED')"
          [class.active]="filterStatus() === 'REJECTED'"
          [attr.aria-pressed]="filterStatus() === 'REJECTED'"
        >
          <span class="stat-count text-crimson">{{ getCountForStatus('REJECTED') + getCountForStatus('ARCHIVED') }}</span>
          <span class="stat-name">Rejected</span>
        </button>
      </section>

      <!-- Loading State -->
      @if (isLoading()) {
        <div class="skeletons-grid">
          @for (col of [1, 2, 3, 4]; track col) {
            <ui-skeleton height="280px" rounded="lg" />
          }
        </div>
      } @else if (allItems().length === 0) {
        <!-- Empty State -->
        <ui-empty-state
          icon="bookmark"
          title="Your Pipeline Is Clean"
          subtitle="Discover verified opportunities on the radar and save them to track your application journey."
        >
          <div action>
            <a routerLink="/jobs" class="find-roles-link">
              <ui-button variant="primary" size="sm">
                <app-icon name="search" [size]="13" />
                <span>Explore Opportunities</span>
              </ui-button>
            </a>
          </div>
        </ui-empty-state>
      } @else if (viewMode() === 'kanban') {
        <!-- VIEW 1: STAGE RAIL / KANBAN BOARD -->
        <section class="kanban-workspace custom-scrollbar" aria-label="Pipeline stage board">
          <div class="kanban-columns-container">
            @for (col of visibleKanbanColumns(); track col.status) {
              <div
                class="kanban-column"
                [class.is-highlighted]="filterStatus() === col.status"
                [class.is-dimmed]="filterStatus() !== 'ALL' && filterStatus() !== col.status"
              >
                <header class="column-header">
                  <div class="column-title-left">
                    <span class="column-dot" [style.background-color]="col.dotColor" aria-hidden="true"></span>
                    <span class="column-label">{{ col.label }}</span>
                  </div>

                  <div class="column-metrics-right tabular-nums">
                    @if (getCountForStatus(col.status) > 0) {
                      <span class="column-avg-pill" title="Average fit score in stage">
                        Avg {{ getAvgFitForStage(col.status) }}%
                      </span>
                    }
                    <span class="column-count-badge">{{ getCountForStatus(col.status) }}</span>
                  </div>
                </header>

                <div class="column-cards-list custom-scrollbar">
                  @if (getItemsForStage(col.status).length === 0) {
                    <div class="empty-column-slot">
                      <span>No roles in {{ col.label.toLowerCase() }}</span>
                    </div>
                  }

                  @for (item of getItemsForStage(col.status); track item.job_id) {
                    <ui-card
                      variant="subtle"
                      padding="sm"
                      [interactive]="true"
                      class="kanban-card"
                      tabindex="0"
                      role="article"
                      (click)="openDrawer(item)"
                      (keydown.enter)="openDrawer(item)"
                      (keydown.space)="$event.preventDefault(); openDrawer(item)"
                      [attr.aria-label]="item.title + ' at ' + item.company + ', ' + roundScore(item.match_score) + '% match'"
                    >
                      <div class="card-head-row">
                        <span class="company-badge-name" dir="auto">{{ item.company }}</span>
                        <ui-match-pill [score]="roundScore(item.match_score)" label="" size="sm" />
                      </div>

                      <h3 class="role-title-heading" dir="auto">{{ item.title }}</h3>

                      @if (item.follow_up_at) {
                        <div>
                          <ui-badge
                            [tone]="isFollowUpDue(item.follow_up_at) ? 'crimson' : 'glass'"
                            size="sm"
                            [mono]="true"
                          >
                            <app-icon name="clock" [size]="10" />
                            <span>{{ formatFollowUpLabel(item.follow_up_at) }}</span>
                          </ui-badge>
                        </div>
                      }

                      <div class="card-footer-actions" (click)="$event.stopPropagation()">
                        <div class="stage-advance-btn-group">
                          @if (col.status === 'SAVED') {
                            <ui-button
                              variant="secondary"
                              size="sm"
                              ariaLabel="Move to Applied"
                              (clicked)="advanceStatus(item, 'APPLIED')"
                            >
                              <span>Applied</span>
                              <app-icon name="arrow-right" [size]="11" />
                            </ui-button>
                          }
                          @if (col.status === 'APPLIED') {
                            <ui-button
                              variant="secondary"
                              size="sm"
                              ariaLabel="Move to Interviewing"
                              (clicked)="advanceStatus(item, 'INTERVIEW')"
                            >
                              <span>Interview</span>
                              <app-icon name="arrow-right" [size]="11" />
                            </ui-button>
                          }
                          @if (col.status === 'INTERVIEW') {
                            <ui-button
                              variant="primary"
                              size="sm"
                              ariaLabel="Mark as Offer"
                              (clicked)="advanceStatus(item, 'OFFER')"
                            >
                              <app-icon name="star" [size]="11" />
                              <span>Offer</span>
                            </ui-button>
                          }
                        </div>

                        @if (item.original_application_url) {
                          <a
                            [href]="item.original_application_url"
                            target="_blank"
                            rel="noopener noreferrer"
                            (click)="onOpenLink($event, item.original_application_url)"
                            class="card-external-link"
                            title="Direct portal link"
                            aria-label="Direct apply link"
                          >
                            <app-icon name="external-link" [size]="13" />
                          </a>
                        }
                      </div>
                    </ui-card>
                  }
                </div>
              </div>
            }
          </div>
        </section>
      } @else {
        <!-- VIEW 2: LIST VIEW -->
        <ui-card variant="elevated" padding="none" class="list-table-workspace">
          @if (filteredItems().length === 0) {
            <div class="list-empty-slot">
              <span>No tracked opportunities match the selected stage filter.</span>
              <ui-button variant="secondary" size="sm" (clicked)="selectFilterStatus('ALL')">
                <span>Show All Roles</span>
              </ui-button>
            </div>
          } @else {
            <div class="table-container">
              <div class="table-header-row">
                <span class="col-th">Opportunity &amp; Company</span>
                <span class="col-th">Fit Score</span>
                <span class="col-th">Current Stage</span>
                <span class="col-th">Follow-Up Alert</span>
                <span class="col-th">Link</span>
              </div>

              <div class="table-body">
                @for (item of filteredItems(); track item.job_id) {
                  <article
                    (click)="openDrawer(item)"
                    (keydown.enter)="openDrawer(item)"
                    (keydown.space)="$event.preventDefault(); openDrawer(item)"
                    class="table-item-row"
                    tabindex="0"
                    [attr.aria-label]="item.title + ' at ' + item.company"
                  >
                    <div class="col-td td-company">
                      <span class="item-role-title" dir="auto">{{ item.title }}</span>
                      <span class="item-company-name" dir="auto">{{ item.company }}</span>
                    </div>

                    <div class="col-td td-score">
                      <ui-match-pill [score]="roundScore(item.match_score)" label="" size="sm" />
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
                      @if (item.follow_up_at) {
                        <ui-badge
                          [tone]="isFollowUpDue(item.follow_up_at) ? 'crimson' : 'neutral'"
                          size="sm"
                          [mono]="true"
                        >
                          {{ formatFollowUpLabel(item.follow_up_at) }}
                        </ui-badge>
                      } @else {
                        <span class="text-muted">—</span>
                      }
                    </div>

                    <div class="col-td td-actions" (click)="$event.stopPropagation()">
                      @if (item.original_application_url) {
                        <a
                          [href]="item.original_application_url"
                          target="_blank"
                          rel="noopener noreferrer"
                          (click)="onOpenLink($event, item.original_application_url)"
                          class="table-icon-btn"
                          title="Direct link"
                          aria-label="Direct link"
                        >
                          <app-icon name="external-link" [size]="14" />
                        </a>
                      }
                    </div>
                  </article>
                }
              </div>
            </div>
          }
        </ui-card>
      }

      <!-- Job Detail Drawer Integration -->
      <app-job-drawer
        [isOpen]="isDrawerOpen()"
        [job]="selectedJob()"
        (closeDrawer)="closeDrawer()"
        (statusUpdated)="onDrawerStatusUpdated($event)"
      />
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
      max-width: 1200px;
      margin: 0 auto;
      min-width: 0;
    }

    /* Architectural Header */
    .tracker-hero {
      position: relative;
      overflow: hidden;
      border-radius: var(--radius-lg);
      background-color: var(--surface-elevated);
      border: 1px solid var(--border-hairline);
      box-shadow: var(--border-specular), var(--shadow-sm);
      padding: var(--space-5) var(--space-6);
    }

    .hero-inner {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--space-4);
      flex-wrap: wrap;
    }

    .header-titles {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .title-row {
      display: flex;
      align-items: center;
      gap: var(--space-2-5);
      flex-wrap: wrap;
    }

    .page-title {
      margin: 0;
      font-family: var(--font-display);
      font-size: var(--text-h1);
      font-weight: 700;
      letter-spacing: var(--tracking-tight);
      color: var(--ink-primary);
    }

    .page-subtitle {
      margin: 0;
      font-size: var(--text-sm);
      color: var(--ink-secondary);
      line-height: 1.5;
    }

    .segmented-control {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      background-color: var(--surface-subtle);
      border: 1px solid var(--border-hairline);
      border-radius: var(--radius-sm);
      padding: 3px;
    }

    .segment-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      min-height: 34px;
      padding: 6px 14px;
      background: transparent;
      border: 1px solid transparent;
      border-radius: var(--radius-xs);
      font-size: var(--text-xs);
      font-weight: 500;
      color: var(--ink-secondary);
      cursor: pointer;
      white-space: nowrap;
      transition:
        background-color var(--dur-fast) var(--ease-spring),
        border-color var(--dur-fast) var(--ease-spring),
        color var(--dur-fast) var(--ease-spring);
    }

    .segment-btn:hover {
      color: var(--ink-primary);
      background-color: var(--surface-hover);
    }

    .segment-btn.active {
      background-color: var(--surface-elevated);
      color: var(--ink-primary);
      border-color: var(--border-hairline);
      font-weight: 600;
      box-shadow: var(--border-specular-sm), var(--shadow-xs);
    }

    /* Funnel Metrics Bar */
    .funnel-metrics-bar {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: var(--space-2);
    }

    .funnel-stat-card {
      background-color: var(--surface-elevated);
      border: 1px solid var(--border-hairline);
      box-shadow: var(--border-specular-sm), var(--shadow-xs);
      border-radius: var(--radius-md);
      padding: var(--space-3);
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 3px;
      text-align: left;
      cursor: pointer;
      transition:
        background-color var(--dur-fast) var(--ease-spring),
        border-color var(--dur-fast) var(--ease-spring),
        transform var(--dur-fast) var(--ease-spring);
    }

    .funnel-stat-card:hover {
      background-color: var(--surface-subtle);
      border-color: var(--border-strong);
      transform: translateY(-1px);
    }

    .funnel-stat-card.active {
      border-color: var(--border-copper);
      background-color: var(--accent-copper-soft);
    }

    .stat-count {
      font-family: var(--font-mono);
      font-size: var(--text-lg);
      font-weight: 700;
      color: var(--ink-primary);
      line-height: 1.15;
    }

    .stat-name {
      font-size: var(--text-xs);
      font-weight: 500;
      color: var(--ink-muted);
    }

    .skeletons-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: var(--space-3);
    }

    .find-roles-link {
      text-decoration: none;
    }

    /* Kanban Workspace */
    .kanban-workspace {
      width: 100%;
      max-width: 100%;
      overflow-x: auto;
      padding-bottom: var(--space-3);
      -webkit-overflow-scrolling: touch;
      overscroll-behavior-x: contain;
    }

    .kanban-columns-container {
      display: grid;
      grid-template-columns: repeat(5, minmax(195px, 1fr));
      gap: var(--space-3);
      align-items: start;
    }

    .kanban-column {
      background-color: var(--surface-elevated);
      border: 1px solid var(--border-hairline);
      box-shadow: var(--border-specular), var(--shadow-xs);
      border-radius: var(--radius-lg);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      max-height: calc(100vh - 260px);
      transition:
        border-color var(--dur-fast) var(--ease-spring),
        opacity var(--dur-fast) var(--ease-spring);
    }

    .kanban-column.is-highlighted {
      border-color: var(--border-copper);
    }

    .kanban-column.is-dimmed {
      opacity: 0.52;
    }

    .kanban-column.is-dimmed:hover {
      opacity: 0.92;
    }

    .column-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      padding: var(--space-3);
      border-bottom: 1px solid var(--border-hairline);
      background-color: var(--surface-subtle);
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
      font-family: var(--font-display);
      font-size: var(--text-xs);
      font-weight: 600;
      color: var(--ink-primary);
    }

    .column-metrics-right {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      flex-shrink: 0;
    }

    .column-avg-pill {
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 500;
      color: var(--ink-muted);
      background-color: var(--surface-elevated);
      border: 1px solid var(--border-hairline);
      border-radius: var(--radius-xs);
      padding: 2px 5px;
    }

    .column-count-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 22px;
      height: 20px;
      padding: 0 5px;
      border-radius: var(--radius-xs);
      background-color: var(--surface-muted);
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--ink-primary);
      font-weight: 600;
    }

    .column-cards-list {
      padding: var(--space-2-5);
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      overflow-y: auto;
    }

    .empty-column-slot {
      padding: var(--space-5) var(--space-2);
      text-align: center;
      font-size: var(--text-xs);
      color: var(--ink-muted);
    }

    .kanban-card {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      outline: none;
    }

    .kanban-card:focus-visible {
      outline: 2px solid var(--accent-copper);
      outline-offset: 2px;
    }

    .card-head-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
    }

    .company-badge-name {
      font-size: var(--text-xs);
      font-weight: 600;
      color: var(--ink-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
      flex: 1;
    }

    .role-title-heading {
      margin: 0;
      font-family: var(--font-display);
      font-size: var(--text-sm);
      font-weight: 600;
      letter-spacing: var(--tracking-snug);
      color: var(--ink-primary);
      line-height: 1.35;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .card-footer-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      padding-top: var(--space-2);
      border-top: 1px solid var(--border-hairline);
    }

    .stage-advance-btn-group {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .card-external-link {
      color: var(--ink-muted);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 32px;
      min-height: 32px;
      border-radius: var(--radius-xs);
      border: 1px solid var(--border-hairline);
      background-color: var(--surface-elevated);
      transition:
        color var(--dur-fast) var(--ease-spring),
        border-color var(--dur-fast) var(--ease-spring);
    }

    .card-external-link:hover {
      color: var(--accent-copper-text);
      border-color: var(--border-copper);
    }

    /* List Table Workspace */
    .list-table-workspace {
      display: block;
      width: 100%;
      overflow: hidden;
    }

    .list-empty-slot {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-8) var(--space-4);
      font-size: var(--text-sm);
      color: var(--ink-secondary);
      text-align: center;
    }

    .table-container {
      width: 100%;
      display: flex;
      flex-direction: column;
    }

    .table-header-row {
      display: grid;
      grid-template-columns: 2fr 110px 156px 150px 64px;
      padding: var(--space-3) var(--space-4);
      background-color: var(--surface-subtle);
      border-bottom: 1px solid var(--border-hairline);
      font-size: var(--text-xs);
      font-weight: 600;
      color: var(--ink-muted);
    }

    .table-body {
      display: flex;
      flex-direction: column;
    }

    .table-item-row {
      display: grid;
      grid-template-columns: 2fr 110px 156px 150px 64px;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-3) var(--space-4);
      border-bottom: 1px solid var(--border-hairline);
      cursor: pointer;
      transition: background-color var(--dur-fast) var(--ease-spring);
    }

    .table-item-row:last-child {
      border-bottom: none;
    }

    .table-item-row:hover {
      background-color: var(--surface-hover);
    }

    .td-company {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .item-role-title {
      font-family: var(--font-display);
      font-size: var(--text-sm);
      font-weight: 600;
      color: var(--ink-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .item-company-name {
      font-size: var(--text-xs);
      color: var(--ink-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .stage-select-compact {
      height: 34px;
      width: 100%;
      max-width: 146px;
      padding: 0 10px;
      background-color: var(--surface-subtle);
      border: 1px solid var(--border-hairline);
      border-radius: var(--radius-xs);
      font-size: var(--text-xs);
      font-weight: 500;
      color: var(--ink-primary);
      cursor: pointer;
    }

    .stage-select-compact:focus {
      outline: none;
      border-color: var(--accent-copper);
      box-shadow: 0 0 0 2px var(--accent-copper-focus);
    }

    .table-icon-btn {
      min-width: 34px;
      min-height: 34px;
      border-radius: var(--radius-xs);
      border: 1px solid var(--border-hairline);
      background-color: var(--surface-subtle);
      color: var(--ink-secondary);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition:
        color var(--dur-fast) var(--ease-spring),
        border-color var(--dur-fast) var(--ease-spring);
    }

    .table-icon-btn:hover {
      color: var(--accent-copper-text);
      border-color: var(--border-copper);
    }

    .text-emerald { color: var(--semantic-emerald-text); }
    .text-copper { color: var(--accent-copper-text); }
    .text-amber { color: var(--semantic-amber-text); }
    .text-crimson { color: var(--semantic-crimson-text); }
    .text-steel { color: var(--semantic-steel-text); }
    .text-muted { color: var(--ink-muted); }

    /* Mobile Stacked / Clean Ergonomics (<= 860px, 360x800) */
    @media (max-width: 860px) {
      .tracker-hero {
        padding: var(--space-4);
      }

      .funnel-metrics-bar {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .funnel-stat-card {
        min-height: 54px;
      }

      .segment-btn {
        min-height: 44px;
        padding: 8px 16px;
      }

      .skeletons-grid {
        grid-template-columns: minmax(0, 1fr);
      }

      .kanban-workspace {
        overflow-x: visible;
        padding-bottom: 0;
      }

      .kanban-columns-container {
        grid-template-columns: minmax(0, 1fr);
      }

      .kanban-column {
        max-height: none;
      }

      .card-external-link {
        min-width: 44px;
        min-height: 44px;
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
        padding: var(--space-3);
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
        font-size: var(--text-sm);
      }

      .table-icon-btn {
        min-width: 44px;
        min-height: 44px;
      }
    }

    @media (max-width: 420px) {
      .funnel-metrics-bar {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `],
})
export class TrackerComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly telegram = inject(TelegramService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly allItems = signal<TrackedJobItem[]>([]);
  readonly filterStatus = signal<string>('ALL');
  readonly viewMode = signal<'kanban' | 'list'>('kanban');
  readonly isLoading = signal<boolean>(false);
  readonly pendingJobIds = signal<Set<number>>(new Set());

  readonly isDrawerOpen = signal<boolean>(false);
  readonly selectedJob = signal<JobSummary | null>(null);

  readonly kanbanColumns: StatusColumn[] = [
    { status: 'SAVED', label: 'Saved', dotColor: 'var(--semantic-steel)' },
    { status: 'APPLIED', label: 'Applied', dotColor: 'var(--accent-copper)' },
    { status: 'INTERVIEW', label: 'Interviewing', dotColor: 'var(--semantic-amber)' },
    { status: 'OFFER', label: 'Offer', dotColor: 'var(--semantic-emerald)' },
    { status: 'REJECTED', label: 'Rejected', dotColor: 'var(--semantic-crimson)' },
  ];

  ngOnInit(): void {
    this.loadTrackerItems();
  }

  loadTrackerItems(showSpinner = true): void {
    if (showSpinner) {
      this.isLoading.set(true);
    }
    this.api
      .getTrackedJobs()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.allItems.set(items);
          this.isLoading.set(false);
        },
        error: (e: unknown) => {
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

  visibleKanbanColumns(): StatusColumn[] {
    const filter = this.filterStatus();
    if (filter === 'ALL') {
      return this.kanbanColumns;
    }
    return this.kanbanColumns.filter((c) => c.status === filter);
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
    if (stage === 'REJECTED') {
      return this.allItems().filter(
        (item) => item.status === 'REJECTED' || item.status === 'ARCHIVED'
      );
    }
    return this.allItems().filter((item) => item.status === stage);
  }

  getCountForStatus(status: string): number {
    if (status === 'ALL') return this.allItems().length;
    if (status === 'REJECTED') {
      return this.allItems().filter(
        (item) => item.status === 'REJECTED' || item.status === 'ARCHIVED'
      ).length;
    }
    return this.allItems().filter((item) => item.status === status).length;
  }

  getAvgFitForStage(stage: ApplicationStatus): number {
    const items = this.getItemsForStage(stage);
    if (items.length === 0) return 0;
    const totalScore = items.reduce((acc, item) => acc + (item.match_score || 0), 0);
    return Math.round(totalScore / items.length);
  }

  onStatusChange(jobId: number, newStatus: ApplicationStatus): void {
    if (this.pendingJobIds().has(jobId)) return;

    const prevItems = this.allItems();
    this.telegram.haptic('medium');

    this.pendingJobIds.update((set) => {
      const next = new Set(set);
      next.add(jobId);
      return next;
    });

    this.applyStatusLocally(jobId, newStatus);

    this.api
      .updateJobStatus(jobId, newStatus)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.clearPendingJobId(jobId);
          this.toast.show(`Role moved to ${this.formatStatus(newStatus)}`, 'success', 2000);
        },
        error: () => {
          this.clearPendingJobId(jobId);
          this.allItems.set(prevItems);
          this.toast.show('Failed to update stage', 'error');
        },
      });
  }

  private clearPendingJobId(jobId: number): void {
    this.pendingJobIds.update((set) => {
      const next = new Set(set);
      next.delete(jobId);
      return next;
    });
  }

  private applyStatusLocally(jobId: number, status: ApplicationStatus): void {
    if (status === 'DISCOVERED') {
      this.allItems.update((list) => list.filter((item) => item.job_id !== jobId));
    } else {
      this.allItems.update((list) =>
        list.map((item) => (item.job_id === jobId ? { ...item, status } : item))
      );
    }
    if (this.selectedJob()?.id === jobId) {
      this.selectedJob.update((cur) => (cur ? { ...cur, tracker_status: status } : cur));
    }
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
    const exists = this.allItems().some((item) => item.job_id === event.jobId);
    if (exists) {
      this.applyStatusLocally(event.jobId, event.status);
    } else {
      this.loadTrackerItems(false);
    }
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
      return 'Due Today';
    }
    return `In ${diffDays}d`;
  }
}
