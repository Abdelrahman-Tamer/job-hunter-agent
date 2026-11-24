import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { Router, NavigationEnd, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { filter } from 'rxjs';
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

  readonly isScanning = signal<boolean>(false);

  readonly navItems: NavItem[] = [
    { path: '/overview', label: 'Overview', icon: 'layers', shortcut: 'G O' },
    { path: '/jobs', label: 'Opportunities', icon: 'briefcase', shortcut: 'G J' },
    { path: '/tracker', label: 'Tracker', icon: 'bookmark', shortcut: 'G T' },
    { path: '/profile', label: 'Profile', icon: 'user', shortcut: 'G P' },
    { path: '/settings', label: 'Settings', icon: 'settings', shortcut: 'G S' },
  ];

  private keydownListener?: (e: KeyboardEvent) => void;
  private pendingSequence: string | null = null;
  private lastKeyTimestamp = 0;

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      window.focus();

      // Ensure iframe retains focus for mouse wheel events on Telegram Desktop
      window.addEventListener('mouseenter', () => window.focus(), { passive: true });
      window.addEventListener('pointerdown', () => window.focus(), { passive: true });

      // Robust route scroll reset:
      this.router.events
        .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
        .subscribe(() => {
          window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        });

      // Active mouse wheel fallback for Telegram Desktop / CEF iframe wrappers
      window.addEventListener(
        'wheel',
        (e: WheelEvent) => {
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
        },
        { passive: true }
      );

      // Global keyboard shortcut sequence listener (e.g. G O, G J, G T, G P, G S)
      this.keydownListener = (e: KeyboardEvent) => this.handleGlobalKeyDown(e);
      window.addEventListener('keydown', this.keydownListener);
    }
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined' && this.keydownListener) {
      window.removeEventListener('keydown', this.keydownListener);
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

    this.api.triggerRun(true).subscribe({
      next: () => {
        this.isScanning.set(false);
        this.telegram.haptic('success');
        this.toastService.show('Sweep completed successfully! Feeds verified.', 'success');
      },
      error: () => {
        this.isScanning.set(false);
        this.telegram.haptic('error');
        this.toastService.show('Feed scan completed or already up to date.', 'info');
      },
    });
  }
}
