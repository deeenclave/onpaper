export type TripNodeType =
  | 'flight'
  | 'transport'
  | 'attraction'
  | 'restaurant'
  | 'guided_activity'
  | 'scenic_point'
  | 'decision'
  | 'fallback';

export type Priority = 'low' | 'medium' | 'high';
export type ReservationStatus = 'required' | 'booked' | 'pending' | 'not_required';

export interface TripNodeData {
  id: string;
  title: string;
  category: TripNodeType;
  day: number;
  timeWindow: string;
  duration: string;
  location: string;
  cost: number;
  priority: Priority;
  reservationStatus: ReservationStatus;
  notes: string;
  tags: string[];
  icon: string;
  optional?: boolean;
}

export interface TripEdgeData {
  id: string;
  source: string;
  target: string;
  label?: string;
  critical?: boolean;
}

export interface TripDay {
  day: number;
  date: string;
  title: string;
  collapsed?: boolean;
}

export interface TripPlan {
  title: string;
  dates: string;
  durationDays: number;
  cities: number;
  activities: number;
  transportLegs: number;
  travelers: number;
  currency: string;
  days: TripDay[];
  nodes: TripNodeData[];
  edges: TripEdgeData[];
}

export interface PlannerValidationIssue {
  type:
    | 'overlap'
    | 'overbooked_day'
    | 'missing_reservation'
    | 'long_travel_chain'
    | 'high_cost'
    | 'slow_day_suggestion';
  severity: 'info' | 'warning' | 'error';
  nodeIds?: string[];
  day?: number;
  message: string;
}

export interface ExportedItinerary {
  plan: TripPlan;
  generatedAt: string;
  summary: {
    totalCost: number;
    totalActivities: number;
    totalDurationHours: number;
    issues: number;
  };
}
