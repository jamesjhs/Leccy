import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useAuthContext } from '../App';
import { authApi, vehiclesApi, Vehicle } from '../utils/api';

interface ChangePasswordForm {
  current_password: string;
  new_password: string;
  confirm_new_password: string;
}

interface TwoFASetupForm {
  email: string;
}

interface TwoFAVerifyForm {
  code: string;
}

interface DisableTwoFAForm {
  password: string;
}

interface VehicleForm {
  licence_plate: string;
  nickname: string;
}

interface DeleteAccountForm {
  password: string;
  confirm: string;
}

const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent';

export default function AccountSettings() {
  const { user, logout } = useAuthContext();

  // Password change state
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwMagicSent, setPwMagicSent] = useState(false);
  const [pwMagicSending, setPwMagicSending] = useState(false);

  // 2FA state
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [twoFASetupPending, setTwoFASetupPending] = useState(false);
  const [twoFAMsg, setTwoFAMsg] = useState<string | null>(null);
  const [twoFAError, setTwoFAError] = useState<string | null>(null);
  const [disableMsg, setDisableMsg] = useState<string | null>(null);

  // Vehicles state
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleSuccess, setVehicleSuccess] = useState<string | null>(null);
  const [vehicleError, setVehicleError] = useState<string | null>(null);

  // Delete account state
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const {
    register: regPw,
    handleSubmit: handlePwSubmit,
    reset: resetPw,
    watch: watchPw,
    formState: { errors: pwErrors, isSubmitting: pwSubmitting },
  } = useForm<ChangePasswordForm>();

  const newPasswordValue = watchPw('new_password', '');

  const {
    register: reg2faSetup,
    handleSubmit: handle2faSetupSubmit,
    formState: { isSubmitting: setupSubmitting },
  } = useForm<TwoFASetupForm>({ defaultValues: { email: user?.email ?? '' } });

  const {
    register: reg2faVerify,
    handleSubmit: handle2faVerifySubmit,
    reset: reset2faVerify,
    formState: { errors: verifyErrors, isSubmitting: verifySubmitting },
  } = useForm<TwoFAVerifyForm>();

  const {
    register: regDisable,
    handleSubmit: handleDisableSubmit,
    reset: resetDisable,
    formState: { errors: disableErrors, isSubmitting: disableSubmitting },
  } = useForm<DisableTwoFAForm>();

  const {
    register: regVehicle,
    handleSubmit: handleVehicleSubmit,
    reset: resetVehicle,
    formState: { errors: vehicleErrors, isSubmitting: vehicleSubmitting },
  } = useForm<VehicleForm>();

  const {
    register: regDelete,
    handleSubmit: handleDeleteSubmit,
    watch: watchDelete,
    formState: { errors: deleteErrors, isSubmitting: deleteSubmitting },
  } = useForm<DeleteAccountForm>();

  const deleteConfirmValue = watchDelete('confirm', '');

  async function load() {
    try {
      const [statusRes, vehiclesRes] = await Promise.all([
        authApi.get2faStatus(),
        vehiclesApi.getAll(),
      ]);
      setTwoFAEnabled(statusRes.data.enabled);
      setVehicles(vehiclesRes.data.vehicles);
    } catch {/* ignore */}
  }

  useEffect(() => { void load(); }, []);

  async function onChangePassword(data: ChangePasswordForm) {
    setPwError(null);
    setPwSuccess(null);
    setPwMagicSent(false);
    try {
      await authApi.changePassword(data.current_password, data.new_password);
      setPwSuccess('Password updated successfully.');
      resetPw();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to change password.';
      setPwError(msg);
    }
  }

  async function on2faSetup(data: TwoFASetupForm) {
    setTwoFAMsg(null);
    setTwoFAError(null);
    try {
      await authApi.setup2fa(data.email);
      setTwoFASetupPending(true);
      setTwoFAMsg('A verification code has been sent to your email. Enter it below to enable 2FA.');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to initiate 2FA setup.';
      setTwoFAError(msg);
    }
  }

  async function on2faVerify(data: TwoFAVerifyForm) {
    setTwoFAMsg(null);
    setTwoFAError(null);
    try {
      await authApi.verify2fa(data.code);
      setTwoFAMsg('Two-factor authentication enabled.');
      setTwoFASetupPending(false);
      setTwoFAEnabled(true);
      reset2faVerify();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Invalid code. Please try again.';
      setTwoFAError(msg);
    }
  }

  async function onDisable2fa(data: DisableTwoFAForm) {
    setDisableMsg(null);
    setTwoFAError(null);
    try {
      await authApi.disable2fa(data.password);
      setTwoFAEnabled(false);
      setDisableMsg('Two-factor authentication has been disabled.');
      resetDisable();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to disable 2FA.';
      setTwoFAError(msg);
    }
  }

  async function onAddVehicle(data: VehicleForm) {
    setVehicleError(null);
    setVehicleSuccess(null);
    try {
      const plate = data.licence_plate.replace(/\s+/g, '').toUpperCase();
      await vehiclesApi.create({ licence_plate: plate, nickname: data.nickname || undefined });
      setVehicleSuccess('Vehicle added.');
      resetVehicle();
      void load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to add vehicle.';
      setVehicleError(msg);
    }
  }

  async function onDeleteVehicle(id: number, plate: string) {
    if (!confirm(`Remove vehicle ${plate}?`)) return;
    try {
      await vehiclesApi.delete(id);
      void load();
    } catch {/* ignore */}
  }

  async function onDeleteAccount(data: DeleteAccountForm) {
    setDeleteError(null);
    if (data.confirm !== 'DELETE') {
      setDeleteError('Please type DELETE (in capitals) to confirm.');
      return;
    }
    try {
      await authApi.deleteAccount(data.password);
      // Clear local state and redirect to login
      await logout();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to delete account. Please try again.';
      setDeleteError(msg);
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-green-900">Account Settings</h1>

      {/* Account Info */}
      <section className="bg-white rounded-xl shadow-sm border border-green-100 p-6">
        <h2 className="text-lg font-bold text-green-900 mb-3">Account</h2>
        <p className="text-sm text-gray-600">
          <span className="font-semibold">Email:</span> {user?.email ?? '—'}
        </p>
        {user?.display_name && (
          <p className="text-sm text-gray-600 mt-1">
            <span className="font-semibold">Name:</span> {user.display_name}
          </p>
        )}
      </section>

      {/* Change Password */}
      <section className="bg-white rounded-xl shadow-sm border border-green-100 p-6">
        <h2 className="text-lg font-bold text-green-900 mb-4">Change Password</h2>

        {pwSuccess && <div className="bg-green-50 border border-green-300 text-green-700 rounded-lg px-4 py-3 mb-4 text-sm">{pwSuccess}</div>}
        {pwError && (
          <div className="bg-red-50 border border-red-300 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">
            <p>{pwError}</p>
            {pwError.toLowerCase().includes('incorrect') && (
              <p className="mt-2">
                {pwMagicSent ? (
                  <span className="text-green-700 font-medium">✓ Sign-in link sent — check your email.</span>
                ) : (
                  <button
                    type="button"
                    disabled={pwMagicSending}
                    className="underline font-medium text-red-700 hover:text-red-900 disabled:opacity-60"
                    onClick={async () => {
                      if (!user?.email) return;
                      setPwMagicSending(true);
                      try {
                        await authApi.requestMagicLink(user.email);
                      } finally {
                        setPwMagicSending(false);
                        setPwMagicSent(true);
                      }
                    }}
                  >
                    {pwMagicSending ? 'Sending…' : 'Forgot your password? Send me a sign-in link instead.'}
                  </button>
                )}
              </p>
            )}
          </div>
        )}

        <form onSubmit={handlePwSubmit(onChangePassword)} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Current Password</label>
            <input
              type="password"
              autoComplete="current-password"
              className={inputClass}
              {...regPw('current_password', { required: 'Required' })}
            />
            {pwErrors.current_password && <p className="text-red-500 text-xs mt-1">{pwErrors.current_password.message}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">New Password</label>
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Min 8 chars, 1 special character"
              className={inputClass}
              {...regPw('new_password', {
                required: 'Required',
                minLength: { value: 8, message: 'Min 8 characters' },
                pattern: { value: /[^a-zA-Z0-9]/, message: 'Must include a special character' },
              })}
            />
            {pwErrors.new_password && <p className="text-red-500 text-xs mt-1">{pwErrors.new_password.message}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Confirm New Password</label>
            <input
              type="password"
              autoComplete="new-password"
              className={inputClass}
              {...regPw('confirm_new_password', {
                required: 'Required',
                validate: (val) => val === newPasswordValue || 'Passwords do not match',
              })}
            />
            {pwErrors.confirm_new_password && <p className="text-red-500 text-xs mt-1">{pwErrors.confirm_new_password.message}</p>}
          </div>
          <button
            type="submit"
            disabled={pwSubmitting}
            className="bg-green-700 hover:bg-green-600 disabled:bg-green-400 text-white font-bold px-5 py-2 rounded-lg text-sm transition-colors"
          >
            {pwSubmitting ? 'Saving…' : 'Change Password'}
          </button>
        </form>
      </section>

      {/* Two-Factor Authentication */}
      <section className="bg-white rounded-xl shadow-sm border border-green-100 p-6">
        <h2 className="text-lg font-bold text-green-900 mb-2">Two-Factor Authentication</h2>
        <p className="text-sm text-gray-500 mb-4">
          {twoFAEnabled
            ? '2FA is currently enabled. You will receive an email code each time you log in.'
            : 'Add an extra layer of security. You will receive an email code each time you log in.'}
        </p>

        {twoFAMsg && <div className="bg-blue-50 border border-blue-300 text-blue-700 rounded-lg px-4 py-3 mb-4 text-sm">{twoFAMsg}</div>}
        {disableMsg && <div className="bg-green-50 border border-green-300 text-green-700 rounded-lg px-4 py-3 mb-4 text-sm">{disableMsg}</div>}
        {twoFAError && <div className="bg-red-50 border border-red-300 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{twoFAError}</div>}

        {!twoFAEnabled ? (
          <>
            <form onSubmit={handle2faSetupSubmit(on2faSetup)} className="flex gap-3 mb-4">
              <input
                type="email"
                placeholder="Email for 2FA codes"
                className={`${inputClass} flex-1`}
                defaultValue={user?.email ?? ''}
                {...reg2faSetup('email', { required: true })}
              />
              <button
                type="submit"
                disabled={setupSubmitting}
                className="bg-green-700 hover:bg-green-600 disabled:bg-green-400 text-white font-bold px-5 py-2 rounded-lg text-sm transition-colors whitespace-nowrap"
              >
                {setupSubmitting ? 'Sending…' : 'Enable 2FA'}
              </button>
            </form>

            {twoFASetupPending && (
              <form onSubmit={handle2faVerifySubmit(on2faVerify)} className="flex gap-3">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Enter 6-digit code"
                  maxLength={20}
                  className={`${inputClass} flex-1 tracking-widest font-mono`}
                  {...reg2faVerify('code', { required: 'Code is required' })}
                />
                <button
                  type="submit"
                  disabled={verifySubmitting}
                  className="bg-blue-700 hover:bg-blue-600 disabled:bg-blue-400 text-white font-bold px-5 py-2 rounded-lg text-sm transition-colors"
                >
                  {verifySubmitting ? 'Verifying…' : 'Verify'}
                </button>
              </form>
            )}
            {verifyErrors.code && <p className="text-red-500 text-xs mt-1">{verifyErrors.code.message}</p>}
          </>
        ) : (
          <form onSubmit={handleDisableSubmit(onDisable2fa)} className="flex gap-3">
            <input
              type="password"
              placeholder="Enter your password to disable 2FA"
              className={`${inputClass} flex-1`}
              autoComplete="current-password"
              {...regDisable('password', { required: 'Password is required' })}
            />
            <button
              type="submit"
              disabled={disableSubmitting}
              className="bg-red-600 hover:bg-red-500 disabled:bg-red-400 text-white font-bold px-5 py-2 rounded-lg text-sm transition-colors whitespace-nowrap"
            >
              {disableSubmitting ? 'Disabling…' : 'Disable 2FA'}
            </button>
          </form>
        )}
        {disableErrors.password && <p className="text-red-500 text-xs mt-1">{disableErrors.password.message}</p>}
      </section>

      {/* Vehicles */}
      <section className="bg-white rounded-xl shadow-sm border border-green-100 p-6">
        <h2 className="text-lg font-bold text-green-900 mb-4">My Vehicles</h2>
        <p className="text-sm text-gray-500 mb-4">Add your vehicles to track charging costs per car.</p>

        {vehicles.length > 0 && (
          <div className="overflow-x-auto mb-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-green-700 border-b border-green-100">
                  <th className="pb-2 pr-4">Licence Plate</th>
                  <th className="pb-2 pr-4">Nickname</th>
                  <th className="pb-2 pr-4">Added</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v.id} className="border-b border-gray-50 hover:bg-green-50">
                    <td className="py-2 pr-4 font-mono font-semibold">{v.licence_plate}</td>
                    <td className="py-2 pr-4 text-gray-500">{v.nickname ?? '—'}</td>
                    <td className="py-2 pr-4 text-gray-400 text-xs">{new Date(v.created_at).toLocaleDateString()}</td>
                    <td className="py-2">
                      <button
                        onClick={() => onDeleteVehicle(v.id, v.licence_plate)}
                        className="text-red-400 hover:text-red-600 text-xs font-medium transition-colors"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {vehicleSuccess && <div className="bg-green-50 border border-green-300 text-green-700 rounded-lg px-4 py-3 mb-3 text-sm">{vehicleSuccess}</div>}
        {vehicleError && <div className="bg-red-50 border border-red-300 text-red-700 rounded-lg px-4 py-3 mb-3 text-sm">{vehicleError}</div>}

        <form onSubmit={handleVehicleSubmit(onAddVehicle)} className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-40">
            <input
              type="text"
              placeholder="Licence plate (e.g. AB12 CDE)"
              maxLength={30}
              spellCheck={false}
              className={`${inputClass} uppercase`}
              {...regVehicle('licence_plate', { required: 'Licence plate is required' })}
            />
            {vehicleErrors.licence_plate && <p className="text-red-500 text-xs mt-1">{vehicleErrors.licence_plate.message}</p>}
          </div>
          <div className="flex-1 min-w-40">
            <input
              type="text"
              placeholder="Nickname (optional, e.g. My Tesla)"
              maxLength={100}
              className={inputClass}
              {...regVehicle('nickname')}
            />
          </div>
          <button
            type="submit"
            disabled={vehicleSubmitting}
            className="bg-green-700 hover:bg-green-600 disabled:bg-green-400 text-white font-bold px-5 py-2 rounded-lg text-sm transition-colors"
          >
            {vehicleSubmitting ? 'Adding…' : 'Add Vehicle'}
          </button>
        </form>
      </section>

      {/* Danger Zone — Delete Account */}
      <section className="bg-white rounded-xl shadow-sm border border-red-200 p-6">
        <h2 className="text-lg font-bold text-red-700 mb-2">⚠ Danger Zone</h2>
        <h3 className="text-sm font-semibold text-red-600 mb-2">Delete My Account</h3>
        <p className="text-sm text-gray-600 mb-1">
          This will <strong>permanently and irreversibly</strong> delete your account and all
          associated data, including charging sessions, charger costs, maintenance logs, tariff
          configurations, and vehicles. This action cannot be undone.
        </p>
        <p className="text-sm text-gray-600 mb-4">
          Under UK GDPR Article 17 (right to erasure) you are entitled to request deletion of your
          data at any time. Submitting this form will action that request immediately.
        </p>

        {deleteError && (
          <div className="bg-red-50 border border-red-300 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">
            {deleteError}
          </div>
        )}

        <form onSubmit={handleDeleteSubmit(onDeleteAccount)} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Enter your password to confirm
            </label>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Your current password"
              className={inputClass}
              {...regDelete('password', { required: 'Password is required' })}
            />
            {deleteErrors.password && (
              <p className="text-red-500 text-xs mt-1">{deleteErrors.password.message}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Type <code className="bg-gray-100 px-1 rounded">DELETE</code> to confirm
            </label>
            <input
              type="text"
              placeholder="DELETE"
              autoComplete="off"
              spellCheck={false}
              className={inputClass}
              {...regDelete('confirm', {
                required: 'Please type DELETE to confirm',
                validate: (v) => v === 'DELETE' || 'You must type DELETE in capitals',
              })}
            />
            {deleteErrors.confirm && (
              <p className="text-red-500 text-xs mt-1">{deleteErrors.confirm.message}</p>
            )}
          </div>
          <button
            type="submit"
            disabled={deleteSubmitting || deleteConfirmValue !== 'DELETE'}
            className="bg-red-600 hover:bg-red-500 disabled:bg-red-300 text-white font-bold px-5 py-2 rounded-lg text-sm transition-colors"
          >
            {deleteSubmitting ? 'Deleting…' : 'Permanently Delete My Account'}
          </button>
        </form>
      </section>
    </div>
  );
}
