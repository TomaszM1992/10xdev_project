import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { UpdateTaskSchema } from "@/lib/schemas";
import type { TaskWithTags } from "@/types";

export const prerender = false;

export const PATCH: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { id } = context.params;
  if (!id) {
    return Response.json({ error: "Missing task id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = UpdateTaskSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }

  // Zod has validated the data; cast to inferred type to satisfy strict no-unsafe-assignment
  const { tags, ...scalarFields } = parsed.data;

  if (Object.keys(scalarFields).length > 0) {
    const { error: updateError } = await supabase.from("tasks").update(scalarFields).eq("id", id);

    if (updateError) {
      return Response.json({ error: "Failed to update task" }, { status: 500 });
    }
  }

  if (tags !== undefined) {
    const { error: deleteError } = await supabase.from("task_tags").delete().eq("task_id", id);

    if (deleteError) {
      return Response.json({ error: "Failed to replace tags" }, { status: 500 });
    }

    if (tags.length > 0) {
      const { error: insertError } = await supabase
        .from("task_tags")
        .insert(tags.map((tag_name) => ({ task_id: id, tag_name })));

      if (insertError) {
        return Response.json({ error: "Failed to insert tags" }, { status: 500 });
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data: rawTaskWithTags, error: fetchError } = await supabase
    .from("tasks")
    .select("*, task_tags(*)")
    .eq("id", id)
    .single();

  if (fetchError || !rawTaskWithTags) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  return Response.json(rawTaskWithTags as TaskWithTags, { status: 200 });
};

export const DELETE: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { id } = context.params;
  if (!id) {
    return Response.json({ error: "Missing task id" }, { status: 400 });
  }

  const { data: existing } = await supabase.from("tasks").select("id").eq("id", id).single();

  if (!existing) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  const { error: deleteError } = await supabase.from("tasks").delete().eq("id", id);

  if (deleteError) {
    return Response.json({ error: "Failed to delete task" }, { status: 500 });
  }

  return new Response(null, { status: 204 });
};
