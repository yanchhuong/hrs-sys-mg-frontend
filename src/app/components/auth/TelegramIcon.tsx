/** Telegram's paper plane, for "Continue with Telegram". */
export function TelegramIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M21.94 4.3a1.5 1.5 0 0 0-2.04-1.4L2.98 9.6a1.2 1.2 0 0 0 .06 2.26l4.3 1.4 1.66 5.25a1 1 0 0 0 1.64.42l2.42-2.27 4.47 3.29a1.5 1.5 0 0 0 2.35-.87L21.94 4.3ZM9.3 14.2l8.2-6.9-6.46 7.75-.27 2.94-1.47-3.79Z" />
    </svg>
  );
}

/** Telegram blue. */
export const TELEGRAM_BLUE = '#229ED9';
