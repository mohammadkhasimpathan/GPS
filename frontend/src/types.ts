// ─────────────────────────────────────────────
// Application-wide TypeScript types
// ─────────────────────────────────────────────

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  date_joined: string;
}

export interface Person {
  id: number;
  name: string;
  tracking_token: string;
  tracking_url: string;
  enabled: boolean;
  created_at: string;
  last_seen: string | null;
  is_online: boolean;
}

export interface Location {
  id: number;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  altitude: number | null;
  battery: number | null;
  connection: string | null;
  browser: string | null;
  operating_system: string | null;
  device_type: string | null;
  timezone: string | null;
  language: string | null;
  timestamp: string;
  // enriched by WS consumer
  person_id?: number;
  person_name?: string;
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface LoginResponse extends AuthTokens {
  user: User;
}

export interface WSMessage {
  type: "connected" | "location.update" | "presence.update" | "pong";
  data?: Location | { status: "online" | "offline"; person_id: number };
}
