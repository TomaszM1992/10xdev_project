import { useState } from "react";
import { toast } from "sonner";
import { Calendar, Clock, PencilLine } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";
import { TagInput } from "@/components/tasks/TagInput";
import { CreateTaskSchema, UpdateTaskSchema } from "@/lib/schemas";
import type { TaskWithTags } from "@/types";

interface TaskFormProps {
  task?: TaskWithTags;
}

export function TaskForm({ task }: TaskFormProps) {
  const [name, setName] = useState(task?.name ?? "");
  const [targetDate, setTargetDate] = useState(task?.target_date ?? "");
  const [priority, setPriority] = useState<1 | 2 | 3>(task?.priority ?? 2);
  const [timeEstimate, setTimeEstimate] = useState(task?.time_estimate_minutes ?? 30);
  const [tags, setTags] = useState<string[]>(task?.task_tags.map((t) => t.tag_name) ?? []);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();

    const payload = {
      name,
      target_date: targetDate,
      priority,
      time_estimate_minutes: timeEstimate,
      tags,
    };

    const parsed = task ? UpdateTaskSchema.safeParse(payload) : CreateTaskSchema.safeParse(payload);

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && !(field in fieldErrors)) {
          fieldErrors[field] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    setErrors({});

    const url = task ? `/api/tasks/${task.id}` : "/api/tasks";
    const method = task ? "PATCH" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success(task ? "Task updated" : "Task created");
        window.location.href = "/tasks";
      } else {
        let msg = "Failed to save task";
        try {
          /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
          const body = await res.json();
          if (typeof body?.error === "string") msg = body.error;
          /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
        } catch {
          // keep default
        }
        toast.error(msg);
        setSubmitting(false);
      }
    } catch {
      toast.error("Failed to save task");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormField
        id="name"
        label="Task name"
        type="text"
        value={name}
        onChange={(v) => {
          setName(v);
        }}
        placeholder="What needs to be done?"
        icon={<PencilLine className="size-4" />}
        error={errors.name}
      />

      <FormField
        id="targetDate"
        label="Target date"
        type="date"
        value={targetDate}
        onChange={(v) => {
          setTargetDate(v);
        }}
        icon={<Calendar className="size-4" />}
        error={errors.target_date}
      />

      <div>
        <span className="mb-1 block text-sm text-blue-100/80">Priority</span>
        <div className="flex gap-2">
          {([1, 2, 3] as const).map((p) => (
            <Button
              key={p}
              type="button"
              variant={priority === p ? "default" : "outline"}
              onClick={() => {
                setPriority(p);
              }}
              className="flex-1"
            >
              {p}
            </Button>
          ))}
        </div>
        {errors.priority && <p className="mt-1 text-xs text-red-300">{errors.priority}</p>}
      </div>

      <FormField
        id="timeEstimate"
        label="Time estimate (minutes)"
        type="number"
        value={String(timeEstimate)}
        onChange={(v) => {
          setTimeEstimate(parseInt(v) || 1);
        }}
        icon={<Clock className="size-4" />}
        error={errors.time_estimate_minutes}
      />

      <TagInput
        tags={tags}
        onChange={(t) => {
          setTags(t);
        }}
        error={errors.tags}
      />

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Saving…" : task ? "Update task" : "Create task"}
      </Button>
    </form>
  );
}
