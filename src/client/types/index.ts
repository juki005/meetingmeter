export interface User {
  id: string;
  email: string;
  name: string;
  job_title: string | null;
  hourly_rate: number;
  currency: string;
}

export interface Person {
  id: string;
  user_id: string;
  type: 'internal' | 'guest';
  name: string;
  role: string | null;
  organization: string | null;
  hourly_rate: number | null;
  rate_known: boolean;
  created_at: string;
  updated_at: string;
}

export interface Participant {
  id: string;
  name: string;
  role: string | null;
  organization: string | null;
  is_guest: boolean;
  hourly_rate_snapshot: number | null;
  rate_known: boolean;
  state: 'ACTIVE' | 'PAUSED' | 'LEFT';
  measured_seconds: number;
  calculated_cost: number | null;
  left_at: string | null;
}

export interface Meeting {
  id: string;
  title: string;
  status: 'CONFIGURED' | 'LIVE' | 'ENDED';
  currency: string;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  elapsed_seconds: number;
  accumulated_cost: number;
  burn_rate_per_hour: number;
  burn_rate_per_second: number;
  unknown_cost_count: number;
  participants: Participant[];
}

export interface Receipt {
  meeting_id: string;
  title: string;
  status: string;
  creator: {
    id: string;
    name: string;
    email: string;
  };
  currency: string;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  total_duration_seconds: number;
  final_estimated_cost: number;
  unknown_cost_count: number;
  participants_count: number;
  participants: Participant[];
  tone_quote: string;
  estimate_disclaimer: string;
}
