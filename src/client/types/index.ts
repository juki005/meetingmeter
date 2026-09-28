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

export interface CostLibraryItem {
  id: string;
  user_id: string;
  name: string;
  default_amount: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface ExternalCost {
  id?: string;
  meeting_id?: string;
  cost_library_id?: string | null;
  name: string;
  amount: number;
  currency: string;
  is_overridden?: boolean;
  created_at?: string;
  updated_at?: string;
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
  manual_duration_seconds?: number | null;
  calculated_cost: number | null;
  left_at: string | null;
}

export interface Meeting {
  id: string;
  title: string;
  status: 'PREPARED' | 'CONFIGURED' | 'LIVE' | 'ENDED';
  provenance: 'LIVE' | 'MANUAL_ENTRY';
  currency: string;
  planned_date: string | null;
  planned_time: string | null;
  manual_reason: string | null;
  is_recurring: boolean;
  is_missed?: boolean;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  updated_at: string;
  elapsed_seconds: number;
  accumulated_cost: number;
  participant_cost_total: number;
  external_cost_total: number;
  total_estimated_cost: number;
  burn_rate_per_hour: number;
  burn_rate_per_second: number;
  unknown_cost_count: number;
  participants: Participant[];
  external_costs?: ExternalCost[];
}

export interface Receipt {
  meeting_id: string;
  title: string;
  status: string;
  provenance: 'LIVE' | 'MANUAL_ENTRY';
  creator: {
    id: string;
    name: string;
    email: string;
  };
  currency: string;
  planned_date: string | null;
  planned_time: string | null;
  manual_reason: string | null;
  is_recurring: boolean;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  updated_at: string;
  total_duration_seconds: number;
  participant_cost_total: number;
  external_cost_total: number;
  total_estimated_cost: number;
  final_estimated_cost: number;
  unknown_cost_count: number;
  participants_count: number;
  participants: Participant[];
  external_costs: ExternalCost[];
  tone_quote: string;
  estimate_disclaimer: string;
}
