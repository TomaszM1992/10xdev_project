import { describe, it, expect, beforeAll, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserSettings } from "@/types";
import { signInTestUser, cleanupTestSettings } from "../supabase";

describe("settings persistence (Risk #6)", () => {
  let client: SupabaseClient;
  let userId: string;

  beforeAll(async () => {
    client = await signInTestUser();
    const { data } = await client.auth.getUser();
    if (!data.user) throw new Error("Test user not authenticated");
    userId = data.user.id;

    await cleanupTestSettings(client);
  });

  afterEach(async () => {
    await cleanupTestSettings(client);
  });

  it("upsert creates row when none exists", async () => {
    const { error } = await client
      .from("user_settings")
      .upsert({ user_id: userId, available_hours: 12 }, { onConflict: "user_id" });

    expect(error).toBeNull();

    const selectResult = await client.from("user_settings").select().eq("user_id", userId).maybeSingle();

    expect(selectResult.error).toBeNull();
    expect((selectResult.data as UserSettings | null)?.available_hours).toBe(12);
  });

  it("second upsert updates existing row", async () => {
    const { error: setupError } = await client
      .from("user_settings")
      .upsert({ user_id: userId, available_hours: 12 }, { onConflict: "user_id" });
    expect(setupError).toBeNull();

    const { error } = await client
      .from("user_settings")
      .upsert({ user_id: userId, available_hours: 6 }, { onConflict: "user_id" });

    expect(error).toBeNull();

    const selectResult = await client.from("user_settings").select().eq("user_id", userId).maybeSingle();

    expect(selectResult.error).toBeNull();
    expect((selectResult.data as UserSettings | null)?.available_hours).toBe(6);
  });

  it("no row returns null (default behavior confirmed)", async () => {
    const selectResult = await client.from("user_settings").select().eq("user_id", userId).maybeSingle();

    expect(selectResult.error).toBeNull();
    expect(selectResult.data).toBeNull();
  });
});
