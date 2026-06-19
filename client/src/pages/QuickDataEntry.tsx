import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  chargerApi,
  ChargingSession,
  NewSession,
  sessionsApi,
  TariffConfig,
  tariffApi,
  Vehicle,
  vehiclesApi,
} from '../utils/api';

const DEFAULT_HOME_CHARGE_RATE_KW = 7.4;
const DRAFT_PREFIX = 'leccy.quickChargeDraft.v1';

type ChargerType = 'home' | 'public';

interface QuickDraft {
  vehicle_id: number | null;
  started_at: string;
  odometer_miles: string;
  initial_battery_pct: string;
  initial_range_miles: string;
}

interface FinishFields {
  final_battery_pct: string;
  final_range_miles: string;
  air_temp_celsius: string;
  date_started: string;
  date_unplugged: string;
  charger_type: ChargerType;
  home_kwh: string;
  home_kwh_source: 'measured' | 'estimated';
  away_kwh: string;
  away_kwh_source: 'measured' | 'estimated';
  away_price: string;
  away_price_mode: 'total' | 'per_kwh';
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function calcHomeChargeCost(kwh: number, tariff: TariffConfig): number {
  const offPeakRate = tariff.off_peak_rate_pence_per_kwh ?? tariff.rate_pence_per_kwh;
  const peakRate = tariff.rate_pence_per_kwh;
  const offPeakStartMins = timeToMinutes(tariff.off_peak_start_time ?? '00:00');
  const peakStartMins = timeToMinutes(tariff.peak_start_time ?? '07:00');
  const windowMins = peakStartMins > offPeakStartMins
    ? peakStartMins - offPeakStartMins
    : 24 * 60 - offPeakStartMins + peakStartMins;
  const offPeakWindowHours = windowMins / 60;
  const chargeDurationHours = kwh / DEFAULT_HOME_CHARGE_RATE_KW;

  if (chargeDurationHours <= offPeakWindowHours) {
    return Math.round(kwh * offPeakRate) / 100;
  }

  const offPeakKwh = offPeakWindowHours * DEFAULT_HOME_CHARGE_RATE_KW;
  const peakKwh = kwh - offPeakKwh;
  return Math.round(offPeakKwh * offPeakRate + peakKwh * peakRate) / 100;
}

function draftKey(vehicleId: number | null): string {
  return `${DRAFT_PREFIX}.${vehicleId ?? 'none'}`;
}

function isNumberInRange(value: string, min: number, max: number): boolean {
  const n = Number(value);
  return value !== '' && Number.isFinite(n) && n >= min && n <= max;
}

export default function QuickDataEntry() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [sessions, setSessions] = useState<ChargingSession[]>([]);
  const [tariffs, setTariffs] = useState<TariffConfig[]>([]);
  const [draft, setDraft] = useState<QuickDraft | null>(null);
  const [editingStart, setEditingStart] = useState(false);
  const [startOdometer, setStartOdometer] = useState('');
  const [odometerFocused, setOdometerFocused] = useState(false);
  const [startPct, setStartPct] = useState('');
  const [startRange, setStartRange] = useState('');
  const [finish, setFinish] = useState<FinishFields>({
    final_battery_pct: '',
    final_range_miles: '',
    air_temp_celsius: '',
    date_started: todayIso(),
    date_unplugged: todayIso(),
    charger_type: 'home',
    home_kwh: '',
    home_kwh_source: 'measured',
    away_kwh: '',
    away_kwh_source: 'measured',
    away_price: '',
    away_price_mode: 'total',
  });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [vehicleRes, sessionRes, tariffRes] = await Promise.all([
        vehiclesApi.getAll(),
        sessionsApi.getAll(selectedVehicleId ?? undefined),
        tariffApi.getAll(),
      ]);
      const fetchedVehicles = vehicleRes.data.vehicles;
      setVehicles(fetchedVehicles);
      setSessions(sessionRes.data.sessions);
      setTariffs(tariffRes.data.tariffs);
      if (selectedVehicleId === null && fetchedVehicles.length > 0) {
        setSelectedVehicleId(fetchedVehicles[0].id);
      }
    } catch {
      setError('Could not load quick entry data.');
    }
  }, [selectedVehicleId]);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    const raw = localStorage.getItem(draftKey(selectedVehicleId));
    if (!raw) {
      setDraft(null);
      setEditingStart(false);
      setStartOdometer('');
      setStartPct('');
      setStartRange('');
      setFinish((prev) => ({ ...prev, date_started: todayIso(), date_unplugged: todayIso() }));
      return;
    }

    try {
      const parsed = JSON.parse(raw) as QuickDraft;
      setDraft(parsed);
      setEditingStart(false);
      setStartOdometer(parsed.odometer_miles ?? '');
      setStartPct(parsed.initial_battery_pct);
      setStartRange(parsed.initial_range_miles);
      setFinish((prev) => ({
        ...prev,
        date_started: parsed.started_at.split('T')[0] || todayIso(),
        date_unplugged: todayIso(),
      }));
    } catch {
      localStorage.removeItem(draftKey(selectedVehicleId));
      setDraft(null);
      setEditingStart(false);
    }
  }, [selectedVehicleId]);

  const latestOdometer = useMemo(
    () => sessions.find((s) => s.odometer_miles > 0)?.odometer_miles,
    [sessions],
  );

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);
  const currentTariff = tariffs[0] ?? null;
  const homeKwh = finish.home_kwh !== '' ? Number(finish.home_kwh) : null;
  const awayKwh = finish.away_kwh !== '' ? Number(finish.away_kwh) : null;
  const homePrice = currentTariff && homeKwh !== null && homeKwh > 0
    ? calcHomeChargeCost(homeKwh, currentTariff)
    : null;

  const socEstimatedKwh = useMemo(() => {
    if (!draft || !selectedVehicle?.battery_kwh || finish.final_battery_pct === '') return null;
    const socGained = Math.max(0, Number(finish.final_battery_pct) - Number(draft.initial_battery_pct));
    if (!Number.isFinite(socGained) || socGained <= 0) return null;
    return Math.round(selectedVehicle.battery_kwh * (socGained / 100) * 100) / 100;
  }, [draft, finish.final_battery_pct, selectedVehicle?.battery_kwh]);

  function saveStart() {
    setError(null);
    setMessage(null);
    if (
      !isNumberInRange(startOdometer, 0, 999999) ||
      !isNumberInRange(startPct, 0, 100) ||
      !isNumberInRange(startRange, 0, 1000)
    ) {
      setError('Enter a valid odometer, starting battery percentage, and range.');
      return;
    }
    const nextDraft: QuickDraft = {
      vehicle_id: selectedVehicleId,
      started_at: new Date().toISOString(),
      odometer_miles: startOdometer,
      initial_battery_pct: startPct,
      initial_range_miles: startRange,
    };
    localStorage.setItem(draftKey(selectedVehicleId), JSON.stringify(nextDraft));
    setDraft(nextDraft);
    setEditingStart(false);
    setFinish((prev) => ({ ...prev, date_started: nextDraft.started_at.split('T')[0] }));
    setMessage('Charge start saved. You can close this page and come back later.');
  }

  function clearDraft() {
    localStorage.removeItem(draftKey(selectedVehicleId));
    setDraft(null);
    setEditingStart(false);
    setStartOdometer('');
    setStartPct('');
    setStartRange('');
    setMessage(null);
    setError(null);
  }

  function applyKwhEstimate(type: ChargerType) {
    setError(null);
    if (socEstimatedKwh === null) {
      setError('Add vehicle battery size and end charge SOC before estimating kWh.');
      return;
    }

    const value = String(socEstimatedKwh);
    if (type === 'home') {
      setFinish((prev) => ({ ...prev, home_kwh: value, home_kwh_source: 'estimated' }));
    } else {
      setFinish((prev) => ({ ...prev, away_kwh: value, away_kwh_source: 'estimated' }));
    }
  }

  async function submitQuickSession() {
    if (!draft) return;
    setError(null);
    setMessage(null);

    const requiredOk =
      isNumberInRange(finish.final_battery_pct, 0, 100) &&
      isNumberInRange(finish.final_range_miles, 0, 1000) &&
      isNumberInRange(finish.air_temp_celsius, -60, 60) &&
      isNumberInRange(draft.odometer_miles, 0, 999999) &&
      finish.date_unplugged !== '';

    if (!requiredOk) {
      setError('Complete the end charge fields before submitting.');
      return;
    }

    const energyKwh = finish.charger_type === 'home' ? homeKwh : awayKwh;
    const energySource = finish.charger_type === 'home' ? finish.home_kwh_source : finish.away_kwh_source;
    if (energyKwh !== null && (!Number.isFinite(energyKwh) || energyKwh <= 0 || energyKwh > 200)) {
      setError('Enter a valid kWh amount, or leave kWh blank.');
      return;
    }

    const pricePounds = finish.charger_type === 'home'
      ? homePrice ?? 0
      : finish.away_price === ''
        ? 0
        : finish.away_price_mode === 'per_kwh'
          ? Number(finish.away_price) * (energyKwh ?? 0)
          : Number(finish.away_price);
    if (!Number.isFinite(pricePounds) || pricePounds < 0) {
      setError('Enter a valid away charge price.');
      return;
    }
    if (finish.charger_type === 'public' && finish.away_price_mode === 'per_kwh' && finish.away_price !== '' && !energyKwh) {
      setError('Enter or estimate away kWh before using £ per kWh.');
      return;
    }

    setSubmitting(true);
    try {
      const session: NewSession = {
        vehicle_id: selectedVehicleId ?? null,
        odometer_miles: Number(draft.odometer_miles),
        initial_battery_pct: Number(draft.initial_battery_pct),
        initial_range_miles: Number(draft.initial_range_miles),
        final_battery_pct: Number(finish.final_battery_pct),
        final_range_miles: Number(finish.final_range_miles),
        air_temp_celsius: Number(finish.air_temp_celsius),
        date_started: finish.date_started,
        date_unplugged: finish.date_unplugged,
      };
      const sessionRes = await sessionsApi.create(session);
      if (energyKwh !== null) {
        await chargerApi.create({
          session_id: sessionRes.data.session.id,
          energy_kwh: energyKwh,
          energy_source: energySource,
          price_pence: Math.round(pricePounds * 100),
          charger_type: finish.charger_type,
        });
      }
      localStorage.removeItem(draftKey(selectedVehicleId));
      setDraft(null);
      setEditingStart(false);
      setStartOdometer('');
      setStartPct('');
      setStartRange('');
      setFinish({
        final_battery_pct: '',
        final_range_miles: '',
        air_temp_celsius: '',
        date_started: todayIso(),
        date_unplugged: todayIso(),
        charger_type: 'home',
        home_kwh: '',
        home_kwh_source: 'measured',
        away_kwh: '',
        away_kwh_source: 'measured',
        away_price: '',
        away_price_mode: 'total',
      });
      setMessage('Quick charge session submitted.');
      void loadData();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to submit quick session.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-green-900">Quick Data Entry</h1>
          <p className="text-sm text-gray-500 mt-1">Save the start now, finish the charge later.</p>
        </div>
        <Link
          to="/data-entry"
          className="text-sm font-semibold px-3 py-2 rounded-lg border border-green-300 text-green-700 hover:bg-green-50"
        >
          Full Data Entry
        </Link>
      </div>

      {message && (
        <div className="bg-green-50 border border-green-300 text-green-700 rounded-lg px-4 py-3 mb-5 text-sm">
          {message}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 rounded-lg px-4 py-3 mb-5 text-sm">
          {error}
        </div>
      )}

      {vehicles.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6 text-sm text-amber-800">
          No vehicles added yet.{' '}
          <Link to="/vehicles" className="font-semibold underline hover:text-amber-900">
            Add a vehicle
          </Link>{' '}
          to link quick charge entries to a vehicle.
        </div>
      ) : (
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Vehicle</label>
          <div className="flex flex-wrap gap-2">
            {vehicles.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setSelectedVehicleId(v.id)}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors border ${
                  selectedVehicleId === v.id
                    ? 'bg-green-700 text-white border-green-700'
                    : 'bg-white text-green-700 border-green-300 hover:bg-green-50'
                }`}
              >
                {v.nickname ? `${v.nickname} (${v.licence_plate})` : v.licence_plate}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={`grid grid-cols-1 ${draft ? '' : 'lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]'} gap-6`}>
        <section className="bg-white rounded-xl shadow-sm border border-green-100 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <h2 className="text-lg font-bold text-green-900">Start Charge</h2>
            {draft && (
              <button
                type="button"
                onClick={clearDraft}
                className="text-sm font-semibold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
              >
                Clear Draft
              </button>
            )}
          </div>

          {draft && !editingStart ? (
            <div>
              <p className="text-xs text-gray-500 mb-3">
                Draft saved for {selectedVehicle?.nickname || selectedVehicle?.licence_plate || 'this vehicle'} on{' '}
                {new Date(draft.started_at).toLocaleString()}.
              </p>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <SummaryValue label="Odometer" value={`${draft.odometer_miles} mi`} />
                <SummaryValue label="Start SOC" value={`${draft.initial_battery_pct}%`} />
                <SummaryValue label="Start range" value={`${draft.initial_range_miles} mi`} />
              </div>
              <button
                type="button"
                onClick={() => setEditingStart(true)}
                className="text-sm font-semibold text-green-700 hover:text-green-900 mt-4"
              >
                Edit start details
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField label="Odometer (mi)">
                  <input
                    type="number"
                    min="0"
                    max="999999"
                    step="0.1"
                    inputMode="decimal"
                    placeholder={!odometerFocused && latestOdometer !== undefined ? `Previous: ${latestOdometer}` : ''}
                    value={startOdometer}
                    onFocus={() => setOdometerFocused(true)}
                    onBlur={() => setOdometerFocused(false)}
                    onChange={(e) => setStartOdometer(e.target.value)}
                    className={inputClass}
                  />
                </FormField>
                <FormField label="Start Battery %">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    inputMode="numeric"
                    value={startPct}
                    onChange={(e) => setStartPct(e.target.value)}
                    className={inputClass}
                  />
                </FormField>
                <FormField label="Start Range (mi)">
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    step="0.1"
                    inputMode="decimal"
                    value={startRange}
                    onChange={(e) => setStartRange(e.target.value)}
                    className={inputClass}
                  />
                </FormField>
              </div>

              <div className="flex flex-wrap gap-3 mt-5">
                <button
                  type="button"
                  onClick={saveStart}
                  className="bg-green-700 hover:bg-green-600 text-white font-bold px-5 py-2.5 rounded-lg transition-colors text-sm"
                >
                  {draft ? 'Update Start' : 'Save Start'}
                </button>
              </div>
            </>
          )}
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-green-100 p-6">
          <h2 className="text-lg font-bold text-green-900 mb-4">Finish And Submit</h2>
          {!draft ? (
            <p className="text-sm text-gray-400">Save the charge start first, then the end fields will be ready here.</p>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField label="End charge SOC %">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    inputMode="numeric"
                    value={finish.final_battery_pct}
                    onChange={(e) => setFinish((prev) => ({ ...prev, final_battery_pct: e.target.value }))}
                    className={inputClass}
                  />
                </FormField>
                <FormField label="End charge range (mi)">
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    step="0.1"
                    inputMode="decimal"
                    value={finish.final_range_miles}
                    onChange={(e) => setFinish((prev) => ({ ...prev, final_range_miles: e.target.value }))}
                    className={inputClass}
                  />
                </FormField>
                <FormField label="Air Temp (C)">
                  <input
                    type="number"
                    min="-60"
                    max="60"
                    step="0.1"
                    inputMode="decimal"
                    value={finish.air_temp_celsius}
                    onChange={(e) => setFinish((prev) => ({ ...prev, air_temp_celsius: e.target.value }))}
                    className={inputClass}
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField label="Start Date">
                  <input
                    type="date"
                    value={finish.date_started}
                    onChange={(e) => setFinish((prev) => ({ ...prev, date_started: e.target.value }))}
                    className={inputClass}
                  />
                </FormField>
                <FormField label="Date Unplugged">
                  <input
                    type="date"
                    value={finish.date_unplugged}
                    onChange={(e) => setFinish((prev) => ({ ...prev, date_unplugged: e.target.value }))}
                    className={inputClass}
                  />
                </FormField>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Odometer (mi)</label>
                  <div className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-600">
                    {draft.odometer_miles}
                  </div>
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField label="Charge Type">
                    <select
                      value={finish.charger_type}
                      onChange={(e) => setFinish((prev) => ({ ...prev, charger_type: e.target.value as ChargerType }))}
                      className={inputClass}
                    >
                      <option value="home">Home</option>
                      <option value="public">Away</option>
                    </select>
                  </FormField>

                  {finish.charger_type === 'home' ? (
                    <>
                      <FormField label="Home kWh">
                        <KwhInput
                          value={finish.home_kwh}
                          onChange={(value) => setFinish((prev) => ({ ...prev, home_kwh: value, home_kwh_source: 'measured' }))}
                          onEstimate={() => applyKwhEstimate('home')}
                          disabledEstimate={socEstimatedKwh === null}
                        />
                      </FormField>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Estimated Cost</label>
                        <div className="min-h-[38px] flex items-center border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-600">
                          {homePrice === null ? '' : `£${homePrice.toFixed(2)}`}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <FormField label="Away kWh">
                        <KwhInput
                          value={finish.away_kwh}
                          onChange={(value) => setFinish((prev) => ({ ...prev, away_kwh: value, away_kwh_source: 'measured' }))}
                          onEstimate={() => applyKwhEstimate('public')}
                          disabledEstimate={socEstimatedKwh === null}
                        />
                      </FormField>
                      <FormField label={finish.away_price_mode === 'per_kwh' ? 'Away Price (£/kWh)' : 'Away Price (£)'}>
                        <div className="flex rounded-lg border border-gray-300 overflow-hidden focus-within:ring-2 focus-within:ring-green-500 focus-within:border-transparent bg-white">
                        <input
                          type="number"
                          min="0"
                          max="10000"
                          step="0.01"
                          inputMode="decimal"
                          value={finish.away_price}
                          onChange={(e) => setFinish((prev) => ({ ...prev, away_price: e.target.value }))}
                          className="min-w-0 flex-1 px-3 py-2 text-sm focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setFinish((prev) => ({
                            ...prev,
                            away_price_mode: prev.away_price_mode === 'total' ? 'per_kwh' : 'total',
                          }))}
                          className="shrink-0 border-l border-gray-200 px-3 text-xs font-semibold text-green-700 hover:bg-green-50"
                          title="Toggle between total price and price per kWh"
                        >
                          Toggle units
                        </button>
                        </div>
                      </FormField>
                    </>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-3">
                  Estimate uses SOC gained × vehicle battery size{selectedVehicle?.battery_kwh ? ` (${selectedVehicle.battery_kwh} kWh)` : ''}.
                </p>
              </div>

              <button
                type="button"
                onClick={() => void submitQuickSession()}
                disabled={submitting}
                className="bg-green-700 hover:bg-green-600 disabled:bg-green-400 text-white font-bold px-6 py-2.5 rounded-lg transition-colors text-sm"
              >
                {submitting ? 'Submitting...' : 'Submit Quick Session'}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent';

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-green-100 bg-green-50 px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-green-700">{label}</div>
      <div className="text-sm font-semibold text-green-950 mt-0.5">{value}</div>
    </div>
  );
}

function KwhInput({
  value,
  onChange,
  onEstimate,
  disabledEstimate,
}: {
  value: string;
  onChange: (value: string) => void;
  onEstimate: () => void;
  disabledEstimate: boolean;
}) {
  return (
    <div className="flex rounded-lg border border-gray-300 overflow-hidden focus-within:ring-2 focus-within:ring-green-500 focus-within:border-transparent bg-white">
      <input
        type="number"
        min="0"
        max="200"
        step="0.01"
        inputMode="decimal"
        placeholder="Optional"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 px-3 py-2 text-sm focus:outline-none"
      />
      <button
        type="button"
        onClick={onEstimate}
        disabled={disabledEstimate}
        className="shrink-0 border-l border-gray-200 px-3 text-xs font-semibold text-green-700 hover:bg-green-50 disabled:text-gray-300 disabled:hover:bg-white"
        title="Estimate from SOC gained and vehicle battery size"
      >
        estimate
      </button>
    </div>
  );
}
