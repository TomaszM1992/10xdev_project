import { describe, it, expect, beforeAll, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Task } from "@/types";
import { signInTestUser, cleanupTestTasks } from "../supabase";

describe("task persistence", () => {
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

  it("inserted task is retrievable by id in a subsequent select", async () => {
    const insertResult = await client
      .from("tasks")
      .insert({
        user_id: userId,
        name: "Persistence test task",
        target_date: "2026-06-15",
        priority: 2,
        time_estimate_minutes: 30,
        status: "pending",
      })
      .select()
      .single();

    expect(insertResult.error).toBeNull();
    const inserted = insertResult.data as Task;

    const selectResult = await client.from("tasks").select().eq("id", inserted.id).single();
    expect(selectResult.error).toBeNull();
    const fetched = selectResult.data as Task;

    expect(fetched.name).toBe("Persistence test task");
    expect(fetched.priority).toBe(2);
    expect(fetched.target_date).toBe("2026-06-15");
  });

  it("task is absent from a select after it is deleted", async () => {
    const insertResult = await client
      .from("tasks")
      .insert({
        user_id: userId,
        name: "Delete test task",
        target_date: "2026-06-15",
        priority: 1,
        time_estimate_minutes: 15,
        status: "pending",
      })
      .select()
      .single();

    expect(insertResult.error).toBeNull();
    const inserted = insertResult.data as Task;

    await client.from("tasks").delete().eq("id", inserted.id);

    const absent = await client.from("tasks").select().eq("id", inserted.id).maybeSingle();
    expect(absent.data).toBeNull();
  });
});
