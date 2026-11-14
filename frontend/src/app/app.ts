import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TelegramService } from './core/services/telegram.service';

interface NavItem {
  path: string;
  labelEn: string;
  labelAr: string;
  icon: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly telegram = inject(TelegramService);
  readonly isRtl = signal<boolean>(false);

  readonly navItems: NavItem[] = [
    { path: '/overview', labelEn: 'Overview', labelAr: 'نظرة عامة', icon: '📊' },
    { path: '/jobs', labelEn: 'Job Feed', labelAr: 'الوظائف', icon: '💼' },
    { path: '/tracker', labelEn: 'Tracker', labelAr: 'المتابعة', icon: '📌' },
    { path: '/profile', labelEn: 'Profile', labelAr: 'الملف', icon: '👤' },
    { path: '/settings', labelEn: 'Settings', labelAr: 'الإعدادات', icon: '⚙️' },
  ];

  toggleRtl(): void {
    this.telegram.haptic('light');
    this.isRtl.update((val) => !val);
  }

  onTabClick(): void {
    this.telegram.haptic('selection');
  }
}
