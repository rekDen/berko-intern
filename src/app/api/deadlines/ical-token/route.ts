import { NextResponse } from "next/server";
import { withAuth, unauthorized } from "@/lib/supabase/api";
import { createAdminClient } from "@/lib/supabase/admin";

// GET — return current ical_token for the authenticated user
export async function GET() {
  const { user } = await withAuth();
  if (!user) return unauthorized();

  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("ical_token")
    .eq("id", user.id)
    .single();

  return NextResponse.json({ token: data?.ical_token ?? null });
}

// POST — regenerate ical_token
export async function POST() {
  const { user } = await withAuth();
  if (!user) return unauthorized();

  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .update({ ical_token: crypto.randomUUID() })
    .eq("id", user.id)
    .select("ical_token")
    .single();

  return NextResponse.json({ token: data?.ical_token ?? null });
}
