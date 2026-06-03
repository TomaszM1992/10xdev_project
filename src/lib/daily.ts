import type { Task } from "@/types";

export type FittingTaskIds = Set<string>;

export function applyBudgetFilter(tasks: Task[], availableHours: number): FittingTaskIds {
  const budgetMinutes = availableHours * 60;
  const fittingIds = new Set<string>();
  let cum = 0;
  for (const task of tasks) {
    if (!Number.isFinite(task.time_estimate_minutes) || task.time_estimate_minutes < 0) continue;
    if (cum + task.time_estimate_minutes <= budgetMinutes) {
      fittingIds.add(task.id);
      cum += task.time_estimate_minutes;
    }
  }
  return fittingIds;
}

export function restoreAtIndex<T>(arr: T[], idx: number, item: T): T[] {
  return [...arr.slice(0, idx), item, ...arr.slice(idx)];
}
