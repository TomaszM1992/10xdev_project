import type { Task } from "@/types";

export function applyBudgetFilter(tasks: Task[], availableHours: number): Set<string> {
  const budgetMinutes = availableHours * 60;
  const fittingIds = new Set<string>();
  let cum = 0;
  for (const task of tasks) {
    if (cum + task.time_estimate_minutes <= budgetMinutes) {
      fittingIds.add(task.id);
      cum += task.time_estimate_minutes;
    }
  }
  return fittingIds;
}
