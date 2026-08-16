import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { capturePrintImage } from '../../utils/capturePrintInvoice';

/**
 * v-forward-share — shared "Forward to Telegram / Messenger" flow.
 *
 * <p>Packages the whole picker + capture + share dance so any
 * document-detail dialog (Invoice, Quotation, and any future doc
 * that renders through the `.print-tax-invoice` portal) can wire it
 * in three lines:</p>
 *
 * <pre>
 *   const share = useForwardShare({
 *     buildConfig: () =&gt; invoice ? {
 *       title:       `Invoice ${invoice.invoiceNo}`,
 *       summary:     buildInvoiceSummary(invoice),
 *       fileNameStem: invoice.invoiceNo,
 *     } : null,
 *     busy: telegramBusy,
 *     setBusy: setTelegramBusy,
 *   });
 *   ...
 *   &lt;DropdownMenuItem onSelect={share.open}&gt;Forward to&lt;/DropdownMenuItem&gt;
 *   {share.dialog}
 * </pre>
 *
 * <p>Mobile (`pointer: coarse` + `navigator.share`) hands off to the
 * OS share sheet — iOS surfaces AirDrop / Messages / Mail /
 * Telegram / WhatsApp / Line natively. Desktop downloads the PNG
 * and opens Telegram web (with a text summary preloaded) or
 * Messenger web so the operator drags the file in.</p>
 *
 * <p>Skipping `navigator.share` on desktop is intentional — the
 * Windows Share sheet only lists UWP apps, and Telegram Desktop /
 * Messenger Desktop aren't UWP. Operators would see a share sheet
 * with no Telegram target and get confused.</p>
 */

export interface ForwardConfig {
  /** Title header on the share dialog + fallback shareData title. */
  title: string;
  /** Multi-line text summary shown alongside the image / used as
   *  the share text on platforms that don't accept files. */
  summary: string;
  /** Filename stem — used to build `<stem>.png`. Caller should
   *  pass the document number (INV-001 / QT-2026-00001). Non-
   *  filename-safe characters get replaced. */
  fileNameStem: string;
}

export interface UseForwardShareOptions {
  /** Returns the current doc's forward config, or null when nothing
   *  is loaded yet. Called EACH time the operator picks a platform,
   *  so the caller can lazily build the summary from live state. */
  buildConfig: () => ForwardConfig | null;
  /** Shared busy flag — usually the same `telegramBusy` the Bot Link
   *  spinner uses so both paths gate each other. */
  busy: boolean;
  setBusy: (v: boolean) => void;
}

export interface UseForwardShareResult {
  /** Call to open the picker — typically wired to a "Forward to"
   *  `DropdownMenuItem.onSelect`. */
  open: () => void;
  /** Mount ONCE inside the parent form's tree (any depth — Radix
   *  portals both dialogs). Do not wrap. */
  dialog: React.ReactNode;
}

type Platform = 'telegram' | 'messenger';

