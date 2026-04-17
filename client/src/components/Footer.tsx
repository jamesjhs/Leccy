import { useState, useEffect } from 'react';
import { authApi } from '../utils/api';
import PrivacyPolicy from './PrivacyPolicy';
import UserManual from './UserManual';

export default function Footer() {
  const [version, setVersion] = useState('1.0.3');
  const [showPolicy, setShowPolicy] = useState(false);
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    authApi.version()
      .then((res) => setVersion(res.data.version))
      .catch(() => {/* ignore */});
  }, []);

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
        | v{version}
      </footer>

      {showPolicy && <PrivacyPolicy onClose={() => setShowPolicy(false)} />}
      {showManual && <UserManual onClose={() => setShowManual(false)} />}
    </>
  );
}
