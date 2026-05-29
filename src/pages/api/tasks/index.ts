import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { CreateTaskSchema } from "@/lib/schemas";
import type { Task, TaskWithTags } from "@/types";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Service unavailable" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateTaskSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }

  // Zod has validated the data; cast to inferred type to satisfy strict no-unsafe-assignment
  const { tags, ...taskFields } = parsed.data;

  const insertResult = await supabase
    .from("tasks")
    .insert({ ...taskFields, user_id: user.id })
    .select()
    .single();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data: rawTask, error: taskError } = insertResult;

  if (taskError || !rawTask) {
    return Response.json({ error: "Failed to create task" }, { status: 500 });
  }

  const task = rawTask as Task;

  if (tags.length > 0) {
    const { error: tagError } = await supabase
      .from("task_tags")
      .insert(tags.map((tag_name) => ({ task_id: task.id, tag_name })));

    if (tagError) {
      return Response.json({ error: "Failed to create tags" }, { status: 500 });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data: rawTaskWithTags, error: fetchError } = await supabase
    .from("tasks")
    .select("*, task_tags(*)")
    .eq("id", task.id)
    .single();

  if (fetchError || !rawTaskWithTags) {
    return Response.json({ error: "Failed to fetch created task" }, { status: 500 });
  }

  return Response.json(rawTaskWithTags as TaskWithTags, { status: 201 });
};
