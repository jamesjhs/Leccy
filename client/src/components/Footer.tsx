import { useState } from 'react';
import PrivacyPolicy from './PrivacyPolicy';
import UserManual from './UserManual';
import { APP_VERSION } from '../version';

export default function Footer() {
  const [showPolicy, setShowPolicy] = useState(false);
  const [showManual, setShowManual] = useState(false);

  return (
    <>
      <footer className="bg-green-800 text-green-200 text-center text-sm py-3 mt-auto">
        © J Rowson 2026 |{' '}
        <a
          href="https://jahosi.co.uk"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-white transition-colors"
        >
          jahosi.co.uk
        </a>{' '}
        |{' '}
        <button
          onClick={() => setShowPolicy(true)}
          className="underline hover:text-white transition-colors"
        >
          Privacy Policy
        </button>{' '}
        |{' '}
        <button
          onClick={() => setShowManual(true)}
          className="underline hover:text-white transition-colors"
        >
          User Manual
        </button>{' '}
        | v{APP_VERSION}
      </footer>

      {showPolicy && <PrivacyPolicy onClose={() => setShowPolicy(false)} />}
      {showManual && <UserManual onClose={() => setShowManual(false)} />}
    </>
  );
}
