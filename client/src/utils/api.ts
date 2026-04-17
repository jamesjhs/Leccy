// ─── Lightweight fetch wrapper (replaces axios) ───────────────────────────────
// Mirrors the axios API surface used across this codebase:
//   api.get<T>(path, { params? })  → Promise<{ data: T }>
//   api.post<T>(path, body)        → Promise<{ data: T }>
//   api.put<T>(path, body)         → Promise<{ data: T }>
//   api.delete(path)               → Promise<{ data: unknown }>
// Errors are thrown as { response: { data, status } } to match axios shape.

type Params = Record<string, string | number | undefined | null>;

async function request<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  params?: Params,
): Promise<{ data: T }> {
  let url = `/api${path}`;
  if (params) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) q.set(k, String(v));
    }
    const qs = q.toString();
    if (qs) url += `?${qs}`;
  }

  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data: unknown;
  const ct = res.headers.get('content-type') ?? '';
  data = ct.includes('application/json') ? await res.json() : await res.text();

  if (res.status === 401 && !window.location.pathname.startsWith('/login')) {
    localStorage.removeItem('token');
    window.location.href = '/login';
    // After setting location.href the browser navigates away; return a never-settling
    // promise so calling code never proceeds past this 401 guard.
    return new Promise<never>(() => undefined);
  }

  if (!res.ok) {
    throw { response: { data, status: res.status } };
  }

  return { data: data as T };
}

const api = {
  get: <T>(path: string, options?: { params?: Params }) =>
    request<T>('GET', path, undefined, options?.params),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: (path: string, body?: unknown) => request('DELETE', path, body),
};

export default api;

// ---------- Auth ----------
export const authApi = {
  register: (email: string, password: string, display_name?: string) =>
    api.post<{ token: string; user: UserInfo }>('/auth/register', { email, password, display_name }),
  login: (email: string, password: string) =>
    api.post<{ token: string; user: UserInfo } | { requires_2fa: true; temp_token: string }>('/auth/login', { email, password }),
  verify2faLogin: (temp_token: string, code: string) =>
    api.post<{ token: string; user: UserInfo }>('/auth/2fa/verify-login', { temp_token, code }),
  requestMagicLink: (email: string) =>
    api.post<{ message: string }>('/auth/magic-link/request', { email }),
  verifyMagicLink: (token: string) =>
    api.post<{ token: string; user: UserInfo }>('/auth/magic-link/verify', { token }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get<{ user: UserInfo }>('/auth/me'),
  version: () => api.get<{ version: string }>('/auth/version'),
  changePassword: (current_password: string, new_password: string) =>
    api.post('/auth/change-password', { current_password, new_password }),
  setup2fa: (email: string) => api.post('/auth/2fa/setup', { email }),
  verify2fa: (code: string) => api.post('/auth/2fa/verify', { code }),
  disable2fa: (password: string) => api.post('/auth/2fa/disable', { password }),
  get2faStatus: () => api.get<{ enabled: boolean }>('/auth/2fa/status'),
  deleteAccount: (password: string) => api.delete('/auth/account', { password }),
};

// ---------- Sessions ----------
export const sessionsApi = {
  getAll: (vehicleId?: number) =>
    api.get<{ sessions: ChargingSession[] }>('/sessions', { params: vehicleId ? { vehicleId } : undefined }),
  create: (data: NewSession) => api.post<{ session: ChargingSession }>('/sessions', data),
  update: (id: number, data: Partial<NewSession>) => api.put<{ session: ChargingSession }>(`/sessions/${id}`, data),
  delete: (id: number) => api.delete(`/sessions/${id}`),
};

// ---------- Charger ----------
export const chargerApi = {
  getAll: () => api.get<{ costs: ChargerCostWithDate[] }>('/charger'),
  create: (data: NewChargerCost) => api.post<{ cost: ChargerCost }>('/charger', data),
  update: (id: number, data: Partial<NewChargerCost>) =>
    api.put<{ cost: ChargerCost }>(`/charger/${id}`, data),
  delete: (id: number) => api.delete(`/charger/${id}`),
};

// ---------- Maintenance ----------
export const maintenanceApi = {
  getAll: (vehicleId?: number) =>
    api.get<{ entries: MaintenanceLog[] }>('/maintenance', { params: vehicleId ? { vehicleId } : undefined }),
  create: (data: NewMaintenance) => api.post<{ entry: MaintenanceLog }>('/maintenance', data),
  delete: (id: number) => api.delete(`/maintenance/${id}`),
};

// ---------- Tariff ----------
export const tariffApi = {
  getAll: () => api.get<{ tariffs: TariffConfig[] }>('/tariff'),
  create: (data: NewTariff) => api.post<{ tariff: TariffConfig }>('/tariff', data),
  update: (id: number, data: Partial<NewTariff>) =>
    api.put<{ tariff: TariffConfig }>(`/tariff/${id}`, data),
  delete: (id: number) => api.delete(`/tariff/${id}`),
};

// ---------- Analytics ----------
export const analyticsApi = {
  get: (params?: { startDate?: string; endDate?: string; vehicleId?: number }) =>
    api.get<AnalyticsResult>('/analytics', { params }),
};

// ---------- Vehicles ----------
export const vehiclesApi = {
  getAll: () => api.get<{ vehicles: Vehicle[] }>('/vehicles'),
  create: (data: NewVehicle) => api.post<{ vehicle: Vehicle }>('/vehicles', data),
  update: (id: number, data: Partial<NewVehicle>) => api.put<{ vehicle: Vehicle }>(`/vehicles/${id}`, data),
  delete: (id: number) => api.delete(`/vehicles/${id}`),
};

// ---------- Admin ----------
export const adminApi = {
  getUsers: () => api.get<{ users: UserInfo[] }>('/admin/users'),
  createUser: (data: NewUser) => api.post<{ user: UserInfo }>('/admin/users', data),
  deleteUser: (id: number) => api.delete(`/admin/users/${id}`),
  getSettings: () => api.get<{ settings: AppSetting[] }>('/admin/settings'),
  updateSettings: (data: Record<string, string>) => api.put('/admin/settings', data),
};

// ---------- Types ----------
export interface UserInfo {
  id: number;
  email: string | null;
  display_name: string | null;
  is_admin: number;
  created_at: string;
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

export interface NewVehicle {
  licence_plate: string;
  nickname?: string;
  vehicle_type?: string;
  battery_kwh?: number | null;
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
  date_unplugged: string;
  created_at: string;
}

export interface NewSession {
  vehicle_id?: number | null;
  odometer_miles: number;
  initial_battery_pct: number;
  initial_range_miles: number;
  final_battery_pct: number;
  final_range_miles: number;
  air_temp_celsius: number;
  date_unplugged: string;
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

export interface ChargerCostWithDate extends ChargerCost {
  date_unplugged: string;
  odometer_miles: number;
}

export interface NewChargerCost {
  session_id: number;
  energy_kwh: number;
  price_pence: number;
  charger_type: 'home' | 'public';
  charger_name?: string;
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

export interface NewMaintenance {
  vehicle_id?: number | null;
  description: string;
  log_date: string;
  cost_pence?: number | null;
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

export interface NewTariff {
  tariff_name: string;
  rate_pence_per_kwh: number;
  standing_charge_pence: number;
  peak_start_time: string;
  off_peak_rate_pence_per_kwh: number;
  off_peak_start_time: string;
  effective_from: string;
}

export interface AppSetting {
  key: string;
  value: string;
}

export interface NewUser {
  email: string;
  password: string;
  display_name?: string;
  is_admin?: boolean;
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
