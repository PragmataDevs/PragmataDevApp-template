export interface BacklogItem {
  id: string;
  task_id: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimated_effort: number | null;
  business_value: number | null;
  notes: string | null;
  created_at: string;
}

export type BacklogSortField = 'priority' | 'business_value' | 'estimated_effort' | 'created_at';
