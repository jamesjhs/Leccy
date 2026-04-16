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
  created_at: string;
}

export interface Vehicle {
  id: number;
  user_id: number;
  licence_plate: string;
  nickname: string | null;
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
  odometer_miles: number;
  initial_battery_pct: number;
  initial_range_miles: number;
  final_battery_pct: number;
  final_range_miles: number;
  air_temp_celsius: number;
  date_unplugged: string;
  created_at: string;
}

export interface ChargerCost {
  id: number;
  session_id: number;
  user_id: number;
  energy_kwh: number;
  price_pence: number;
  charger_type: 'home' | 'public';
  charger_name: string | null;
  created_at: string;
}

export interface MaintenanceLog {
  id: number;
  user_id: number;
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
}

export interface TempVsRange {
  temp_celsius: number;
  range_per_pct: number;
}

export interface MilesPerPct {
  date: string;
  miles_per_pct: number;
}
