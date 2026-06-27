import { Link } from 'react-router-dom';

export default function TariffSetupPrompt() {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6 text-sm text-amber-800">
      No electricity tariff configured yet.{' '}
      <Link to="/tariff" className="font-semibold underline hover:text-amber-900">
        Add a tariff
      </Link>{' '}
      to calculate home charging costs automatically.
    </div>
  );
}
