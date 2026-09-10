import { NextResponse } from "next/server";
import { withAuth, unauthorized } from "@/lib/supabase/api";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/newsletter/accounts — verfügbare Absender-Postfächer des Mandanten.
export async function GET() {
  const { user, tenantId } = await withAuth();
  if (!user || !tenantId) return unauthorized();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("email_accounts")
    .select("id, email")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("email", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
