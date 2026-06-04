import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

export async function setup() {
  config({ path: ".env.test" });

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  const email2 = process.env.TEST_USER2_EMAIL;
  const password2 = process.env.TEST_USER2_PASSWORD;

  if (!url || !serviceRoleKey || !email || !password || !email2 || !password2) {
    throw new Error("Missing required env vars in .env.test");
  }

  try {
    await fetch(`${url}/health`);
  } catch {
    console.warn("⚠ Supabase not reachable — integration tests will fail; unit and handler tests will run");
    return;
  }

  const adminClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error && !error.message.includes("already been registered")) {
    throw error;
  }

  const { error: error2 } = await adminClient.auth.admin.createUser({
    email: email2,
    password: password2,
    email_confirm: true,
  });

  if (error2 && !error2.message.includes("already been registered")) {
    throw error2;
  }
}
