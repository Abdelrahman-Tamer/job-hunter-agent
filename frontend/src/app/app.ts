import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TelegramService } from './core/services/telegram.service';
import { ThemeService } from './core/services/theme.service';
import { IconComponent, IconName } from './core/components/icon/icon.component';

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
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly telegram = inject(TelegramService);
  readonly theme = inject(ThemeService);

  readonly navItems: NavItem[] = [
    { path: '/overview', label: 'Overview', icon: 'layers' },
    { path: '/jobs', label: 'Jobs', icon: 'briefcase' },
    { path: '/tracker', label: 'Tracker', icon: 'bookmark' },
    { path: '/profile', label: 'Profile', icon: 'user' },
    { path: '/settings', label: 'Settings', icon: 'settings' },
  ];

  toggleTheme(): void {
    this.telegram.haptic('selection');
    this.theme.toggleTheme();
  }

  onTabClick(): void {
    this.telegram.haptic('selection');
  }
}
