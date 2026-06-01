import { describe, it, expect } from "vitest";
import { CreateTaskSchema, UpdateTaskSchema, UpdateSettingsSchema } from "@/lib/schemas";

const validCreate = {
  name: "Write tests",
  target_date: "2026-06-01",
  priority: 2 as const,
  time_estimate_minutes: 30,
  tags: ["work"],
};

describe("CreateTaskSchema", () => {
  it("accepts a valid payload", () => {
    expect(CreateTaskSchema.safeParse(validCreate).success).toBe(true);
  });

  it("accepts a payload with no tags (defaults to [])", () => {
    const { tags: _, ...noTags } = validCreate;
    const result = CreateTaskSchema.safeParse(noTags);
    expect(result.success).toBe(true);
    expect(result.success && result.data.tags).toEqual([]);
  });

  it("rejects missing name", () => {
    const { name: _, ...rest } = validCreate;
    expect(CreateTaskSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects empty name", () => {
    expect(CreateTaskSchema.safeParse({ ...validCreate, name: "" }).success).toBe(false);
  });

  it("rejects priority 4", () => {
    expect(CreateTaskSchema.safeParse({ ...validCreate, priority: 4 }).success).toBe(false);
  });

  it("rejects non-date target_date", () => {
    expect(CreateTaskSchema.safeParse({ ...validCreate, target_date: "not-a-date" }).success).toBe(false);
  });

  it("rejects 6-element tags array", () => {
    const tags = ["a", "b", "c", "d", "e", "f"];
    expect(CreateTaskSchema.safeParse({ ...validCreate, tags }).success).toBe(false);
  });

  it("rejects a tag longer than 50 characters", () => {
    const tags = ["a".repeat(51)];
    expect(CreateTaskSchema.safeParse({ ...validCreate, tags }).success).toBe(false);
  });
});

describe("UpdateTaskSchema", () => {
  it("accepts an object with only name provided", () => {
    expect(UpdateTaskSchema.safeParse({ name: "New name" }).success).toBe(true);
  });

  it("accepts an empty object (all fields optional)", () => {
    expect(UpdateTaskSchema.safeParse({}).success).toBe(true);
  });

  it("accepts priority 1", () => {
    expect(UpdateTaskSchema.safeParse({ priority: 1 }).success).toBe(true);
  });

  it("rejects priority 0", () => {
    expect(UpdateTaskSchema.safeParse({ priority: 0 }).success).toBe(false);
  });

  it("accepts status pending", () => {
    expect(UpdateTaskSchema.safeParse({ status: "pending" }).success).toBe(true);
  });

  it("accepts status complete", () => {
    expect(UpdateTaskSchema.safeParse({ status: "complete" }).success).toBe(true);
  });

  it("accepts status dismissed", () => {
    expect(UpdateTaskSchema.safeParse({ status: "dismissed" }).success).toBe(true);
  });

  it("rejects invalid status value", () => {
    expect(UpdateTaskSchema.safeParse({ status: "done" }).success).toBe(false);
  });

  it("accepts omitted status (optional)", () => {
    expect(UpdateTaskSchema.safeParse({ name: "No status" }).success).toBe(true);
  });

  it("accepts valid tags array", () => {
    expect(UpdateTaskSchema.safeParse({ tags: ["work"] }).success).toBe(true);
  });
});

describe("UpdateSettingsSchema", () => {
  it("accepts a valid available_hours value", () => {
    expect(UpdateSettingsSchema.safeParse({ available_hours: 6.5 }).success).toBe(true);
  });

  it("accepts exactly 24 hours", () => {
    expect(UpdateSettingsSchema.safeParse({ available_hours: 24 }).success).toBe(true);
  });

  it("rejects 0 hours (not positive)", () => {
    expect(UpdateSettingsSchema.safeParse({ available_hours: 0 }).success).toBe(false);
  });

  it("rejects 24.1 hours (exceeds max)", () => {
    expect(UpdateSettingsSchema.safeParse({ available_hours: 24.1 }).success).toBe(false);
  });

  it("rejects negative hours", () => {
    expect(UpdateSettingsSchema.safeParse({ available_hours: -1 }).success).toBe(false);
  });
});
