import { useState } from 'react';
import PrivacyPolicy from './PrivacyPolicy';

export default function CookieNotice() {
  const [accepted, setAccepted] = useState<boolean>(
    () => localStorage.getItem('cookiesAccepted') === 'true'
  );
  const [showPolicy, setShowPolicy] = useState(false);

  function accept() {
    localStorage.setItem('cookiesAccepted', 'true');
    setAccepted(true);
  }

  if (accepted) return null;

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-green-900 text-white p-4 shadow-lg">
        <div className="container mx-auto max-w-4xl flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <p className="flex-1 text-sm">
            🍪 Leccy uses localStorage to store your authentication token and preferences. No tracking cookies are used.{' '}
            <button
              onClick={() => setShowPolicy(true)}
              className="underline text-green-300 hover:text-white transition-colors"
            >
              Privacy Policy
            </button>
          </p>
          <button
            onClick={accept}
            className="shrink-0 bg-green-500 hover:bg-green-400 text-white font-semibold px-5 py-2 rounded transition-colors text-sm"
          >
            Accept
          </button>
        </div>
      </div>
      {showPolicy && <PrivacyPolicy onClose={() => setShowPolicy(false)} />}
    </>
  );
}
