export type TaskStatus = "pending" | "complete" | "dismissed";

export interface Task {
  id: string;
  user_id: string;
  name: string;
  target_date: string; // ISO date YYYY-MM-DD
  priority: 1 | 2 | 3;
  time_estimate_minutes: number;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
}

export interface TaskTag {
  task_id: string;
  tag_name: string;
}

export interface UserSettings {
  user_id: string;
  available_hours: number;
  updated_at: string;
}

export interface TaskWithTags extends Task {
  task_tags: TaskTag[];
}
