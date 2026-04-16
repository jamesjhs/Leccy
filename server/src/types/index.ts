import { Request } from 'express';

export interface User {
  id: number;
  licence_plate: string;
  password_hash: string;
  is_admin: number; // 0 or 1
  email: string | null;
  created_at: string;
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
  licencePlate: string;
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
