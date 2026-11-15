import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TelegramService } from './core/services/telegram.service';
import { ThemeService } from './core/services/theme.service';
import { ToastService } from './core/services/toast.service';
import { ApiService } from './core/services/api.service';
import { IconComponent, IconName } from './core/components/icon/icon.component';
import { AntigravityCanvasComponent } from './core/components/antigravity-canvas/antigravity-canvas.component';

interface NavItem {
  path: string;
  label: string;
  icon: IconName;
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
    AntigravityCanvasComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  readonly telegram = inject(TelegramService);
  readonly theme = inject(ThemeService);
  readonly toastService = inject(ToastService);
  private readonly api = inject(ApiService);

  readonly isScanning = signal<boolean>(false);

  readonly navItems: NavItem[] = [
    { path: '/overview', label: 'Overview', icon: 'layers' },
    { path: '/jobs', label: 'Jobs', icon: 'briefcase' },
    { path: '/tracker', label: 'Tracker', icon: 'bookmark' },
    { path: '/profile', label: 'Profile', icon: 'user' },
    { path: '/settings', label: 'Settings', icon: 'settings' },
  ];

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      window.focus();
      // Ensure iframe retains focus for mouse wheel events on Telegram Desktop
      window.addEventListener('pointerdown', () => window.focus(), { passive: true });

      // Telegram Desktop CEF/Qt mouse wheel forwarding failsafe:
      // Forward wheel delta to #main-content when hovering over header, borders, or canvas
      window.addEventListener(
        'wheel',
        (e: WheelEvent) => {
          const mainEl = document.getElementById('main-content');
          if (!mainEl) return;

          const target = e.target as HTMLElement | null;
          if (target?.closest('.drawer-body, .scrollable-child')) {
            return;
          }

          if (!target || !mainEl.contains(target)) {
            mainEl.scrollBy({ top: e.deltaY, behavior: 'auto' });
          }
        },
        { passive: true }
      );
    }
  }

  toggleTheme(): void {
    this.telegram.haptic('selection');
    this.theme.toggleTheme();
    this.toastService.show(
      `Switched to ${this.theme.isDark() ? 'Dark Obsidian' : 'Light Titanium'} mode`,
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
      next: (res) => {
        this.isScanning.set(false);
        this.telegram.haptic('success');
        this.toastService.show('Sweep completed successfully! New roles verified.', 'success');
      },
      error: (err) => {
        this.isScanning.set(false);
        this.telegram.haptic('error');
        this.toastService.show('Feed scan completed or already up to date.', 'info');
      },
    });
  }
}
