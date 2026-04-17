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

  function decline() {
    // Strictly necessary storage only — declining simply dismisses the notice
    // without saving the flag, so it will reappear on the next visit.
    setAccepted(true);
  }

  if (accepted) return null;

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-green-900 text-white p-4 shadow-lg">
        <div className="container mx-auto max-w-4xl">
          <p className="text-sm mb-3">
            🍪 <strong>Storage notice:</strong> Leccy stores two items in your browser's{' '}
            <code>localStorage</code>: an authentication token (required to keep you signed in) and
            a flag recording your acknowledgement of this notice. No tracking cookies, advertising
            cookies, or third-party storage are used.{' '}
            <button
              onClick={() => setShowPolicy(true)}
              className="underline text-green-300 hover:text-white transition-colors"
            >
              Privacy Policy
            </button>
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={accept}
              className="bg-green-500 hover:bg-green-400 text-white font-semibold px-5 py-2 rounded transition-colors text-sm"
            >
              Accept &amp; Continue
            </button>
            <button
              onClick={decline}
              className="bg-transparent border border-green-500 hover:border-green-300 text-green-300 hover:text-white font-semibold px-5 py-2 rounded transition-colors text-sm"
            >
              Dismiss
            </button>
          </div>
          <p className="text-xs text-green-400 mt-2">
            The authentication token is strictly necessary for the app to function and cannot be
            disabled. You may clear it at any time by signing out or clearing your browser's
            local storage.
          </p>
        </div>
      </div>
      {showPolicy && <PrivacyPolicy onClose={() => setShowPolicy(false)} />}
    </>
  );
}
