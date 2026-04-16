import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { adminApi, UserInfo, AppSetting, NewUser } from '../utils/api';

interface UserForm {
  licence_plate: string;
  password: string;
  email?: string;
  is_admin: boolean;
}

interface SmtpForm {
  SMTP_HOST: string;
  SMTP_PORT: string;
  SMTP_SECURE: string;
  SMTP_USER: string;
  SMTP_PASS: string;
  SMTP_FROM: string;
}

interface TwoFAForm {
  email: string;
}

interface VerifyForm {
  code: string;
}

export default function Admin() {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [settings, setSettings] = useState<AppSetting[]>([]);
  const [userSuccess, setUserSuccess] = useState<string | null>(null);
  const [userError, setUserError] = useState<string | null>(null);
  const [smtpSuccess, setSmtpSuccess] = useState<string | null>(null);
  const [twoFAMsg, setTwoFAMsg] = useState<string | null>(null);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);

  const {
    register: registerUser,
    handleSubmit: handleUserSubmit,
    reset: resetUser,
    formState: { errors: userErrors, isSubmitting: userSubmitting },
  } = useForm<UserForm>({ defaultValues: { is_admin: false } });

  const {
    register: registerSmtp,
    handleSubmit: handleSmtpSubmit,
    setValue: setSmtpValue,
    formState: { isSubmitting: smtpSubmitting },
  } = useForm<SmtpForm>();

  const {
    register: register2FA,
    handleSubmit: handle2FASubmit,
    formState: { isSubmitting: twoFASubmitting },
  } = useForm<TwoFAForm>();

  const {
    register: registerVerify,
    handleSubmit: handleVerifySubmit,
    formState: { isSubmitting: verifySubmitting },
  } = useForm<VerifyForm>();

  async function load() {
    try {
      const [usersRes, settingsRes] = await Promise.all([adminApi.getUsers(), adminApi.getSettings()]);
      setUsers(usersRes.data.users);
      setSettings(settingsRes.data.settings);
      // Populate SMTP form
      for (const s of settingsRes.data.settings) {
        if (['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'].includes(s.key)) {
          setSmtpValue(s.key as keyof SmtpForm, s.value);
        }
      }
    } catch {/* ignore */}
  }

  useEffect(() => { void load(); }, []);

  async function onCreateUser(data: UserForm) {
    setUserError(null);
    setUserSuccess(null);
    try {
      // Normalise: strip spaces and uppercase before sending
      const normalisedPlate = data.licence_plate.replace(/\s+/g, '').toUpperCase();
      const payload: NewUser = {
        licence_plate: normalisedPlate,
        password: data.password,
        email: data.email || undefined,
        is_admin: data.is_admin,
      };
      await adminApi.createUser(payload);
      setUserSuccess('User created successfully!');
      resetUser({ is_admin: false });
      void load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to create user';
      setUserError(msg);
    }
  }

  async function deleteUser(id: number, plate: string) {
    if (!confirm(`Delete user ${plate}? This will also delete all their data.`)) return;
    try {
      await adminApi.deleteUser(id);
      void load();
    } catch {/* ignore */}
  }

  async function onSaveSmtp(data: SmtpForm) {
    setSmtpSuccess(null);
    try {
      await adminApi.updateSettings(data as unknown as Record<string, string>);
      setSmtpSuccess('SMTP settings saved!');
    } catch {/* ignore */}
  }

  async function on2FASetup(data: TwoFAForm) {
    setTwoFAMsg(null);
    try {
      await adminApi.setup2fa(data.email);
      setTwoFAMsg('2FA setup initiated. Enter the verification code below.');
    } catch {/* ignore */}
  }

  async function onVerify(data: VerifyForm) {
    setVerifyMsg(null);
    try {
      await adminApi.verify2fa(data.code);
      setVerifyMsg('2FA enabled successfully!');
    } catch {
      setVerifyMsg('Invalid code. Please try again.');
    }
  }

  const getSettingValue = (key: string) => settings.find((s) => s.key === key)?.value ?? '';

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-green-900">Admin Panel</h1>

      {/* User Management */}
      <section className="bg-white rounded-xl shadow-sm border border-green-100 p-6">
        <h2 className="text-lg font-bold text-green-900 mb-4">User Management</h2>

        <div className="overflow-x-auto mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-green-700 border-b border-green-100">
                <th className="pb-2 pr-3">Licence Plate</th>
                <th className="pb-2 pr-3">Email</th>
                <th className="pb-2 pr-3">Admin</th>
                <th className="pb-2 pr-3">Created</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-gray-50 hover:bg-green-50">
                  <td className="py-2 pr-3 font-mono font-semibold">{u.licence_plate}</td>
                  <td className="py-2 pr-3 text-gray-500">{u.email ?? '—'}</td>
                  <td className="py-2 pr-3">
                    {u.is_admin ? (
                      <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-semibold">Admin</span>
                    ) : (
                      <span className="text-gray-400 text-xs">User</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-gray-400 text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="py-2">
                    <button
                      onClick={() => deleteUser(u.id, u.licence_plate)}
                      className="text-red-400 hover:text-red-600 text-xs font-medium transition-colors"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="text-sm font-bold text-green-800 mb-3">Create New User</h3>
        {userSuccess && <div className="bg-green-50 border border-green-300 text-green-700 rounded-lg px-4 py-3 mb-4 text-sm">{userSuccess}</div>}
        {userError && <div className="bg-red-50 border border-red-300 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{userError}</div>}

        <form onSubmit={handleUserSubmit(onCreateUser)} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Licence Plate</label>
              <input
                type="text"
                className={`${inputClass} uppercase`}
                placeholder="e.g. AB12 CDE"
                {...registerUser('licence_plate', { required: 'Required' })}
              />
              {userErrors.licence_plate && <p className="text-red-500 text-xs mt-1">{userErrors.licence_plate.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Password</label>
              <input
                type="password"
                className={inputClass}
                placeholder="Min 8 chars, 1 special char"
                {...registerUser('password', {
                  required: 'Required',
                  minLength: { value: 8, message: 'Min 8 chars' },
                  pattern: { value: /[^a-zA-Z0-9]/, message: 'Must contain special char' },
                })}
              />
              {userErrors.password && <p className="text-red-500 text-xs mt-1">{userErrors.password.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Email (optional)</label>
              <input type="email" className={inputClass} {...registerUser('email')} />
            </div>
            <div className="flex items-center gap-2 mt-5">
              <input type="checkbox" id="is_admin" className="accent-green-600 w-4 h-4" {...registerUser('is_admin')} />
              <label htmlFor="is_admin" className="text-sm text-gray-700 font-medium">Grant admin privileges</label>
            </div>
          </div>
          <button
            type="submit"
            disabled={userSubmitting}
            className="bg-green-700 hover:bg-green-600 disabled:bg-green-400 text-white font-bold px-5 py-2 rounded-lg text-sm transition-colors"
          >
            {userSubmitting ? 'Creating…' : 'Create User'}
          </button>
        </form>
      </section>

      {/* SMTP Settings */}
      <section className="bg-white rounded-xl shadow-sm border border-green-100 p-6">
        <h2 className="text-lg font-bold text-green-900 mb-4">SMTP Settings</h2>
        {smtpSuccess && <div className="bg-green-50 border border-green-300 text-green-700 rounded-lg px-4 py-3 mb-4 text-sm">{smtpSuccess}</div>}

        <form onSubmit={handleSmtpSubmit(onSaveSmtp)} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">SMTP Host</label>
              <input type="text" className={inputClass} defaultValue={getSettingValue('SMTP_HOST')} {...registerSmtp('SMTP_HOST')} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">SMTP Port</label>
              <input type="text" className={inputClass} defaultValue={getSettingValue('SMTP_PORT')} {...registerSmtp('SMTP_PORT')} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">SMTP User</label>
              <input type="text" className={inputClass} defaultValue={getSettingValue('SMTP_USER')} {...registerSmtp('SMTP_USER')} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">SMTP Password</label>
              <input type="password" className={inputClass} {...registerSmtp('SMTP_PASS')} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">From Address</label>
              <input type="email" className={inputClass} defaultValue={getSettingValue('SMTP_FROM')} {...registerSmtp('SMTP_FROM')} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Secure (true/false)</label>
              <input type="text" className={inputClass} defaultValue={getSettingValue('SMTP_SECURE')} {...registerSmtp('SMTP_SECURE')} />
            </div>
          </div>
          <button
            type="submit"
            disabled={smtpSubmitting}
            className="bg-green-700 hover:bg-green-600 disabled:bg-green-400 text-white font-bold px-5 py-2 rounded-lg text-sm transition-colors"
          >
            {smtpSubmitting ? 'Saving…' : 'Save SMTP Settings'}
          </button>
        </form>
      </section>

      {/* 2FA Setup */}
      <section className="bg-white rounded-xl shadow-sm border border-green-100 p-6">
        <h2 className="text-lg font-bold text-green-900 mb-4">Two-Factor Authentication</h2>
        <p className="text-sm text-gray-500 mb-4">
          Set up 2FA for your admin account. An email will be required for verification codes.
        </p>

        {twoFAMsg && <div className="bg-blue-50 border border-blue-300 text-blue-700 rounded-lg px-4 py-3 mb-4 text-sm">{twoFAMsg}</div>}

        <form onSubmit={handle2FASubmit(on2FASetup)} className="flex gap-3 mb-6">
          <input
            type="email"
            placeholder="Admin email for 2FA"
            className={`${inputClass} flex-1`}
            {...register2FA('email', { required: true })}
          />
          <button
            type="submit"
            disabled={twoFASubmitting}
            className="bg-green-700 hover:bg-green-600 disabled:bg-green-400 text-white font-bold px-5 py-2 rounded-lg text-sm transition-colors"
          >
            {twoFASubmitting ? 'Setting up…' : 'Setup 2FA'}
          </button>
        </form>

        {verifyMsg && <div className="bg-blue-50 border border-blue-300 text-blue-700 rounded-lg px-4 py-3 mb-4 text-sm">{verifyMsg}</div>}

        <form onSubmit={handleVerifySubmit(onVerify)} className="flex gap-3">
          <input
            type="text"
            placeholder="Enter verification code"
            className={`${inputClass} flex-1`}
            {...registerVerify('code', { required: true })}
          />
          <button
            type="submit"
            disabled={verifySubmitting}
            className="bg-blue-700 hover:bg-blue-600 disabled:bg-blue-400 text-white font-bold px-5 py-2 rounded-lg text-sm transition-colors"
          >
            {verifySubmitting ? 'Verifying…' : 'Verify'}
          </button>
        </form>
      </section>
    </div>
  );
}

const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent';
