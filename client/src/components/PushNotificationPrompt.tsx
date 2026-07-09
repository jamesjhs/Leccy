import { useEffect, useState } from 'react';
import { useAuthContext } from '../App';
import { enablePushNotifications, browserSupportsPush, isStandalonePwa } from '../utils/pushNotifications';

const PROMPTED_KEY = 'leccy.push.prompted.v1';

export default function PushNotificationPrompt() {
  const { user, isLoading } = useAuthContext();
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isLoading || !user) return;
    if (!isStandalonePwa() || !browserSupportsPush()) return;
    if (localStorage.getItem(PROMPTED_KEY) === 'true') return;
    if (Notification.permission !== 'default') {
      localStorage.setItem(PROMPTED_KEY, 'true');
      return;
    }
    setVisible(true);
  }, [isLoading, user]);

  if (!visible) return null;

  async function enable() {
    setSubmitting(true);
    setError(null);
    try {
      await enablePushNotifications();
      localStorage.setItem(PROMPTED_KEY, 'true');
      setVisible(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not enable notifications.');
    } finally {
      setSubmitting(false);
    }
  }

  function dismiss() {
    localStorage.setItem(PROMPTED_KEY, 'true');
    setVisible(false);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 pointer-events-none">
      <div className="mx-auto max-w-md rounded-lg border border-green-200 bg-white shadow-lg pointer-events-auto p-4">
        <h2 className="text-sm font-bold text-green-900">Enable charge reminders</h2>
        <p className="text-xs text-gray-500 mt-1">
          Leccy can remind you each morning when a Quick Entry charge is still in progress.
        </p>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={() => void enable()}
            disabled={submitting}
            className="bg-green-700 hover:bg-green-600 disabled:bg-green-400 text-white font-bold px-3 py-1.5 rounded text-xs"
          >
            {submitting ? 'Enabling...' : 'Enable'}
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
  );
}
