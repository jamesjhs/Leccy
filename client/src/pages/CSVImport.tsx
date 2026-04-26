import { useState } from 'react';
import api from '../utils/api';

interface ImportResult {
  success: boolean;
  summary: {
    imported: number;
    skipped: number;
    total: number;
  };
  errors?: string[];
}

export default function CSVImport() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.csv')) {
        setError('Please select a CSV file');
        setFile(null);
        return;
      }
      if (selectedFile.size > 5 * 1024 * 1024) {
        setError('File size must be less than 5MB');
        setFile(null);
        return;
      }
      setError(null);
      setFile(selectedFile);
    }
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError('Please select a CSV file');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('csv', file);

      const token = localStorage.getItem('token');
      const res = await fetch('/api/import/sessions', {
        method: 'POST',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Import failed');
      }

      const data = (await res.json()) as ImportResult;
      setResult(data);
      setFile(null);
      const fileInput = document.getElementById('csv-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } catch (err: any) {
      setError(err.message || 'Failed to import file');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-green-900 mb-1">📥 Import Charging Data</h1>
      <p className="text-green-600 mb-6 text-sm">Upload a CSV file to import multiple charging sessions at once.</p>

      <div className="bg-white rounded-lg shadow-sm border border-green-200 p-6 max-w-2xl">
        <form onSubmit={handleImport} className="space-y-6">
          {/* CSV Format Help */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">📋 CSV Format</h3>
            <p className="text-sm text-blue-800 mb-3">Your CSV file should have the following columns:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-blue-800 font-mono bg-white p-3 rounded border border-blue-100">
              <div>
                <strong>Required (7 columns):</strong>
                <div>1. odometer_miles</div>
                <div>2. initial_battery_pct (0-100)</div>
                <div>3. initial_range_miles (0-1000)</div>
                <div>4. final_battery_pct (0-100)</div>
                <div>5. final_range_miles (0-1000)</div>
                <div>6. air_temp_celsius (-60 to 60)</div>
                <div>7. date_unplugged (dd/mm/yy)</div>
              </div>
              <div>
                <strong>Optional (3 columns):</strong>
                <div>8. vehicle_licence_plate</div>
                <div>9. charger_kwh_logged</div>
                <div>10. price_pence (£0.00)</div>
              </div>
            </div>
            <p className="text-xs text-blue-700 mt-2">
              ✓ A header row will be detected and skipped automatically
              <br />✓ Price defaults to £0.00 if not provided
            </p>
          </div>

          {/* File input */}
          <div>
            <label htmlFor="csv-input" className="block text-sm font-semibold text-gray-700 mb-2">
              Select CSV File
            </label>
            <input
              id="csv-input"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              disabled={loading}
              className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-green-600 file:text-white hover:file:bg-green-500 disabled:opacity-50"
            />
            {file && <p className="text-xs text-green-600 mt-1">✓ {file.name}</p>}
          </div>

          {/* Error display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
              ⚠️ {error}
            </div>
          )}

          {/* Result display */}
          {result && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              <div className="text-sm text-green-900">
                <strong>✓ Import successful!</strong>
                <div className="mt-2 space-y-1">
                  <p>Imported: <span className="font-semibold">{result.summary.imported}</span> sessions</p>
                  {result.summary.skipped > 0 && (
                    <p>Skipped: <span className="font-semibold">{result.summary.skipped}</span> rows</p>
                  )}
                </div>
              </div>
              {result.errors && result.errors.length > 0 && (
                <details className="mt-3 text-xs">
                  <summary className="font-semibold text-green-800 cursor-pointer hover:text-green-700">
                    Show errors ({result.errors.length})
                  </summary>
                  <div className="mt-2 space-y-1 text-gray-700 bg-white p-2 rounded border border-green-100 max-h-32 overflow-y-auto">
                    {result.errors.map((err, i) => (
                      <div key={i}>• {err}</div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={!file || loading}
            className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 rounded-lg transition-colors"
          >
            {loading ? '⏳ Importing...' : '📤 Import Sessions'}
          </button>
        </form>
      </div>

      {/* Example CSV */}
      <div className="mt-8 max-w-2xl">
        <h2 className="text-lg font-semibold text-gray-700 mb-3">📄 Example CSV</h2>
        <pre className="bg-gray-100 p-4 rounded text-xs overflow-x-auto border border-gray-300">
{`odometer_miles,initial_battery_pct,initial_range_miles,final_battery_pct,final_range_miles,air_temp_celsius,date_unplugged,vehicle_licence_plate,charger_kwh_logged,price_pence
15000,20,100,80,320,15,01/03/26,AB12CDE,42.5,250
15050,80,320,95,380,12,02/03/26,AB12CDE,25.0,125
15100,95,380,30,150,18,03/03/26,,15.0,0`}
        </pre>
      </div>
    </div>
  );
}
