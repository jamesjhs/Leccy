interface PrivacyPolicyProps {
  onClose: () => void;
}

export default function PrivacyPolicy({ onClose }: PrivacyPolicyProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-xl font-bold text-green-800">Privacy Policy</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-4 text-sm text-gray-700 space-y-4">
          <section>
            <h3 className="font-semibold text-green-700 mb-1">What data we store</h3>
            <p>
              Leccy stores your EV charging sessions, charger costs, maintenance logs, and tariff
              configurations in a local SQLite database on the server. No data is transmitted to
              third parties.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-green-700 mb-1">Local storage</h3>
            <p>
              Your authentication JWT token is stored in your browser's <code>localStorage</code>.
              This token is used solely to authenticate your requests to the Leccy API. A{' '}
              <code>cookiesAccepted</code> flag is also stored to remember your consent.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-green-700 mb-1">Authentication tokens</h3>
            <p>
              A JSON Web Token (JWT) is stored in your browser&apos;s <code>localStorage</code> to
              keep you signed in. This token is sent as a Bearer token on each API request and is
              automatically removed when you log out. No cookies are used for authentication.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-green-700 mb-1">Data retention</h3>
            <p>
              All your data remains on the self-hosted server. You can delete your account and all
              associated data at any time by contacting the administrator.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-green-700 mb-1">Contact</h3>
            <p>
              For privacy enquiries, please contact{' '}
              <a href="https://jahosi.co.uk" className="text-green-700 underline">
                jahosi.co.uk
              </a>
              .
            </p>
          </section>
        </div>

        <div className="px-6 py-4 border-t flex justify-end">
          <button
            onClick={onClose}
            className="bg-green-700 hover:bg-green-600 text-white font-semibold px-6 py-2 rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
