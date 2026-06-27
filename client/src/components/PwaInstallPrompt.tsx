import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISSED_KEY = 'leccy.pwaInstallPrompt.dismissed';

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export default function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone() || localStorage.getItem(DISMISSED_KEY) === 'true') return;

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setVisible(true);
    }

    function handleInstalled() {
      localStorage.setItem(DISMISSED_KEY, 'true');
      setVisible(false);
      setInstallEvent(null);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  if (!visible || !installEvent) return null;

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'accepted') {
      localStorage.setItem(DISMISSED_KEY, 'true');
    }
    setVisible(false);
    setInstallEvent(null);
  }

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setVisible(false);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 pointer-events-none">
      <div className="mx-auto max-w-md rounded-lg border border-green-200 bg-white shadow-lg pointer-events-auto p-4">
        <div className="flex items-start gap-3">
          <div className="text-2xl leading-none">⚡</div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-green-900">Install Leccy</h2>
            <p className="text-xs text-gray-500 mt-1">
              Add Leccy to your device for quicker charge logging and charge reminder notifications.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={() => void install()}
                className="bg-green-700 hover:bg-green-600 text-white font-bold px-3 py-1.5 rounded text-xs"
              >
                Install
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="border border-gray-300 hover:bg-gray-50 text-gray-600 font-semibold px-3 py-1.5 rounded text-xs"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
