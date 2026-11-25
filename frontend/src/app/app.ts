import { Component, DestroyRef, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TelegramService } from './core/services/telegram.service';
import { ThemeService } from './core/services/theme.service';
import { ToastService } from './core/services/toast.service';
import { ApiService } from './core/services/api.service';
import { IconComponent, IconName } from './core/components/icon/icon.component';

interface NavItem {
  path: string;
  label: string;
  icon: IconName;
  shortcut: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    IconComponent,
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
    { path: '/overview', label: 'Overview', icon: 'layers', shortcut: 'G O' },
    { path: '/jobs', label: 'Opportunities', icon: 'briefcase', shortcut: 'G J' },
    { path: '/tracker', label: 'Tracker', icon: 'bookmark', shortcut: 'G T' },
    { path: '/profile', label: 'Profile', icon: 'user', shortcut: 'G P' },
    { path: '/settings', label: 'Settings', icon: 'settings', shortcut: 'G S' },
  ];

  private focusListener?: () => void;
  private wheelListener?: (e: WheelEvent) => void;
  private keydownListener?: (e: KeyboardEvent) => void;
  private pendingSequence: string | null = null;
  private lastKeyTimestamp = 0;

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      window.focus();

      // Ensure iframe retains focus for mouse wheel events on Telegram Desktop
      this.focusListener = () => window.focus();
      window.addEventListener('mouseenter', this.focusListener, { passive: true });
      window.addEventListener('pointerdown', this.focusListener, { passive: true });

      // Active mouse wheel fallback for Telegram Desktop / CEF iframe wrappers
      this.wheelListener = (e: WheelEvent) => {
        let target = e.target as HTMLElement | null;
        let insideScrollable = false;
        while (target && target !== document.body && target !== document.documentElement) {
          const style = window.getComputedStyle(target);
          if (
            (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
            target.scrollHeight > target.clientHeight
          ) {
            insideScrollable = true;
            break;
          }
          target = target.parentElement;
        }

        if (!insideScrollable) {
          const before = window.scrollY;
          requestAnimationFrame(() => {
            if (window.scrollY === before && Math.abs(e.deltaY) > 0) {
              window.scrollBy({ top: e.deltaY, behavior: 'auto' });
            }
          });
        }
      };
      window.addEventListener('wheel', this.wheelListener, { passive: true });

      // Global keyboard shortcut sequence listener (e.g. G O, G J, G T, G P, G S)
      this.keydownListener = (e: KeyboardEvent) => this.handleGlobalKeyDown(e);
      window.addEventListener('keydown', this.keydownListener);
    }
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      if (this.focusListener) {
        window.removeEventListener('mouseenter', this.focusListener);
        window.removeEventListener('pointerdown', this.focusListener);
      }
      if (this.wheelListener) {
        window.removeEventListener('wheel', this.wheelListener);
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

    // Check if within 1.2s of pressing 'g'
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
      `Switched to ${this.theme.isDark() ? 'Dark Canvas' : 'Light Canvas'} mode`,
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
