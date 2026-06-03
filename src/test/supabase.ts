import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export async function signInTestUser(): Promise<SupabaseClient> {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;

  if (!url || !anonKey || !email || !password) {
    throw new Error("Missing required env vars in .env.test");
  }

  if (!url.startsWith("http://127.0.0.1")) {
    throw new Error(`Refusing to run integration tests against non-local Supabase: ${url}`);
  }

  const client = createClient(url, anonKey);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

export async function signInSecondTestUser(): Promise<SupabaseClient> {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const email = process.env.TEST_USER2_EMAIL;
  const password = process.env.TEST_USER2_PASSWORD;

  if (!url || !anonKey || !email || !password) {
    throw new Error("Missing required env vars in .env.test");
  }

  if (!url.startsWith("http://127.0.0.1")) {
    throw new Error(`Refusing to run integration tests against non-local Supabase: ${url}`);
  }

  const client = createClient(url, anonKey);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

export async function cleanupTestTasks(client: SupabaseClient): Promise<void> {
  const { data, error: userError } = await client.auth.getUser();
  if (userError) throw userError;

  const { error } = await client.from("tasks").delete().eq("user_id", data.user.id);
  if (error) throw error;
}

export async function cleanupTestSettings(client: SupabaseClient): Promise<void> {
  const { data, error: userError } = await client.auth.getUser();
  if (userError) throw userError;

  const { error } = await client.from("user_settings").delete().eq("user_id", data.user.id);
  if (error) throw error;
}
