interface UserManualProps {
  onClose: () => void;
}

export default function UserManual({ onClose }: UserManualProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-xl font-bold text-green-800">⚡ Leccy — User Manual</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-4 text-sm text-gray-700 space-y-5">
          <p className="text-xs text-gray-500">Leccy v1.6.1 · EV Cost Tracker</p>

          {/* ── Getting started ── */}
          <section>
            <h3 className="font-semibold text-green-700 mb-2">1. Getting started</h3>
            <ol className="list-decimal pl-5 space-y-1">
              <li>
                <strong>Register:</strong> click <em>Create Account</em> on the login screen, enter
                your email address and a password (minimum 8 characters including at least one
                special character such as <code>!</code>, <code>@</code>, or <code>#</code>).
              </li>
              <li>
                <strong>Sign in:</strong> use your email and password, or request a{' '}
                <em>Magic Link</em> — a one-click sign-in link sent to your email, valid for 15
                minutes.
              </li>
              <li>
                <strong>Two-factor authentication (2FA):</strong> for extra security, enable 2FA
                from <em>Account Settings</em>. A one-time code will be emailed to you each time
                you sign in.
              </li>
            </ol>
          </section>

          {/* ── Vehicles ── */}
          <section>
            <h3 className="font-semibold text-green-700 mb-2">2. Adding your vehicles</h3>
            <p className="mb-1">
              Before logging sessions, add your vehicle(s) under <em>Account Settings → My
              Vehicles</em> or via the <em>Vehicles</em> page.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Enter your <strong>licence plate</strong> (spaces are stripped automatically).</li>
              <li>Optionally add a <strong>nickname</strong> (e.g. "Daily Driver") and the vehicle's <strong>battery capacity in kWh</strong>.</li>
              <li>When adding your first vehicle, you can apply existing unlinked charging and maintenance data to it.</li>
              <li>You can register multiple vehicles and switch between them when logging sessions.</li>
              <li>To remove a vehicle, click <em>Remove</em> beside it. Any sessions linked to that vehicle are kept but will no longer show a vehicle name.</li>
            </ul>
          </section>

          {/* ── Logging sessions ── */}
          <section>
            <h3 className="font-semibold text-green-700 mb-2">3. Logging charging sessions</h3>
            <p className="mb-1">
              Use <em>Quick Entry</em> for one charge at a time, or <em>Data Entry</em> when you
              want to paste several sessions from CSV.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Quick Entry:</strong> save charge-start odometer, battery percentage, and displayed range, then finish the session after unplugging.</li>
              <li><strong>Charge reminders:</strong> when Leccy is installed as a PWA and push notifications are enabled, a saved Quick Entry charge start can trigger a daily reminder until you submit or clear it.</li>
              <li><strong>Quick Entry sense checks:</strong> Leccy highlights impossible end-charge SOC, range, temperature, and date combinations before estimating kWh or submitting.</li>
              <li><strong>CSV Data Entry:</strong> paste rows in the format <code>odo,init%,initRng,Final%,FinalRng,AirTemp,dd/mm/yyyy</code>.</li>
              <li><strong>Test before submit:</strong> the <em>Test</em> button validates rows, highlights errors, and shows basic statistics before import.</li>
              <li><strong>Imported sessions:</strong> CSV imports create charging sessions only. Charge type, kWh, and cost are left blank so you can enter the measured charger data yourself.</li>
            </ul>
          </section>

          {/* ── Charger costs ── */}
          <section>
            <h3 className="font-semibold text-green-700 mb-2">4. Logging charger costs</h3>
            <p className="mb-1">
              In <em>Data Entry</em>, use the charging sessions table to add or update kWh and
              cost data for each session:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Charge type:</strong> choose <em>Home</em> or <em>Away</em> when you know where the session happened.</li>
              <li><strong>Energy (kWh):</strong> enter the charger-reported energy whenever possible.</li>
              <li><strong>Cost (pence):</strong> the total amount paid in pence (e.g. 1200 = £12.00).</li>
              <li><strong>Estimate kWh:</strong> this optional button estimates kWh from SOC gained × vehicle battery size, after warning that it will affect charge-efficiency calculations.</li>
              <li><strong>Measured vs estimated:</strong> Leccy records whether kWh came from the charger or from an estimate, and uses that in analytics and data-quality checks.</li>
              <li><strong>Autosave and revert:</strong> Charging Sessions table edits save automatically. The latest edited row can be reverted until you edit another row.</li>
              <li><strong>Delete with undo:</strong> deleting a session greys the row and offers Revert while it remains the latest changed row.</li>
            </ul>
          </section>

          {/* ── Tariffs ── */}
          <section>
            <h3 className="font-semibold text-green-700 mb-2">5. Setting up electricity tariffs</h3>
            <p className="mb-1">
              Go to <em>Tariff</em> to configure your electricity rates. This is used to calculate
              estimated costs in analytics:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Tariff name:</strong> e.g. "Octopus Go" or "EDF Standard".</li>
              <li><strong>Peak rate (p/kWh):</strong> your standard unit rate in pence.</li>
              <li><strong>Off-peak rate (p/kWh):</strong> your cheaper overnight rate (if applicable).</li>
              <li><strong>Peak start / off-peak start time:</strong> when each rate period begins (24-hour format, e.g. 07:00 / 00:30).</li>
              <li><strong>Standing charge (p/day):</strong> your daily fixed charge in pence.</li>
              <li><strong>Effective from:</strong> the date this tariff started.</li>
            </ul>
            <p className="mt-2">You can store multiple tariffs with different effective dates to track rate changes over time.</p>
            <p className="mt-2">When Data Entry auto-enumerates home costs, it uses the tariff active on each session date.</p>
          </section>

          {/* ── Maintenance ── */}
          <section>
            <h3 className="font-semibold text-green-700 mb-2">6. Logging maintenance</h3>
            <p>
              Use the <em>Maintenance</em> page to keep a log of servicing, repairs, and other
              vehicle costs. Each log entry has a description, date, optional vehicle, and optional
              cost. This gives you a full picture of your total EV ownership costs.
            </p>
          </section>

          {/* ── Analytics ── */}
          <section>
            <h3 className="font-semibold text-green-700 mb-2">7. Viewing analytics</h3>
            <p className="mb-1">
              The <em>Analytics</em> page summarises your data with charts and statistics:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Total cost &amp; cost per mile:</strong> overall spend and efficiency.</li>
              <li><strong>Total kWh &amp; miles driven:</strong> aggregate usage figures.</li>
              <li><strong>Costs and kWh per session:</strong> separate charts with All, Home, and Away filters.</li>
              <li><strong>Battery efficiency:</strong> kWh per mile, with points more than two standard deviations from the mean excluded.</li>
              <li><strong>Temperature vs range:</strong> shows how cold weather affects your EV's range.</li>
              <li><strong>Miles per % battery:</strong> tracks how many miles you get from each percentage point of charge.</li>
            </ul>
            <p className="mt-2 mb-1 font-semibold text-green-700">Advanced analytics</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Ownership Intelligence:</strong> compares your EV spend with a typical petrol-car
                cost over the same odometer miles, including estimated savings and percentage saved.
              </li>
              <li>
                <strong>Odometer-Based Efficiency:</strong> uses odometer differences between charges as
                the measured distance travelled between sessions.
              </li>
              <li>
                <strong>Temperature-Normalised Efficiency:</strong> groups kWh-per-mile performance by
                ambient temperature band so cold-weather effects are easier to see.
              </li>
              <li>
                <strong>Measured-kWh Usable Capacity Proxy:</strong> compares charger-recorded kWh with
                SOC gained. This is a proxy, not a lab battery-health test, and is strongest when kWh is
                recorded from the charger rather than estimated.
              </li>
              <li>
                <strong>Home vs Away Economics:</strong> separates charging cost, kWh, and cost-per-mile
                behaviour by charge type.
              </li>
              <li>
                <strong>Data Quality:</strong> shows how much of your dataset has odometer continuity,
                measured kWh, temperatures, vehicle links, and charge-type labels.
              </li>
              <li>
                <strong>GOM Accuracy:</strong> compares the car's estimated range consumed against
                the actual miles you drove. Points above the diagonal line mean the car
                under-estimated; points below mean it over-estimated. The accuracy ratio is shown as
                a summary badge above the chart. Extreme outliers are removed from the displayed
                scatter using a robust modified z-score limit so one unusual trip does not dominate
                the graph.
              </li>
              <li>
                <strong>Range Anxiety Gauge:</strong> histogram of how full your battery is when you
                plug in. Bars below 20% are shown in orange as a warning. A dashed line marks your
                median plug-in level.
              </li>
              <li>
                <strong>Charging Habits by Day:</strong> bar chart showing which days of the week
                you charge most. Hover over a bar to see the average energy added and percentage
                charged on that day.
              </li>
            </ul>
            <p className="mt-2">
              Use the <strong>date range filter</strong> at the top of the page to focus on a
              specific period, and the <strong>vehicle filter</strong> to view data for a single car.
              If tariff or vehicle setup is missing, Analytics links you directly to the relevant setup page.
            </p>
          </section>

          {/* ── Account settings ── */}
          <section>
            <h3 className="font-semibold text-green-700 mb-2">8. Account settings</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Change password:</strong> enter your current password, then your new password (min 8 chars + 1 special character), and confirm it.</li>
              <li><strong>Enable 2FA:</strong> click <em>Enable 2FA</em>, confirm your email address, then enter the 6-digit code sent to you.</li>
              <li><strong>Disable 2FA:</strong> enter your password to turn off two-factor authentication.</li>
              <li><strong>Charge Reminder Notifications:</strong> enable or disable PWA push reminders and choose the daily reminder time. The default is 07:30.</li>
              <li><strong>My Vehicles:</strong> add or remove vehicles associated with your account.</li>
            </ul>
          </section>

          {/* ── Admin panel ── */}
          <section>
            <h3 className="font-semibold text-green-700 mb-2">9. Admin panel</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>User Management:</strong> administrators can create and remove users.</li>
              <li><strong>SMTP Settings:</strong> configure outgoing email used for magic links and two-factor codes.</li>
              <li><strong>Web Push (VAPID):</strong> configure PWA push notification keys, generate a new key pair, and check whether the private key is configured.</li>
            </ul>
          </section>

          {/* ── Data &amp; privacy ── */}
          <section>
            <h3 className="font-semibold text-green-700 mb-2">10. Your data &amp; privacy</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>All data is stored on the server</strong> that hosts this application — no
                data is sent to third parties.
              </li>
              <li>
                <strong>Delete your account:</strong> go to <em>Account Settings → Danger Zone →
                Delete My Account</em>. Enter your password to confirm. This permanently and
                irreversibly deletes your account and every record associated with it.
              </li>
              <li>
                <strong>Data export / access requests:</strong> contact the administrator to request
                a copy of your data (your right under UK GDPR Article 15).
              </li>
              <li>
                <strong>Sign out:</strong> click your name in the top-right navigation bar, then
                select <em>Sign Out</em>. Your authentication token is removed from the browser
                immediately.
              </li>
            </ul>
            <p className="mt-2">
              For full details about how your data is used and your rights, see the{' '}
              <strong>Privacy Policy</strong> (link in the footer).
            </p>
          </section>

          {/* ── Tips ── */}
          <section>
            <h3 className="font-semibold text-green-700 mb-2">11. Tips &amp; troubleshooting</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>If you are locked out after too many failed login attempts, wait 15 minutes or use a <em>Magic Link</em> to sign in without a password.</li>
              <li>Magic links expire after 15 minutes and can only be used once.</li>
              <li>2FA codes expire after 10 minutes. If your code has expired, go back and sign in again to request a new code.</li>
              <li>Cost figures throughout the app are shown in <strong>pence (p)</strong> to avoid rounding errors. Divide by 100 to convert to pounds (£).</li>
              <li>If a chart shows no data, check that you have logged charging sessions and that the date range includes them.</li>
            </ul>
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
