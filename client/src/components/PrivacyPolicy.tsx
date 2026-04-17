interface PrivacyPolicyProps {
  onClose: () => void;
}

export default function PrivacyPolicy({ onClose }: PrivacyPolicyProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-xl font-bold text-green-800">Privacy Policy &amp; Data Statement</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-4 text-sm text-gray-700 space-y-5">
          <p className="text-xs text-gray-500">
            Last updated: April 2026 · Leccy v1.0.0
          </p>

          <section>
            <h3 className="font-semibold text-green-700 mb-1">1. Who we are</h3>
            <p>
              Leccy is a self-hosted EV charging cost tracker. It is operated by the individual or
              organisation who installed and runs the server (the <strong>Data Controller</strong>).
              If you are unsure who that is, please contact the person who gave you access to this
              application. For enquiries related to this deployment, visit{' '}
              <a href="https://jahosi.co.uk" className="text-green-700 underline" target="_blank" rel="noopener noreferrer">
                jahosi.co.uk
              </a>.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-green-700 mb-1">2. What data we collect and why</h3>
            <p className="mb-2">We only collect data that is necessary to provide the service:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Account data:</strong> your email address, display name, and a securely hashed password. Used to authenticate you and identify your data.</li>
              <li><strong>Charging sessions:</strong> odometer readings, battery percentages, range, air temperature, and date. Used to calculate costs and efficiency statistics.</li>
              <li><strong>Charger costs:</strong> energy (kWh), price paid, charger type and name. Used to calculate your running costs.</li>
              <li><strong>Maintenance logs:</strong> description, date, and optional cost. Used to track vehicle upkeep.</li>
              <li><strong>Tariff configurations:</strong> unit rates and time-of-use settings. Used to estimate charging costs.</li>
              <li><strong>Vehicle records:</strong> licence plate, nickname, vehicle type, and battery capacity. Used to associate sessions with specific vehicles.</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold text-green-700 mb-1">3. Lawful basis for processing</h3>
            <p>
              We process your personal data on the basis of <strong>contract</strong> (Article 6(1)(b)
              UK GDPR) — processing is necessary to provide you with the Leccy service you have
              registered to use. Account data is required to log in and to associate your records
              with you.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-green-700 mb-1">4. Where your data is stored</h3>
            <p>
              All data is stored in a <strong>SQLite database on the server hosting Leccy</strong>.
              No data is transmitted to third parties, cloud services, or advertising networks. The
              server is controlled by the Data Controller named in section 1.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-green-700 mb-1">5. Browser storage (localStorage)</h3>
            <p className="mb-2">
              Leccy stores two items in your browser's <code>localStorage</code>. These are
              <strong> not cookies</strong> — they are stored only on your device and are never
              transmitted automatically by your browser:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <code>token</code> — a JSON Web Token (JWT) that keeps you signed in. It is sent as
                a <code>Bearer</code> header only when you make requests to the Leccy API and is
                removed when you log out.
              </li>
              <li>
                <code>cookiesAccepted</code> — records that you have acknowledged this notice, so it
                is not shown repeatedly.
              </li>
            </ul>
            <p className="mt-2">
              No tracking, analytics, advertising, or third-party cookies or storage are used.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-green-700 mb-1">6. Data retention</h3>
            <p>
              Your data is retained for as long as your account is active. You may delete your
              account at any time (see section 8 below). When an account is deleted, all associated
              data — sessions, costs, maintenance logs, tariffs, and vehicles — is permanently
              erased from the database.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-green-700 mb-1">7. Data security</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Passwords are hashed using <strong>bcrypt</strong> (cost factor 12) and are never stored in plain text.</li>
              <li>Authentication uses short-lived JWT tokens; no session cookies are used.</li>
              <li>Accounts are temporarily locked after repeated failed login attempts to prevent brute-force attacks.</li>
              <li>Optional two-factor authentication (2FA) via email is available for all accounts.</li>
              <li>All API endpoints require authentication and enforce strict input validation.</li>
              <li>Security headers (HSTS, CSP, X-Frame-Options) are set on every response.</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold text-green-700 mb-1">8. Your rights under UK GDPR</h3>
            <p className="mb-2">You have the following rights regarding your personal data:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Right of access (Article 15):</strong> you may request a copy of all personal data we hold about you.</li>
              <li><strong>Right to rectification (Article 16):</strong> you may correct inaccurate data via your account settings or by contacting the administrator.</li>
              <li><strong>Right to erasure / "right to be forgotten" (Article 17):</strong> you may permanently delete your account and all associated data at any time from the <em>Account Settings</em> page, under the <em>Delete My Account</em> section. No reason is required.</li>
              <li><strong>Right to restriction of processing (Article 18):</strong> you may ask us to restrict processing of your data in certain circumstances.</li>
              <li><strong>Right to data portability (Article 20):</strong> you may request a machine-readable export of your data by contacting the administrator.</li>
              <li><strong>Right to object (Article 21):</strong> you may object to the processing of your data. Note that objecting may prevent us from providing the service.</li>
            </ul>
            <p className="mt-2">
              To exercise any of these rights, contact the Data Controller at{' '}
              <a href="https://jahosi.co.uk" className="text-green-700 underline" target="_blank" rel="noopener noreferrer">
                jahosi.co.uk
              </a>.
              We will respond within <strong>one calendar month</strong> as required by UK GDPR.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-green-700 mb-1">9. Right to complain</h3>
            <p>
              If you are unhappy with how your data is handled, you have the right to lodge a
              complaint with the UK Information Commissioner's Office (ICO):{' '}
              <a
                href="https://ico.org.uk/make-a-complaint/"
                className="text-green-700 underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                ico.org.uk/make-a-complaint
              </a>{' '}
              · 0303 123 1113.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-green-700 mb-1">10. Changes to this policy</h3>
            <p>
              This policy may be updated when the application is updated. The version and date at
              the top of this document indicate the current revision. Continued use of the service
              after a policy update constitutes acceptance of the revised policy.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-green-700 mb-1">11. Contact</h3>
            <p>
              For all privacy-related enquiries, please contact the Data Controller via{' '}
              <a href="https://jahosi.co.uk" className="text-green-700 underline" target="_blank" rel="noopener noreferrer">
                jahosi.co.uk
              </a>.
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
