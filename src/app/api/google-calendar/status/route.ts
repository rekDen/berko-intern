import { NextRequest, NextResponse } from "next/server";
import { withAuth, unauthorized } from "@/lib/supabase/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { googleConfigured } from "@/lib/google/calendar";

// GET → connection status for current user
export async function GET() {
  const { user } = await withAuth();
  if (!user) return unauthorized();

  const admin = createAdminClient();
  const { data } = await admin
    .from("google_calendar_connections")
    .select("google_email, sync_enabled, google_calendar_id")
    .eq("user_id", user.id)
    .single();

  return NextResponse.json({
    configured: googleConfigured(),
    connected: Boolean(data),
    email: data?.google_email ?? null,
    sync_enabled: data?.sync_enabled ?? false,
    calendar_id: data?.google_calendar_id ?? "primary",
  });
}

// PATCH { sync_enabled } → toggle mirroring
export async function PATCH(request: NextRequest) {
  const { user } = await withAuth();
  if (!user) return unauthorized();

  const body = await request.json();
  const admin = createAdminClient();
  const { error } = await admin
    .from("google_calendar_connections")
    .update({ sync_enabled: Boolean(body.sync_enabled), updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE → disconnect (revoke + remove tokens)
export async function DELETE() {
  const { user } = await withAuth();
  if (!user) return unauthorized();

  const admin = createAdminClient();
  const { data } = await admin
    .from("google_calendar_connections")
    .select("access_token")
    .eq("user_id", user.id)
    .single();

  if (data?.access_token) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${data.access_token}`, { method: "POST" });
    } catch {
      /* best effort */
    }
  }

  await admin.from("google_calendar_connections").delete().eq("user_id", user.id);
  return NextResponse.json({ success: true });
}
