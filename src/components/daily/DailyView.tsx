import { useState } from "react";
import { CircleCheck, CircleX } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskWithTags } from "@/types";

interface DailyViewProps {
  initialOverdueTasks: TaskWithTags[];
  initialTodayTasks: TaskWithTags[];
  initialAvailableHours: number;
  date: string;
}

export function DailyView({ initialOverdueTasks, initialTodayTasks, initialAvailableHours, date }: DailyViewProps) {
  const [overdueTasks] = useState<TaskWithTags[]>(initialOverdueTasks);
  const [todayTasks] = useState<TaskWithTags[]>(initialTodayTasks);
  const [availableHours] = useState(initialAvailableHours);

  // Cumulative budget filter — overdue first, then today; SQL ordering is preserved
  const budgetMinutes = availableHours * 60;
  const all = [...overdueTasks, ...todayTasks];
  const fittingIds = new Set<string>();
  let cum = 0;
  for (const task of all) {
    if (cum + task.time_estimate_minutes <= budgetMinutes) {
      fittingIds.add(task.id);
      cum += task.time_estimate_minutes;
    }
  }

  const fittingOverdue = overdueTasks.filter((t) => fittingIds.has(t.id));
  const fittingToday = todayTasks.filter((t) => fittingIds.has(t.id));
  const hasAnything = fittingOverdue.length > 0 || fittingToday.length > 0;

  if (!hasAnything) {
    return (
      <div className="py-12 text-center text-blue-100/60">
        <p className="mb-4">No tasks scheduled for {date}.</p>
        <a href="/tasks/new" className="text-purple-300 hover:text-purple-100 hover:underline">
          Create a task
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {fittingOverdue.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-amber-300">Overdue</h2>
          <div className="space-y-3">
            {fittingOverdue.map((task) => (
              <TaskPlaceholder key={task.id} task={task} isOverdue />
            ))}
          </div>
        </section>
      )}
      {fittingToday.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">Today</h2>
          <div className="space-y-3">
            {fittingToday.map((task) => (
              <TaskPlaceholder key={task.id} task={task} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function TaskPlaceholder({ task, isOverdue = false }: { task: TaskWithTags; isOverdue?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-white/5 p-4 text-white",
        isOverdue ? "border-amber-400/40" : "border-white/10",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "shrink-0 rounded px-1.5 py-0.5 text-xs font-bold",
                task.priority === 1 && "bg-red-500/30 text-red-300",
                task.priority === 2 && "bg-yellow-500/30 text-yellow-300",
                task.priority === 3 && "bg-green-500/30 text-green-300",
              )}
            >
              P{task.priority}
            </span>
            {isOverdue && (
              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-xs font-semibold text-amber-300">
                Overdue
              </span>
            )}
            <span className="truncate font-medium">{task.name}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-blue-100/60">
            <span>{task.time_estimate_minutes} min</span>
          </div>
          {task.task_tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {task.task_tags.map((tag) => (
                <span key={tag.tag_name} className="rounded-full bg-purple-500/20 px-2 py-0.5 text-xs text-purple-200">
                  {tag.tag_name}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button disabled aria-label="Complete task" className="cursor-not-allowed rounded-md p-1.5 text-green-400/40">
            <CircleCheck className="size-5" />
          </button>
          <button disabled aria-label="Dismiss task" className="cursor-not-allowed rounded-md p-1.5 text-red-400/40">
            <CircleX className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
