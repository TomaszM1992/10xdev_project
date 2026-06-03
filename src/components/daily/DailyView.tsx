import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { TaskCard } from "./TaskCard";
import { AvailableHoursInput } from "./AvailableHoursInput";
import { applyBudgetFilter, restoreAtIndex } from "@/lib/daily";
import type { TaskWithTags } from "@/types";

interface DailyViewProps {
  initialOverdueTasks: TaskWithTags[];
  initialTodayTasks: TaskWithTags[];
  initialAvailableHours: number;
  date: string;
}

export function DailyView({ initialOverdueTasks, initialTodayTasks, initialAvailableHours, date }: DailyViewProps) {
  const [overdueTasks, setOverdueTasks] = useState<TaskWithTags[]>(initialOverdueTasks);
  const [todayTasks, setTodayTasks] = useState<TaskWithTags[]>(initialTodayTasks);
  const [availableHours, setAvailableHours] = useState(initialAvailableHours);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(false);

  // Debounced PATCH to /api/settings whenever availableHours changes (skips initial mount)
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ available_hours: availableHours }),
      }).catch(() => toast.error("Failed to save available hours"));
    }, 500);
    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    };
  }, [availableHours]);

  // Cumulative budget filter — overdue first, then today; SQL ordering is preserved
  const all = [...overdueTasks, ...todayTasks];
  const fittingIds = applyBudgetFilter(all, availableHours);

  const fittingOverdue = overdueTasks.filter((t) => fittingIds.has(t.id));
  const fittingToday = todayTasks.filter((t) => fittingIds.has(t.id));
  const hasAnything = fittingOverdue.length > 0 || fittingToday.length > 0;

  function handleStatusChange(task: TaskWithTags, status: "complete" | "dismissed") {
    const isOverdue = overdueTasks.some((t) => t.id === task.id);
    const list = isOverdue ? overdueTasks : todayTasks;
    const idx = list.findIndex((t) => t.id === task.id);
    const label = status === "complete" ? "Task completed" : "Task dismissed";

    // Splices the task back at its original position using functional state update
    function restore() {
      if (isOverdue) {
        setOverdueTasks((prev) => restoreAtIndex(prev, idx, task));
      } else {
        setTodayTasks((prev) => restoreAtIndex(prev, idx, task));
      }
    }

    // Optimistic removal
    if (isOverdue) {
      setOverdueTasks((prev) => prev.filter((t) => t.id !== task.id));
    } else {
      setTodayTasks((prev) => prev.filter((t) => t.id !== task.id));
    }

    // Fire PATCH immediately so navigation away from the page doesn't lose the action.
    // AbortController lets Undo cancel an in-flight request; the undone flag lets the
    // .then() handler fire a reversal if the PATCH already landed before Undo was clicked.
    const controller = new AbortController();
    let undone = false;

    void fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("server error");
        if (undone) {
          // Undo was clicked while this PATCH was in-flight and the request landed before
          // abort took effect — fire a reversal to put the task back to pending.
          void fetch(`/api/tasks/${task.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "pending" }),
          }).catch(() => toast.error("Failed to undo — please refresh"));
        }
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        if (!undone) {
          restore();
          toast.error("Failed to update task — restored");
        }
      });

    toast.success(label, {
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => {
          undone = true;
          controller.abort(); // cancel if still in-flight; no-op if already landed
          restore();
          // If the PATCH already landed, the .then() handler above fires the reversal
        },
      },
    });
  }

  if (!hasAnything) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <AvailableHoursInput value={availableHours} onChange={setAvailableHours} />
          <a
            href="/tasks/new"
            className="rounded-lg bg-purple-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-purple-700"
          >
            + New task
          </a>
        </div>
        <div className="py-12 text-center text-blue-100/60">
          <p className="mb-4">No tasks scheduled for {date}.</p>
          <a href="/tasks/new" className="text-purple-300 hover:text-purple-100 hover:underline">
            Create a task
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <AvailableHoursInput value={availableHours} onChange={setAvailableHours} />
        <a
          href="/tasks/new"
          className="rounded-lg bg-purple-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-purple-700"
        >
          + New task
        </a>
      </div>
      {fittingOverdue.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-amber-300">Overdue</h2>
          <div className="space-y-3">
            {fittingOverdue.map((task) => (
              <TaskCard key={task.id} task={task} isOverdue onStatusChange={handleStatusChange} />
            ))}
          </div>
        </section>
      )}
      {fittingToday.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">Today</h2>
          <div className="space-y-3">
            {fittingToday.map((task) => (
              <TaskCard key={task.id} task={task} onStatusChange={handleStatusChange} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
