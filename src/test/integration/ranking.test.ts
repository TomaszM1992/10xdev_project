import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Task } from "@/types";
import { applyBudgetFilter } from "@/lib/daily";
import { signInTestUser, cleanupTestTasks } from "../supabase";

describe("ranking and budget", () => {
  let client: SupabaseClient;
  let userId: string;
  let taskA: Task, taskB: Task, taskC: Task, taskD: Task, taskE: Task;
  let setupComplete = false;

  beforeAll(async () => {
    client = await signInTestUser();
    const { data } = await client.auth.getUser();
    userId = data.user!.id;
    await cleanupTestTasks(client);

    const insert = async (priority: 1 | 2 | 3, time_estimate_minutes: number): Promise<Task> => {
      const result = await client
        .from("tasks")
        .insert({
          user_id: userId,
          name: `Fixture P${priority}-${time_estimate_minutes}m`,
          target_date: "2026-06-15",
          priority,
          time_estimate_minutes,
          status: "pending",
        })
        .select()
        .single();
      if (result.error) throw result.error;
      return result.data as Task;
    };

    taskA = await insert(1, 30);
    taskB = await insert(1, 30);
    taskC = await insert(1, 60);
    taskD = await insert(2, 30);
    taskE = await insert(1, 5);
    setupComplete = true;
  });

  afterAll(async () => {
    if (!setupComplete) return;
    await cleanupTestTasks(client);
  });

  it("tasks are ordered priority ASC, time ASC, created_at ASC", async () => {
    const selectResult = await client
      .from("tasks")
      .select()
      .eq("target_date", "2026-06-15")
      .order("priority", { ascending: true })
      .order("time_estimate_minutes", { ascending: true })
      .order("created_at", { ascending: true });

    expect(selectResult.error).toBeNull();
    const ids = (selectResult.data as Task[]).map((t) => t.id);
    // E: P1-5min; A: P1-30min 1st; B: P1-30min 2nd; C: P1-60min; D: P2-30min
    expect(ids).toEqual([taskE.id, taskA.id, taskB.id, taskC.id, taskD.id]);
  });

  it("applyBudgetFilter includes task at exact cumulative boundary (inclusive)", () => {
    // E(5) + A(30) + B(30) = 65 min — B is at the exact boundary
    const fittingIds = applyBudgetFilter([taskE, taskA, taskB, taskC, taskD], 65 / 60);
    expect(fittingIds.has(taskE.id)).toBe(true);
    expect(fittingIds.has(taskA.id)).toBe(true);
    expect(fittingIds.has(taskB.id)).toBe(true);
    expect(fittingIds.has(taskC.id)).toBe(false);
    expect(fittingIds.has(taskD.id)).toBe(false);
  });

  it("overdue tasks consume budget before today tasks regardless of priority", () => {
    // D (P2-30min) placed first to simulate overdue-first ordering; A (P1-30min) is today
    const fittingIds = applyBudgetFilter([taskD, taskA], 30 / 60);
    expect(fittingIds.has(taskD.id)).toBe(true);
    expect(fittingIds.has(taskA.id)).toBe(false);
  });
});
