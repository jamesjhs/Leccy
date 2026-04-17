import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useAuthContext } from '../App';
import PublicFooter from '../components/PublicFooter';

interface RegisterForm {
  display_name: string;
  email: string;
  password: string;
  confirm_password: string;
  _hp: string;
}

const MIN_HUMAN_MS = 1_500;

export default function Register() {
  const { register: registerUser } = useAuthContext();
  const navigate = useNavigate();
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const mountTime = useRef(Date.now());

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<RegisterForm>({ mode: 'onBlur', defaultValues: { _hp: '' } });

  const passwordValue = watch('password', '');

  async function onSubmit(data: RegisterForm) {
    setApiError(null);

    const elapsed = Date.now() - mountTime.current;
    if (data._hp || elapsed < MIN_HUMAN_MS) {
      setIsSubmitting(true);
      await new Promise((r) => setTimeout(r, 2_000));
      setApiError('Registration failed. Please try again.');
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(true);
    try {
      await registerUser(data.email, data.password, data.display_name || undefined);
      navigate('/dashboard');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Registration failed. Please try again.';
      setApiError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-green-700 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">⚡</div>
          <h1 className="text-4xl font-extrabold text-white tracking-tight">Leccy</h1>
          <p className="text-green-300 mt-1 text-sm">EV Cost Tracker</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-2xl font-bold text-green-900 mb-6 text-center">Create Account</h2>

          {apiError && (
            <div role="alert" className="bg-red-50 border border-red-300 text-red-700 rounded-lg px-4 py-3 mb-5 text-sm">
              {apiError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
            {/* Honeypot */}
            <div
              aria-hidden="true"
              style={{ position: 'absolute', left: '-9999px', top: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }}
              tabIndex={-1}
            >
              <label htmlFor="_hp_reg">Leave this blank</label>
              <input id="_hp_reg" type="text" autoComplete="off" tabIndex={-1} {...register('_hp')} />
            </div>

            <div>
              <label htmlFor="display_name" className="block text-sm font-semibold text-gray-700 mb-1">
                Name <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <input
                id="display_name"
                type="text"
                autoComplete="name"
                placeholder="Your name"
                maxLength={100}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                {...register('display_name')}
              />
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
                {...register('email', {
                  required: 'Email is required',
                  pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Invalid email address' },
                })}
              />
              {errors.email && <p role="alert" className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-1">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
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
              {errors.password && <p role="alert" className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
            </div>

            <div>
              <label htmlFor="confirm_password" className="block text-sm font-semibold text-gray-700 mb-1">Confirm Password</label>
              <input
                id="confirm_password"
                type="password"
                autoComplete="new-password"
                placeholder="Repeat your password"
                maxLength={128}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                {...register('confirm_password', {
                  required: 'Please confirm your password',
                  validate: (val) => val === passwordValue || 'Passwords do not match',
                })}
              />
              {errors.confirm_password && <p role="alert" className="text-red-500 text-xs mt-1">{errors.confirm_password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-green-700 hover:bg-green-600 disabled:bg-green-400 text-white font-bold py-3 rounded-lg transition-colors text-sm tracking-wide"
            >
              {isSubmitting ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link to="/login" className="text-green-700 font-semibold hover:text-green-600">
              Sign in
            </Link>
          </div>
        </div>

        <PublicFooter />
      </div>
    </div>
  );
}

