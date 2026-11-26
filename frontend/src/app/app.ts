import { Component, DestroyRef, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TelegramService } from './core/services/telegram.service';
import { ThemeService } from './core/services/theme.service';
import { ToastService } from './core/services/toast.service';
import { ApiService } from './core/services/api.service';
import { IconComponent, IconName } from './core/components/icon/icon.component';
import {
  UiBrandMarkComponent,
  UiButtonComponent,
} from './core/components/ui';

interface NavItem {
  path: string;
  label: string;
  mobileLabel: string;
  icon: IconName;
  shortcut: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    IconComponent,
    UiBrandMarkComponent,
    UiButtonComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  readonly telegram = inject(TelegramService);
  readonly theme = inject(ThemeService);
  readonly toastService = inject(ToastService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly isScanning = signal<boolean>(false);

  readonly navItems: NavItem[] = [
    { path: '/overview', label: 'Overview', mobileLabel: 'Overview', icon: 'layers', shortcut: 'G O' },
    { path: '/jobs', label: 'Opportunities', mobileLabel: 'Jobs', icon: 'briefcase', shortcut: 'G J' },
    { path: '/tracker', label: 'Tracker', mobileLabel: 'Tracker', icon: 'bookmark', shortcut: 'G T' },
    { path: '/profile', label: 'Profile', mobileLabel: 'Profile', icon: 'user', shortcut: 'G P' },
    { path: '/settings', label: 'Settings', mobileLabel: 'Settings', icon: 'settings', shortcut: 'G S' },
  ];

  private focusListener?: () => void;
  private keydownListener?: (e: KeyboardEvent) => void;
  private pendingSequence: string | null = null;
  private lastKeyTimestamp = 0;

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      if (this.telegram.isTelegram()) {
        window.focus();

        // Keep iframe focused inside Telegram Desktop wrappers for native wheel/trackpad events
        this.focusListener = () => window.focus();
        window.addEventListener('pointerdown', this.focusListener, { passive: true });
      }

      // Global keyboard shortcut sequence listener (e.g. G O, G J, G T, G P, G S)
      this.keydownListener = (e: KeyboardEvent) => this.handleGlobalKeyDown(e);
      window.addEventListener('keydown', this.keydownListener);
    }
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      if (this.focusListener) {
        window.removeEventListener('pointerdown', this.focusListener);
      }
      if (this.keydownListener) {
        window.removeEventListener('keydown', this.keydownListener);
      }
    }
  }

  private handleGlobalKeyDown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (target) {
      const tag = target.tagName?.toLowerCase();
      if (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        target.isContentEditable
      ) {
        return;
      }
    }

    if (e.ctrlKey || e.metaKey || e.altKey) {
      return;
    }

    const key = e.key.toLowerCase();
    const now = Date.now();

    if (this.pendingSequence === 'g' && now - this.lastKeyTimestamp < 1200) {
      this.pendingSequence = null;
      const routes: Record<string, string> = {
        o: '/overview',
        j: '/jobs',
        t: '/tracker',
        p: '/profile',
        s: '/settings',
      };

      if (routes[key]) {
        e.preventDefault();
        this.telegram.haptic('selection');
        this.router.navigate([routes[key]]);
        return;
      }
    }

    if (key === 'g') {
      this.pendingSequence = 'g';
      this.lastKeyTimestamp = now;
    } else {
      this.pendingSequence = null;
    }
  }

  toggleTheme(): void {
    this.telegram.haptic('selection');
    this.theme.toggleTheme();
    this.toastService.show(
      `Switched to ${this.theme.isDark() ? 'Studio Obsidian' : 'Daylight Pearl'}`,
      'info',
      2000
    );
  }

  onTabClick(): void {
    this.telegram.haptic('selection');
  }

  triggerQuickScan(): void {
    if (this.isScanning()) return;
    this.isScanning.set(true);
    this.telegram.haptic('medium');
    this.toastService.show('Autonomous Agent initiating feed sweep...', 'info', 2500);

    this.api
      .triggerRun(true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.isScanning.set(false);
          this.telegram.haptic('success');
          if (res?.status === 'accepted') {
            this.toastService.show(
              res.message || 'Background feed sweep started.',
              'info',
              3000
            );
          } else {
            this.toastService.show('Sweep completed successfully! Feeds verified.', 'success');
          }
        },
        error: () => {
          this.isScanning.set(false);
          this.telegram.haptic('error');
          this.toastService.show('Failed to initiate feed sweep. Please try again.', 'error');
        },
      });
  }
}
