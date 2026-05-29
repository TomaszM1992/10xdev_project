import { CircleCheck, CircleX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TaskWithTags } from "@/types";

interface TaskCardProps {
  task: TaskWithTags;
  isOverdue?: boolean;
  onStatusChange: (task: TaskWithTags, status: "complete" | "dismissed") => void;
}

export function TaskCard({ task, isOverdue = false, onStatusChange }: TaskCardProps) {
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
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              onStatusChange(task, "complete");
            }}
            aria-label="Complete task"
            className="text-green-400 hover:bg-green-400/10 hover:text-green-300"
          >
            <CircleCheck className="size-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              onStatusChange(task, "dismissed");
            }}
            aria-label="Dismiss task"
            className="text-red-400 hover:bg-red-400/10 hover:text-red-300"
          >
            <CircleX className="size-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
