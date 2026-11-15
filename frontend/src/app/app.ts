import { Component, inject, OnInit } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TelegramService } from './core/services/telegram.service';
import { ThemeService } from './core/services/theme.service';
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
    }
  }

  toggleTheme(): void {
    this.telegram.haptic('selection');
    this.theme.toggleTheme();
  }

  onTabClick(): void {
    this.telegram.haptic('selection');
  }
}
