import { DestroyRef, Injectable, inject, signal } from '@angular/core';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

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
        disableVerticalSwipes?: () => void;
        enableVerticalSwipes?: () => void;
        onEvent?: (eventType: string, eventHandler: () => void) => void;
        offEvent?: (eventType: string, eventHandler: () => void) => void;
        isExpanded: boolean;
        viewportHeight: number;
        viewportStableHeight: number;
        headerColor: string;
        backgroundColor: string;
        colorScheme: 'light' | 'dark';
        platform?: string;
        themeParams: Record<string, string>;
        initData: string;
        initDataUnsafe: {
          user?: TelegramUser;
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
  private readonly destroyRef = inject(DestroyRef);

  readonly isTelegram = signal<boolean>(false);
  readonly telegramUser = signal<TelegramUser | null>(null);

  private viewportHandler?: () => void;
  private registeredTg?: NonNullable<NonNullable<Window['Telegram']>['WebApp']>;

  constructor() {
    this.init();
    this.destroyRef.onDestroy(() => {
      if (this.viewportHandler && typeof this.registeredTg?.offEvent === 'function') {
        this.registeredTg.offEvent('viewportChanged', this.viewportHandler);
      }
      this.viewportHandler = undefined;
      this.registeredTg = undefined;
    });
  }

  init(): void {
    if (typeof window === 'undefined') return;

    const tg = window.Telegram?.WebApp;
    const search = window.location.search || '';
    const hash = window.location.hash || '';

    // Accurate Telegram environment discrimination:
    // A regular browser loading telegram-web-app.js reports platform="unknown" and empty initData.
    // In actual Telegram (Mobile WKWebView/Android, Desktop CEF/Qt, Web) platform is known or initData is present.
    const isActuallyTelegram = Boolean(
      tg &&
        (
          (tg.platform && tg.platform !== 'unknown') ||
          (tg.initData && tg.initData.length > 0) ||
          search.includes('tgWebAppData') ||
          hash.includes('tgWebAppData') ||
          search.includes('tg=1') ||
          Boolean((window as unknown as { TelegramWebviewProxy?: unknown }).TelegramWebviewProxy)
        )
    );

    if (isActuallyTelegram && tg) {
      this.isTelegram.set(true);
      document.documentElement.classList.add('in-telegram');
      document.body.classList.add('in-telegram');

      try {
        tg.ready();
        tg.expand();
        tg.setHeaderColor('#111520');
        tg.setBackgroundColor('#090c13');

        // Disable vertical swipes so Telegram Mobile modal sheet does not intercept swipes
        if (typeof tg.disableVerticalSwipes === 'function') {
          tg.disableVerticalSwipes();
        }

        // Keep viewport height in CSS variable
        const updateViewport = () => {
          const vh = tg.viewportHeight || window.innerHeight;
          document.documentElement.style.setProperty('--tg-viewport-height', `${vh}px`);
        };
        updateViewport();

        if (this.viewportHandler && typeof this.registeredTg?.offEvent === 'function') {
          this.registeredTg.offEvent('viewportChanged', this.viewportHandler);
        }
        this.viewportHandler = updateViewport;
        this.registeredTg = tg;

        if (typeof tg.onEvent === 'function') {
          tg.onEvent('viewportChanged', updateViewport);
        }

        // Ensure window has focus for desktop mouse wheel events
        window.focus();

        if (tg.initDataUnsafe?.user) {
          this.telegramUser.set(tg.initDataUnsafe.user);
        }
      } catch (e) {
        console.warn('Telegram WebApp initialization error:', e);
      }
    } else {
      // In normal browser outside Telegram
      this.isTelegram.set(false);
      document.documentElement.classList.remove('in-telegram');
      document.body.classList.remove('in-telegram');
    }
  }

  haptic(style: 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'error'): void {
    if (typeof window === 'undefined' || !this.isTelegram()) return;
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
    if (typeof window === 'undefined' || !url || !/^https?:\/\//i.test(url)) return;
    const tg = window.Telegram?.WebApp;
    if (this.isTelegram() && tg && typeof tg.openLink === 'function') {
      tg.openLink(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  openLink(url: string): void {
    this.openUrl(url);
  }

  openExternalLink(url: string): void {
    this.openUrl(url);
  }
}
