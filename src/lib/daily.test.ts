import { describe, it, expect } from "vitest";
import { applyBudgetFilter } from "@/lib/daily";
import type { Task } from "@/types";

function makeTask(id: string, time_estimate_minutes: number): Task {
  return {
    id,
    user_id: "user-1",
    name: `Task ${id}`,
    target_date: "2026-06-15",
    priority: 1,
    time_estimate_minutes,
    status: "pending",
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
  };
}

describe("applyBudgetFilter", () => {
  it("includes all tasks when they all fit within budget", () => {
    const tasks = [makeTask("a", 20), makeTask("b", 30), makeTask("c", 40)];
    const result = applyBudgetFilter(tasks, 2);
    expect(result).toEqual(new Set(["a", "b", "c"]));
  });

  it("includes tasks at exact cumulative boundary (inclusive)", () => {
    const tasks = [makeTask("a", 30), makeTask("b", 60)];
    const result = applyBudgetFilter(tasks, 1.5);
    expect(result).toEqual(new Set(["a", "b"]));
  });

  it("skips over-budget task but includes smaller later task", () => {
    const tasks = [makeTask("a", 50), makeTask("b", 60), makeTask("c", 20)];
    const result = applyBudgetFilter(tasks, 70 / 60);
    expect(result.has("a")).toBe(true);
    expect(result.has("b")).toBe(false);
    expect(result.has("c")).toBe(true);
  });

  it("respects array order — first task consumes budget before later tasks", () => {
    const overdueTask = makeTask("overdue", 40);
    const todayTask = makeTask("today", 40);
    const result = applyBudgetFilter([overdueTask, todayTask], 40 / 60);
    expect(result.has("overdue")).toBe(true);
    expect(result.has("today")).toBe(false);
  });

  it("returns empty set for empty input", () => {
    const result = applyBudgetFilter([], 2);
    expect(result.size).toBe(0);
  });

  it("returns empty set when budget is zero", () => {
    const tasks = [makeTask("a", 30)];
    const result = applyBudgetFilter(tasks, 0);
    expect(result.size).toBe(0);
  });

  it("skips tasks with null or non-finite time_estimate_minutes", () => {
    const nullTask = makeTask("null", null as unknown as number);
    const nanTask = makeTask("nan", NaN);
    const negTask = makeTask("neg", -10);
    const validTask = makeTask("valid", 30);
    const result = applyBudgetFilter([nullTask, nanTask, negTask, validTask], 2);
    expect(result.has("null")).toBe(false);
    expect(result.has("nan")).toBe(false);
    expect(result.has("neg")).toBe(false);
    expect(result.has("valid")).toBe(true);
  });
});
