import { describe, it, expect, beforeAll, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Task } from "@/types";
import { signInTestUser, cleanupTestTasks } from "../supabase";

describe("date filter", () => {
  let client: SupabaseClient;
  let userId: string;

  beforeAll(async () => {
    client = await signInTestUser();
    const { data } = await client.auth.getUser();
    if (!data.user) throw new Error("Test user not authenticated");
    userId = data.user.id;
    await cleanupTestTasks(client);
  });

  afterEach(async () => {
    await cleanupTestTasks(client);
  });

  it("task with target_date 2026-06-15 appears when filtering for 2026-06-15", async () => {
    const insertResult = await client
      .from("tasks")
      .insert({
        user_id: userId,
        name: "Date match task",
        target_date: "2026-06-15",
        priority: 1,
        time_estimate_minutes: 30,
        status: "pending",
      })
      .select()
      .single();
    const inserted = insertResult.data as Task;

    const selectResult = await client.from("tasks").select().eq("target_date", "2026-06-15");
    const ids = (selectResult.data as Task[]).map((t) => t.id);
    expect(ids).toContain(inserted.id);
  });

  it("task with target_date 2026-06-15 does not appear when filtering for 2026-06-14", async () => {
    const insertResult = await client
      .from("tasks")
      .insert({
        user_id: userId,
        name: "Date no-match task",
        target_date: "2026-06-15",
        priority: 1,
        time_estimate_minutes: 30,
        status: "pending",
      })
      .select()
      .single();
    const inserted = insertResult.data as Task;

    const selectResult = await client.from("tasks").select().eq("target_date", "2026-06-14");
    const ids = (selectResult.data as Task[]).map((t) => t.id);
    expect(ids).not.toContain(inserted.id);
  });

  it("task with target_date in the past appears in an overdue query", async () => {
    const today = new Date().toISOString().split("T")[0];
    const insertResult = await client
      .from("tasks")
      .insert({
        user_id: userId,
        name: "Overdue task",
        target_date: "2020-01-01",
        priority: 1,
        time_estimate_minutes: 30,
        status: "pending",
      })
      .select()
      .single();
    const inserted = insertResult.data as Task;

    const selectResult = await client.from("tasks").select().lt("target_date", today).eq("status", "pending");
    const ids = (selectResult.data as Task[]).map((t) => t.id);
    expect(ids).toContain(inserted.id);
  });
});
