import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { UpdateSettingsSchema } from "@/lib/schemas";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("user_settings")
    .select("available_hours")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return Response.json({ error: "Failed to fetch settings" }, { status: 500 });
  }

  if (!data) {
    return Response.json({ available_hours: 8 }, { status: 200 });
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const availableHours: number = data.available_hours;
  return Response.json({ available_hours: availableHours }, { status: 200 });
};

export const PATCH: APIRoute = async (context) => {
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

  const parsed = UpdateSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const { error } = await supabase
    .from("user_settings")
    .upsert({ user_id: user.id, available_hours: parsed.data.available_hours });

  if (error) {
    return Response.json({ error: "Failed to update settings" }, { status: 500 });
  }

  return new Response(null, { status: 204 });
};
