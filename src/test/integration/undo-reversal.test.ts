import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Task } from "@/types";
import { signInTestUser, cleanupTestTasks } from "../supabase";

describe("undo reversal (Risk #5)", () => {
  let client: SupabaseClient;
  let userId: string;
  let taskId: string;

  beforeAll(async () => {
    client = await signInTestUser();
    const { data } = await client.auth.getUser();
    if (!data.user) throw new Error("Test user not authenticated");
    userId = data.user.id;

    await cleanupTestTasks(client);

    const insertResult = await client
      .from("tasks")
      .insert({
        user_id: userId,
        name: "Undo reversal test task",
        target_date: "2026-06-15",
        priority: 1,
        time_estimate_minutes: 30,
        status: "pending",
      })
      .select()
      .single();

    if (insertResult.error) throw insertResult.error;
    taskId = (insertResult.data as Task).id;
  });

  afterAll(async () => {
    await cleanupTestTasks(client);
  });

  it("PATCH to 'complete' updates status", async () => {
    const result = await client.from("tasks").update({ status: "complete" }).eq("id", taskId).select().single();

    expect(result.error).toBeNull();
    expect((result.data as Task).status).toBe("complete");
  });

  it("PATCH back to 'pending' (undo reversal) restores status", async () => {
    const pre = await client.from("tasks").select().eq("id", taskId).single();
    expect(pre.error).toBeNull();
    expect((pre.data as Task).status).toBe("complete");

    const result = await client.from("tasks").update({ status: "pending" }).eq("id", taskId).select().single();

    expect(result.error).toBeNull();
    expect((result.data as Task).status).toBe("pending");
  });
});
