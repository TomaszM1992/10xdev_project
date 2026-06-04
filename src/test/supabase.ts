import { createClient, type SupabaseClient } from "@supabase/supabase-js";

async function signIn(emailVar: string, passwordVar: string): Promise<SupabaseClient> {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const email = process.env[emailVar];
  const password = process.env[passwordVar];

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

export function signInTestUser(): Promise<SupabaseClient> {
  return signIn("TEST_USER_EMAIL", "TEST_USER_PASSWORD");
}

export function signInSecondTestUser(): Promise<SupabaseClient> {
  return signIn("TEST_USER2_EMAIL", "TEST_USER2_PASSWORD");
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
