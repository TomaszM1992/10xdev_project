import { describe, it, expect, beforeAll, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ createClient: () => ({}) }));

let POST: (ctx: unknown) => Promise<Response>;

beforeAll(async () => {
  ({ POST } = await import("@/pages/api/tasks/index"));
});

function makeCtx(body: string, user: unknown = { id: "test-user-id" }) {
  return {
    locals: { user },
    cookies: {},
    request: new Request("http://localhost/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }),
  };
}

describe("POST /api/tasks — schema validation", () => {
  it("returns 400 when priority is invalid (4)", async () => {
    const ctx = makeCtx(
      JSON.stringify({ name: "T", target_date: "2026-06-15", priority: 4, time_estimate_minutes: 30 }),
    );
    const res = await POST(ctx);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { properties?: { priority?: unknown } } };
    expect(body.error.properties?.priority).toBeDefined();
  });

  it("returns 400 when required field target_date is missing", async () => {
    const ctx = makeCtx(JSON.stringify({ name: "T", priority: 1, time_estimate_minutes: 30 }));
    const res = await POST(ctx);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: unknown };
    expect(body.error).toBeDefined();
  });

  it("returns 400 with 'Invalid JSON' for non-JSON body", async () => {
    const ctx = makeCtx("not-json");
    const res = await POST(ctx);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid JSON");
  });

  it("returns 401 when no authenticated user", async () => {
    const ctx = makeCtx(
      JSON.stringify({ name: "T", target_date: "2026-06-15", priority: 1, time_estimate_minutes: 30 }),
      null,
    );
    const res = await POST(ctx);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Unauthorized");
  });
});
