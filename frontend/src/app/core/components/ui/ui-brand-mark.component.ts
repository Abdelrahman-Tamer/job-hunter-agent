import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  input,
  numberAttribute,
} from '@angular/core';

@Component({
  selector: 'ui-brand-mark',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="brand-mark-svg"
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 64 64"
      fill="none"
      [attr.role]="ariaLabel() ? 'img' : null"
      [attr.aria-label]="ariaLabel() || null"
      [attr.aria-hidden]="ariaLabel() ? null : 'true'"
    >
      <path
        fill="currentColor"
        d="M6 48V16A10 10 0 0 1 16 6H48L44.2 9.8H16A6.2 6.2 0 0 0 9.8 16V44.2Z"
      />
      <path
        fill="currentColor"
        d="M58 16V48A10 10 0 0 1 48 58H16L19.8 54.2H48A6.2 6.2 0 0 0 54.2 48V19.8Z"
      />
      <path fill="currentColor" d="M18.6 17H28.6V28.2H25V20.6H18.6Z" />
      <path
        fill="currentColor"
        d="M25 35.8H28.6V40.2A6.8 6.8 0 0 1 15 40.2H18.6A3.2 3.2 0 0 0 25 40.2Z"
      />
      <path fill="currentColor" d="M31 17H34.6V28.2H31Z" />
      <path fill="currentColor" d="M31 35.8H34.6V47H31Z" />
      <path
        fill="currentColor"
        d="M45.4 17H49V47H45.4V33.8H37.2L40.8 30.2H45.4Z"
      />
      <path
        fill="var(--accent-copper, #D95D39)"
        d="M25 30.2H37.8L34.2 33.8H25Z"
      />
    </svg>
  `,
  styles: [`
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 0;
      flex-shrink: 0;
      color: var(--ink-primary);
    }

    .brand-mark-svg {
      display: block;
    }
  `],
})
export class UiBrandMarkComponent {
  readonly size = input<number, number | string>(32, {
    transform: (val) => numberAttribute(val, 32),
  });
  readonly showNode = input(true, { transform: booleanAttribute });
  readonly ariaLabel = input<string | undefined>(undefined);
}