export function useForwardShare(opts: UseForwardShareOptions): UseForwardShareResult {
  const [chooserOpen, setChooserOpen] = useState(false);

  const capturePrintFile = async (stem: string): Promise<File | null> => {
    const dataUrl = await capturePrintImage();
    if (!dataUrl) return null;
    const bin = await (await fetch(dataUrl)).blob();
    const safeStem = stem.replace(/[^A-Za-z0-9._-]+/g, '-');
    return new File([bin], `${safeStem}.png`, { type: bin.type || 'image/png' });
  };

  const downloadFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const isMobile = (): boolean => {
    // Feature-based mobile detect. `pointer: coarse` is the
    // interaction primary — touch devices. iOS Safari + Android
    // Chrome both report true; touchscreen laptops with a mouse
    // report false (which is what we want — Windows share sheet
    // path is worse than download+open there).
    return typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(pointer: coarse)').matches;
  };

  const handle = async (platform: Platform) => {
    if (opts.busy) return;
    const cfg = opts.buildConfig();
    if (!cfg) return;
    opts.setBusy(true);
    try {
      const file = await capturePrintFile(cfg.fileNameStem);
      // Mobile — OS share sheet natively lists Telegram + Messenger
      // + WhatsApp + Line + AirDrop + Messages + Mail. One tap and
      // the file is on its way. Cancel → we return silently.
      if (isMobile() && typeof navigator.share === 'function') {
        try {
          if (file && typeof navigator.canShare === 'function'
            && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: cfg.title, text: cfg.summary });
          } else {
            await navigator.share({ title: cfg.title, text: cfg.summary });
          }
          return;
        } catch {
          return;
        }
      }
      // Desktop — download the PNG + open the chat platform so the
      // operator's next action is "drag the file in".
      if (file) downloadFile(file);
      const openUrl = platform === 'telegram'
        ? `https://t.me/share/url?url=${encodeURIComponent(window.location.origin)}&text=${encodeURIComponent(cfg.summary)}`
        : 'https://www.messenger.com/';
      window.open(openUrl, '_blank', 'noopener,noreferrer');
      const platformLabel = platform === 'telegram' ? 'Telegram' : 'Messenger';
      toast.success(file
        ? `Image saved — attach ${file.name} in ${platformLabel}.`
        : `Opened ${platformLabel} — image capture failed, paste the text summary.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Forward failed');
    } finally {
      opts.setBusy(false);
    }
  };

  const pick = (platform: Platform) => {
    setChooserOpen(false);
    void handle(platform);
  };

  const dialog = (
    <Dialog open={chooserOpen} onOpenChange={setChooserOpen}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          {/* pr-8 leaves room for the built-in X close (top-4 right-4)
              on the right side of the header so the centered title
              still visually reads centered. */}
          <DialogTitle className="text-center pr-8">Forward to</DialogTitle>
        </DialogHeader>
        <div className="flex justify-center gap-6 py-4">
          <button
            type="button"
            onClick={() => pick('telegram')}
            disabled={opts.busy}
            className="group flex flex-col items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded-lg p-2 disabled:opacity-50"
            aria-label="Forward to Telegram"
            title="Telegram"
          >
            {/* Telegram paper-plane on brand-blue disc. Inline SVG so
                no third-party asset dependency. */}
            <span className="h-14 w-14 rounded-full flex items-center justify-center transition group-hover:scale-105"
                  style={{ background: '#229ED9' }}>
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" aria-hidden="true">
                <path d="M9.417 15.181l-.397 5.584c.568 0 .814-.244 1.109-.537l2.663-2.545 5.518 4.041c1.012.564 1.725.267 1.998-.931l3.622-16.972.001-.001c.321-1.496-.541-2.081-1.527-1.714L1.34 9.712C-.099 10.276-.077 11.077 1.096 11.44l5.484 1.714 12.741-8.021c.599-.396 1.145-.177.696.219z"
                      fill="#fff" />
              </svg>
            </span>
          </button>
          <button
            type="button"
            onClick={() => pick('messenger')}
            disabled={opts.busy}
            className="group flex flex-col items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-lg p-2 disabled:opacity-50"
            aria-label="Forward to Messenger"
            title="Messenger"
          >
            {/* Messenger lightning-in-speech-bubble on the brand
                blue-purple gradient. */}
            <span className="h-14 w-14 rounded-full flex items-center justify-center transition group-hover:scale-105"
                  style={{ background: 'linear-gradient(135deg,#00B2FF 0%,#006AFF 45%,#8000FF 100%)' }}>
              <svg viewBox="0 0 24 24" width="30" height="30" fill="#fff" aria-hidden="true">
                <path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.14.26.34.27.56l.05 1.78c.02.57.6.94 1.12.71l1.99-.88c.17-.07.36-.09.54-.04.91.25 1.88.39 2.89.39 5.64 0 10-4.13 10-9.7S17.64 2 12 2zm6.01 7.61l-2.94 4.66c-.47.74-1.47.93-2.18.4l-2.34-1.75a.6.6 0 0 0-.72 0l-3.16 2.39c-.42.32-.97-.18-.69-.63l2.94-4.66c.47-.74 1.47-.93 2.18-.4l2.34 1.75c.21.16.51.16.72 0l3.16-2.39c.42-.32.97.18.69.63z" />
              </svg>
            </span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return { open: () => setChooserOpen(true), dialog };
}
