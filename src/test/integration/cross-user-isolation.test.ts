import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Task } from "@/types";
import { signInTestUser, signInSecondTestUser, cleanupTestTasks } from "../supabase";

describe("cross-user isolation (Risk #4)", () => {
  let userAClient: SupabaseClient;
  let userBClient: SupabaseClient;
  let userAId: string;
  let taskId: string;

  beforeAll(async () => {
    userAClient = await signInTestUser();
    userBClient = await signInSecondTestUser();

    const { data: userData } = await userAClient.auth.getUser();
    if (!userData.user) throw new Error("User A not authenticated");
    userAId = userData.user.id;

    await cleanupTestTasks(userAClient);

    const insertResult = await userAClient
      .from("tasks")
      .insert({
        user_id: userAId,
        name: "User A private task",
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
    await cleanupTestTasks(userAClient);
  });

  it("RLS hides User A task from User B SELECT", async () => {
    const result = await userBClient.from("tasks").select().eq("id", taskId).maybeSingle();

    expect(result.error).toBeNull();
    expect(result.data).toBeNull();
  });

  it("RLS blocks User B UPDATE; original task is unchanged", async () => {
    const updateResult = await userBClient.from("tasks").update({ name: "hacked" }).eq("id", taskId).select();

    expect(updateResult.data).toHaveLength(0);

    const refetch = await userAClient.from("tasks").select().eq("id", taskId).single();

    expect(refetch.error).toBeNull();
    expect((refetch.data as Task).name).toBe("User A private task");
  });

  it("RLS blocks User B DELETE; task still exists for User A", async () => {
    const deleteResult = await userBClient.from("tasks").delete().eq("id", taskId).select();

    expect(deleteResult.data).toHaveLength(0);

    const refetch = await userAClient.from("tasks").select().eq("id", taskId).maybeSingle();

    expect(refetch.error).toBeNull();
    expect(refetch.data).not.toBeNull();
  });
});
