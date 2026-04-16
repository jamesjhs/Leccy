import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useAuthContext } from '../App';

interface LoginForm {
  licence_plate: string;
  password: string;
}

export default function Login() {
  const { login } = useAuthContext();
  const navigate = useNavigate();
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<LoginForm>({ mode: 'onBlur' });

  const licencePlateValue = watch('licence_plate', '');

  // Normalise licence plate: strip spaces, convert to uppercase
  function normalisePlate(value: string): string {
    return value.replace(/\s+/g, '').toUpperCase();
  }

  async function onSubmit(data: LoginForm) {
    setApiError(null);
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
            <div className="bg-red-50 border border-red-300 text-red-700 rounded-lg px-4 py-3 mb-5 text-sm">
              {apiError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Licence Plate
              </label>
              <input
                type="text"
                placeholder="e.g. AB12 CDE"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 uppercase tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                {...register('licence_plate', {
                  required: 'Licence plate is required',
                  onChange: (e) =>
                    setValue('licence_plate', (e.target.value as string).toUpperCase()),
                })}
                value={licencePlateValue.toUpperCase()}
              />
              {errors.licence_plate && (
                <p className="text-red-500 text-xs mt-1">{errors.licence_plate.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Password</label>
              <input
                type="password"
                placeholder="Min 8 chars, 1 special character"
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
                <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>
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
