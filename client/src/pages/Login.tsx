import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useAuthContext } from '../App';

interface LoginForm {
  licence_plate: string;
  password: string;
  /** Honeypot — must stay empty; bots fill it */
  _hp: string;
}

/** Minimum elapsed time (ms) before a form submission is considered human */
const MIN_HUMAN_MS = 1_000;

export default function Login() {
  const { login } = useAuthContext();
  const navigate = useNavigate();
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /** Timestamp when the Login component first mounted */
  const mountTime = useRef(Date.now());

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<LoginForm>({ mode: 'onBlur', defaultValues: { _hp: '' } });

  const licencePlateValue = watch('licence_plate', '');

  // Normalise licence plate: strip spaces, convert to uppercase
  function normalisePlate(value: string): string {
    return value.replace(/\s+/g, '').toUpperCase();
  }

  async function onSubmit(data: LoginForm) {
    setApiError(null);

    // ── Bot detection ──────────────────────────────────────────────────────
    // 1. Honeypot: hidden field filled → automated submission
    // 2. Timing:   form submitted faster than a human could type
    const elapsed = Date.now() - mountTime.current;
    if (data._hp || elapsed < MIN_HUMAN_MS) {
      // Mimic a real login delay so the bot cannot measure the difference
      setIsSubmitting(true);
      await new Promise((r) => setTimeout(r, 2_000));
      setApiError('Login failed. Please try again.');
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(true);
    try {
      await login(normalisePlate(data.licence_plate), data.password);
      navigate('/dashboard');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Login failed. Please try again.';
      setApiError(msg);
    } finally {
      setIsSubmitting(false);
    }
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
          <h2 className="text-2xl font-bold text-green-900 mb-6 text-center">Sign in</h2>

          {apiError && (
            <div role="alert" className="bg-red-50 border border-red-300 text-red-700 rounded-lg px-4 py-3 mb-5 text-sm">
              {apiError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
            {/* ── Honeypot trap ─────────────────────────────────────────────
                Visually hidden from real users; bots typically auto-fill it.
                CSS hides it (not display:none — some bots detect that).     */}
            <div
              aria-hidden="true"
              style={{ position: 'absolute', left: '-9999px', top: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }}
              tabIndex={-1}
            >
              <label htmlFor="_hp_website">Leave this blank</label>
              <input
                id="_hp_website"
                type="text"
                autoComplete="off"
                tabIndex={-1}
                {...register('_hp')}
              />
            </div>

            <div>
              <label htmlFor="licence_plate" className="block text-sm font-semibold text-gray-700 mb-1">
                Licence Plate
              </label>
              <input
                id="licence_plate"
                type="text"
                autoComplete="username"
                placeholder="e.g. AB12 CDE"
                maxLength={30}
                spellCheck={false}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 uppercase tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                {...register('licence_plate', {
                  required: 'Licence plate is required',
                  onChange: (e) =>
                    setValue('licence_plate', (e.target.value as string).toUpperCase()),
                })}
                value={licencePlateValue.toUpperCase()}
              />
              {errors.licence_plate && (
                <p role="alert" className="text-red-500 text-xs mt-1">{errors.licence_plate.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-1">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="Min 8 chars, 1 special character"
                maxLength={128}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                {...register('password', {
                  required: 'Password is required',
                  minLength: { value: 8, message: 'Password must be at least 8 characters' },
                  pattern: {
                    value: /[^a-zA-Z0-9]/,
                    message: 'Password must contain at least one special character',
                  },
                })}
              />
              {errors.password && (
                <p role="alert" className="text-red-500 text-xs mt-1">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-green-700 hover:bg-green-600 disabled:bg-green-400 text-white font-bold py-3 rounded-lg transition-colors text-sm tracking-wide"
            >
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-green-400 text-xs text-center mt-6">
          © J Rowson 2026 · jahosi.co.uk
        </p>
      </div>
    </div>
  );
}
