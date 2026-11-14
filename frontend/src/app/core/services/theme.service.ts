import { Injectable, signal } from '@angular/core';

export type ThemeMode = 'dark' | 'light';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  readonly currentTheme = signal<ThemeMode>('dark');

  constructor() {
    this.initTheme();
  }

  private initTheme(): void {
    if (typeof window === 'undefined') return;

    const saved = localStorage.getItem('botta_theme') as ThemeMode | null;
    if (saved === 'dark' || saved === 'light') {
      this.setTheme(saved);
    } else {
      // Default to Dark Mode
      this.setTheme('dark');
    }
  }

  setTheme(theme: ThemeMode): void {
    this.currentTheme.set(theme);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
      try {
        localStorage.setItem('botta_theme', theme);
      } catch {
        // Ignore storage errors in sandboxed contexts
      }
    }
  }

  toggleTheme(): void {
    const next = this.currentTheme() === 'dark' ? 'light' : 'dark';
    this.setTheme(next);
  }

  isDark(): boolean {
    return this.currentTheme() === 'dark';
  }
}
