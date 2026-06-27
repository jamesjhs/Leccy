import { Link } from 'react-router-dom';

export default function VehicleSetupPrompt() {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6 text-sm text-amber-800">
      No vehicle data configured yet.{' '}
      <Link to="/vehicles" className="font-semibold underline hover:text-amber-900">
        Add a vehicle
      </Link>{' '}
      to filter analytics and improve charging estimates.
    </div>
  );
}
