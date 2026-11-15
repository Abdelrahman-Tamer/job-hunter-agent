import { Injectable, signal } from '@angular/core';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        close: () => void;
        setHeaderColor: (color: string) => void;
        setBackgroundColor: (color: string) => void;
        openLink: (url: string, options?: { try_instant_view?: boolean }) => void;
        openTelegramLink: (url: string) => void;
        showAlert: (message: string, callback?: () => void) => void;
        showConfirm: (message: string, callback?: (confirmed: boolean) => void) => void;
        enableClosingConfirmation: () => void;
        disableClosingConfirmation: () => void;
        isExpanded: boolean;
        viewportHeight: number;
        viewportStableHeight: number;
        headerColor: string;
        backgroundColor: string;
        colorScheme: 'light' | 'dark';
        themeParams: Record<string, string>;
        initData: string;
        initDataUnsafe: {
          user?: {
            id: number;
            first_name: string;
            last_name?: string;
            username?: string;
            language_code?: string;
          };
          start_param?: string;
        };
        HapticFeedback?: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
          notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
          selectionChanged: () => void;
        };
      };
    };
  }
}

@Injectable({
  providedIn: 'root',
})
export class TelegramService {
  readonly isTelegram = signal<boolean>(false);
  readonly telegramUser = signal<any>(null);

  constructor() {
    this.init();
  }

  init(): void {
    if (typeof window === 'undefined') return;

    const tg = window.Telegram?.WebApp;
    if (tg && typeof tg.ready === 'function') {
      this.isTelegram.set(true);
      try {
        tg.ready();
        tg.expand();
        tg.setHeaderColor('#111520');
        tg.setBackgroundColor('#090c13');

        // Enable vertical swipes in Telegram Mini App for natural touch & wheel scrolling
        if (typeof (tg as any).enableVerticalSwipes === 'function') {
          (tg as any).enableVerticalSwipes();
        }

        // Ensure window has focus for desktop mouse wheel events
        window.focus();

        if (tg.initDataUnsafe?.user) {
          this.telegramUser.set(tg.initDataUnsafe.user);
        }
      } catch (e) {
        console.warn('Telegram WebApp initialization error:', e);
      }
    }
  }

  haptic(style: 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'error'): void {
    if (typeof window === 'undefined') return;
    const haptic = window.Telegram?.WebApp?.HapticFeedback;
    if (!haptic) return;

    try {
      if (style === 'selection') {
        haptic.selectionChanged();
      } else if (style === 'success') {
        haptic.notificationOccurred('success');
      } else if (style === 'error') {
        haptic.notificationOccurred('error');
      } else {
        haptic.impactOccurred(style);
      }
    } catch {
      // Ignore if unsupported
    }
  }

  openUrl(url: string): void {
    if (typeof window === 'undefined') return;
    const tg = window.Telegram?.WebApp;
    if (tg && typeof tg.openLink === 'function') {
      tg.openLink(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  openLink(url: string): void {
    this.openUrl(url);
  }
}
