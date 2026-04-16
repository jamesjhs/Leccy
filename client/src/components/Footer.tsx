import { useState, useEffect } from 'react';
import { authApi } from '../utils/api';

export default function Footer() {
  const [version, setVersion] = useState('0.0.1');

  useEffect(() => {
    authApi.version()
      .then((res) => setVersion(res.data.version))
      .catch(() => {/* ignore */});
  }, []);

  return (
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
      | v{version}
    </footer>
  );
}
