import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useAuthContext } from '../App';
import { authApi } from '../utils/api';
import PublicFooter from '../components/PublicFooter';

type Tab = 'password' | 'magic';

interface PasswordForm {
  email: string;
  password: string;
  _hp: string;
}

interface MagicLinkForm {
  email: string;
  _hp: string;
}

interface TwoFAForm {
  code: string;
}

/** Minimum elapsed time (ms) before a form submission is considered human */
const MIN_HUMAN_MS = 1_000;

export default function Login() {
  const { login, verifyMagicLink, setAuth } = useAuthContext();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [tab, setTab] = useState<Tab>('password');
  const [apiError, setApiError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 2FA state
  const [twoFAPending, setTwoFAPending] = useState(false);
  const [tempToken, setTempToken] = useState<string>('');

  const mountTime = useRef(Date.now());

  // Auto-verify magic link token from URL
  useEffect(() => {
    const magic = searchParams.get('magic');
    if (magic) {
      setIsSubmitting(true);
      verifyMagicLink(magic)
        .then(() => navigate('/dashboard'))
        .catch(() => {
          setApiError('Magic link is invalid or has expired. Please request a new one.');
          setIsSubmitting(false);
        });
    }
  }, [searchParams, verifyMagicLink, navigate]);

  const {
    register: regPw,
    handleSubmit: handlePwSubmit,
    formState: { errors: pwErrors },
  } = useForm<PasswordForm>({ mode: 'onBlur', defaultValues: { _hp: '' } });

  const {
    register: regMl,
    handleSubmit: handleMlSubmit,
    formState: { errors: mlErrors },
  } = useForm<MagicLinkForm>({ mode: 'onBlur', defaultValues: { _hp: '' } });

  const {
    register: reg2fa,
    handleSubmit: handle2faSubmit,
    formState: { errors: errors2fa },
  } = useForm<TwoFAForm>({ mode: 'onBlur' });

  async function onPasswordSubmit(data: PasswordForm) {
    setApiError(null);
    const elapsed = Date.now() - mountTime.current;
    if (data._hp || elapsed < MIN_HUMAN_MS) {
      setIsSubmitting(true);
      await new Promise((r) => setTimeout(r, 2_000));
      setApiError('Login failed. Please try again.');
      setIsSubmitting(false);
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await login(data.email, data.password);
      if (result.requires_2fa && result.temp_token) {
        setTempToken(result.temp_token);
        setTwoFAPending(true);
      } else {
        navigate('/dashboard');
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Login failed. Please try again.';
      setApiError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onMagicLinkSubmit(data: MagicLinkForm) {
    setApiError(null);
    setSuccessMsg(null);
    const elapsed = Date.now() - mountTime.current;
    if (data._hp || elapsed < MIN_HUMAN_MS) {
      setIsSubmitting(true);
      await new Promise((r) => setTimeout(r, 2_000));
      setSuccessMsg('If an account exists, a magic link has been sent to your email.');
      setIsSubmitting(false);
      return;
    }
    setIsSubmitting(true);
    try {
      await authApi.requestMagicLink(data.email);
      setSuccessMsg('If an account exists, a magic link has been sent to your email.');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to send magic link. Please try again.';
      setApiError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function on2faSubmit(data: TwoFAForm) {
    setApiError(null);
    setIsSubmitting(true);
    try {
      const res = await authApi.verify2faLogin(tempToken, data.code);
      setAuth(res.data.token, res.data.user);
      navigate('/dashboard');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Invalid code. Please try again.';
      setApiError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isSubmitting && searchParams.get('magic')) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-green-700 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="text-4xl mb-3">⚡</div>
          <p className="text-green-200">Signing you in…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-green-700 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">⚡</div>
          <h1 className="text-4xl font-extrabold text-white tracking-tight">Leccy</h1>
          <p className="text-green-300 mt-1 text-sm">EV Cost Tracker</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {twoFAPending ? (
            <>
              <h2 className="text-2xl font-bold text-green-900 mb-2 text-center">Two-Factor Authentication</h2>
              <p className="text-sm text-gray-500 text-center mb-6">A verification code has been sent to your email.</p>

              {apiError && (
                <div role="alert" className="bg-red-50 border border-red-300 text-red-700 rounded-lg px-4 py-3 mb-5 text-sm">
                  {apiError}
                </div>
              )}

              <form onSubmit={handle2faSubmit(on2faSubmit)} className="space-y-5">
                <div>
                  <label htmlFor="code" className="block text-sm font-semibold text-gray-700 mb-1">Verification Code</label>
                  <input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="6-digit code"
                    maxLength={20}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm tracking-widest text-center font-mono"
                    {...reg2fa('code', { required: 'Code is required' })}
                  />
                  {errors2fa.code && (
                    <p role="alert" className="text-red-500 text-xs mt-1">{errors2fa.code.message}</p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-green-700 hover:bg-green-600 disabled:bg-green-400 text-white font-bold py-3 rounded-lg transition-colors text-sm tracking-wide"
                >
                  {isSubmitting ? 'Verifying…' : 'Verify'}
                </button>
                <button
                  type="button"
                  onClick={() => { setTwoFAPending(false); setApiError(null); }}
                  className="w-full text-sm text-gray-500 hover:text-gray-700"
                >
                  ← Back to sign in
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-green-900 mb-6 text-center">Sign in</h2>

              {/* Tabs */}
              <div className="flex rounded-lg overflow-hidden border border-gray-200 mb-6">
                <button
                  type="button"
                  onClick={() => { setTab('password'); setApiError(null); setSuccessMsg(null); }}
                  className={`flex-1 py-2 text-sm font-semibold transition-colors ${tab === 'password' ? 'bg-green-700 text-white' : 'bg-white text-gray-600 hover:bg-green-50'}`}
                >
                  Password
                </button>
                <button
                  type="button"
                  onClick={() => { setTab('magic'); setApiError(null); setSuccessMsg(null); }}
                  className={`flex-1 py-2 text-sm font-semibold transition-colors ${tab === 'magic' ? 'bg-green-700 text-white' : 'bg-white text-gray-600 hover:bg-green-50'}`}
                >
                  Magic Link
                </button>
              </div>

              {apiError && (
                <div role="alert" className="bg-red-50 border border-red-300 text-red-700 rounded-lg px-4 py-3 mb-5 text-sm">
                  {apiError}
                </div>
              )}
              {successMsg && (
                <div role="status" className="bg-green-50 border border-green-300 text-green-700 rounded-lg px-4 py-3 mb-5 text-sm">
                  {successMsg}
                </div>
              )}

              {tab === 'password' ? (
                <form onSubmit={handlePwSubmit(onPasswordSubmit)} noValidate className="space-y-5">
                  {/* Honeypot */}
                  <div
                    aria-hidden="true"
                    style={{ position: 'absolute', left: '-9999px', top: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }}
                    tabIndex={-1}
                  >
                    <label htmlFor="_hp_website">Leave this blank</label>
                    <input id="_hp_website" type="text" autoComplete="off" tabIndex={-1} {...regPw('_hp')} />
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      maxLength={255}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                      {...regPw('email', {
                        required: 'Email is required',
                        pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Invalid email address' },
                      })}
                    />
                    {pwErrors.email && <p role="alert" className="text-red-500 text-xs mt-1">{pwErrors.email.message}</p>}
                  </div>

                  <div>
                    <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-1">Password</label>
                    <input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      placeholder="Your password"
                      maxLength={128}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                      {...regPw('password', { required: 'Password is required' })}
                    />
                    {pwErrors.password && <p role="alert" className="text-red-500 text-xs mt-1">{pwErrors.password.message}</p>}
                  <div className="text-right mt-1">
                    <button
                      type="button"
                      onClick={() => { setTab('magic'); setApiError(null); setSuccessMsg(null); }}
                      className="text-xs text-green-700 hover:text-green-600 font-medium"
                    >
                      Forgot password?
                    </button>
                  </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-green-700 hover:bg-green-600 disabled:bg-green-400 text-white font-bold py-3 rounded-lg transition-colors text-sm tracking-wide"
                  >
                    {isSubmitting ? 'Signing in…' : 'Sign in'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleMlSubmit(onMagicLinkSubmit)} noValidate className="space-y-5">
                  {/* Honeypot */}
                  <div
                    aria-hidden="true"
                    style={{ position: 'absolute', left: '-9999px', top: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }}
                    tabIndex={-1}
                  >
                    <label htmlFor="_hp_ml">Leave this blank</label>
                    <input id="_hp_ml" type="text" autoComplete="off" tabIndex={-1} {...regMl('_hp')} />
                  </div>

                  <p className="text-sm text-gray-500">Enter your email and we'll send you a one-click sign-in link — no password needed. You can also use this if you've forgotten your password.</p>

                  <div>
                    <label htmlFor="ml_email" className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
                    <input
                      id="ml_email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      maxLength={255}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                      {...regMl('email', {
                        required: 'Email is required',
                        pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Invalid email address' },
                      })}
                    />
                    {mlErrors.email && <p role="alert" className="text-red-500 text-xs mt-1">{mlErrors.email.message}</p>}
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-green-700 hover:bg-green-600 disabled:bg-green-400 text-white font-bold py-3 rounded-lg transition-colors text-sm tracking-wide"
                  >
                    {isSubmitting ? 'Sending…' : 'Send Magic Link'}
                  </button>
                </form>
              )}

              <div className="mt-6 text-center text-sm text-gray-500">
                Don't have an account?{' '}
                <Link to="/register" className="text-green-700 font-semibold hover:text-green-600">
                  Create one
                </Link>
              </div>
            </>
          )}
        </div>

        <PublicFooter />
      </div>
    </div>
  );
}

