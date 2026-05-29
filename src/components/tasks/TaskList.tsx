import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { TaskWithTags } from "@/types";

interface TaskListProps {
  initialTasks: TaskWithTags[];
}

function formatDate(iso: string) {
  const parts = iso.split("-").map(Number);
  const y = parts[0] ?? 2026;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function TaskList({ initialTasks }: TaskListProps) {
  const [tasks, setTasks] = useState<TaskWithTags[]>(initialTasks);

  async function deleteTask(taskId: string) {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Task deleted");
        setTasks((prev) => prev.filter((t) => t.id !== taskId));
      } else {
        toast.error("Failed to delete task");
      }
    } catch {
      toast.error("Failed to delete task");
    }
  }

  if (tasks.length === 0) {
    return (
      <div className="py-12 text-center text-blue-100/60">
        <p className="mb-4">No tasks yet.</p>
        <a href="/tasks/new" className="text-purple-300 hover:text-purple-100 hover:underline">
          Create your first task
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <div key={task.id} className="rounded-xl border border-white/10 bg-white/5 p-4 text-white">
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
                <span className="truncate font-medium">{task.name}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-blue-100/60">
                <span>{formatDate(task.target_date)}</span>
                <span>{task.time_estimate_minutes} min</span>
              </div>
              {task.task_tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {task.task_tags.map((tag) => (
                    <span
                      key={tag.tag_name}
                      className="rounded-full bg-purple-500/20 px-2 py-0.5 text-xs text-purple-200"
                    >
                      {tag.tag_name}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a href={`/tasks/${task.id}/edit`}>
                <Button variant="ghost" size="icon" aria-label="Edit task">
                  <Pencil className="size-4" />
                </Button>
              </a>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete task"
                onClick={() => deleteTask(task.id)}
                className="text-red-400 hover:text-red-300"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
