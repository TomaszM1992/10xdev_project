import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

export async function setup() {
  config({ path: ".env.test" });

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;

  if (!url || !serviceRoleKey || !email || !password) {
    throw new Error("Missing required env vars in .env.test");
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
}
