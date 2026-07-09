import { Request } from 'express';

export interface User {
  id: number;
  licence_plate: string | null;
  password_hash: string;
  is_admin: number; // 0 or 1
  email: string | null;
  display_name: string | null;
  failed_login_attempts: number;
  locked_until: string | null;
  push_notifications_enabled: number;
  push_reminder_time: string;
  push_time_zone: string | null;
  created_at: string;
}

export interface PushSubscriptionRecord {
  id: number;
  user_id: number;
  endpoint: string;
  keys_p256dh: string;
  keys_auth: string;
  created_at: string;
}

export interface PendingChargeReminder {
  user_id: number;
  vehicle_id: number | null;
  started_at: string;
  last_notified_date: string | null;
  updated_at: string;
}

export interface Vehicle {
  id: number;
  user_id: number;
  licence_plate: string;
  nickname: string | null;
  vehicle_type: string | null;
  battery_kwh: number | null;
  created_at: string;
}

export interface MagicLinkToken {
  id: number;
  user_id: number;
  token: string;
  expires_at: string;
  used: number;
  created_at: string;
}

export interface User2FA {
  user_id: number;
  enabled: number;
  otp_secret: string | null;
  otp_expires_at: string | null;
}

export interface ChargingSession {
  id: number;
  user_id: number;
  vehicle_id: number | null;
  odometer_miles: number;
  initial_battery_pct: number;
  initial_range_miles: number;
  final_battery_pct: number;
  final_range_miles: number;
  air_temp_celsius: number;
  date_started: string | null;
  date_unplugged: string;
  created_at: string;
}

export interface ChargerCost {
  id: number;
  session_id: number;
  user_id: number;
  energy_kwh: number;
  energy_source: 'measured' | 'estimated';
  price_pence: number;
  price_calculated: number;
  charger_type: 'home' | 'public';
  charger_name: string | null;
  created_at: string;
}

export interface MaintenanceLog {
  id: number;
  user_id: number;
  vehicle_id: number | null;
  description: string;
  log_date: string;
  cost_pence: number | null;
  created_at: string;
}

export interface TariffConfig {
  id: number;
  user_id: number;
  tariff_name: string;
  rate_pence_per_kwh: number;
  standing_charge_pence: number;
  peak_start_time: string;
  off_peak_rate_pence_per_kwh: number;
  off_peak_start_time: string;
  effective_from: string;
  created_at: string;
}

export interface AppSetting {
  key: string;
  value: string;
}

export interface Admin2FA {
  admin_id: number;
  email: string;
  enabled: number;
  secret: string | null;
}

export interface JwtPayload {
  userId: number;
  email: string | null;
  isAdmin: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

export interface EnrichedSession {
  id: number;
  date: string;
  odometer: number;
  max_range_100_pct: number;
  end_charge_temperature: number;
  energy_kwh: number;
  initial_battery_percent: number;
  pct_charged: number;
  distance_driven: number | null;
  estimated_range_consumed: number | null;
}

export interface AnalyticsResult {
  total_cost_pence: number;
  cost_per_mile_pence: number;
  total_kwh: number;
  miles_driven: number;
  sessions_count: number;
  efficiency_data: EfficiencyPoint[];
  cost_per_session: CostPerSession[];
  temp_vs_range: TempVsRange[];
  miles_per_pct: MilesPerPct[];
  enriched_sessions: EnrichedSession[];
  derived_insights: DerivedInsights;
}

export interface DerivedInsights {
  odometer_efficiency: OdometerEfficiencyPoint[];
  temperature_efficiency: TemperatureEfficiencyBand[];
  home_away: HomeAwayEconomics;
  battery_capacity: BatteryCapacityPoint[];
  battery_stress: BatteryStressSummary;
  charging_behavior: ChargingBehaviorSummary;
  gom_trust: GOMTrustSummary;
  data_quality: DataQualitySummary;
  ownership_cost: OwnershipCostSummary;
}

export interface EfficiencyPoint {
  date: string;
  battery_efficiency: number;
  range_miles: number;
  temp_celsius: number;
}

export interface CostPerSession {
  date: string;
  cost_pence: number;
  energy_kwh: number;
  energy_source: 'measured' | 'estimated' | null;
  charger_type: 'home' | 'public' | null;
}

export interface OdometerEfficiencyPoint {
  date: string;
  trip_miles: number;
  energy_kwh: number;
  kwh_per_mile: number;
  cost_per_mile_pence: number;
  charger_type: 'home' | 'public' | null;
  energy_source: 'measured' | 'estimated' | null;
}

export interface TemperatureEfficiencyBand {
  band: string;
  sessions: number;
  avg_kwh_per_mile: number;
}

export interface HomeAwayEconomics {
  home_sessions: number;
  away_sessions: number;
  home_kwh: number;
  away_kwh: number;
  home_cost_pence: number;
  away_cost_pence: number;
  home_costed_sessions: number;
  away_costed_sessions: number;
  home_avg_cost_per_charge_pence: number;
  away_avg_cost_per_charge_pence: number;
  home_avg_pence_per_kwh: number;
  away_avg_pence_per_kwh: number;
  away_cost_premium_pence: number;
}

export interface BatteryCapacityPoint {
  date: string;
  estimated_usable_capacity_kwh: number;
  nominal_battery_kwh: number;
  capacity_ratio_pct: number;
  soc_delta_pct: number;
}

export interface BatteryStressSummary {
  score: number;
  level: 'Low' | 'Moderate' | 'High';
  low_soc_sessions: number;
  high_final_soc_sessions: number;
  deep_cycle_sessions: number;
  hot_sessions: number;
  public_sessions: number;
}

export interface ChargingBehaviorSummary {
  profile: string;
  median_plugin_soc: number;
  median_soc_gain: number;
  public_session_pct: number;
  avg_days_between_charges: number;
  low_buffer_sessions: number;
}

export interface GOMTrustSummary {
  sample_count: number;
  ratio_pct: number;
  label: string;
}

export interface DataQualitySummary {
  total_sessions: number;
  measured_kwh_sessions: number;
  estimated_kwh_sessions: number;
  no_kwh_sessions: number;
  costed_sessions: number;
  measured_kwh_pct: number;
}

export interface OwnershipCostSummary {
  charging_cost_pence: number;
  maintenance_cost_pence: number;
  total_running_cost_pence: number;
  running_cost_per_mile_pence: number;
}

export interface TempVsRange {
  temp_celsius: number;
  range_per_pct: number;
}

export interface MilesPerPct {
  date: string;
  miles_per_pct: number;
}
