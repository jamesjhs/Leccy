import { useState } from 'react';
import PrivacyPolicy from './PrivacyPolicy';
import UserManual from './UserManual';

export default function PublicFooter() {
  const [showPolicy, setShowPolicy] = useState(false);
  const [showManual, setShowManual] = useState(false);

  return (
    <>
      <p className="text-green-400 text-xs text-center mt-6 space-x-2">
        <span>© J Rowson 2026 · jahosi.co.uk</span>
        <span>·</span>
        <button
          onClick={() => setShowPolicy(true)}
          className="underline hover:text-green-200 transition-colors"
        >
          Privacy Policy
        </button>
        <span>·</span>
        <button
          onClick={() => setShowManual(true)}
          className="underline hover:text-green-200 transition-colors"
        >
          User Manual
        </button>
      </p>

      {showPolicy && <PrivacyPolicy onClose={() => setShowPolicy(false)} />}
      {showManual && <UserManual onClose={() => setShowManual(false)} />}
    </>
  );
}
