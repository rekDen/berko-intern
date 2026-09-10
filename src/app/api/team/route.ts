import { NextResponse } from "next/server";
import { withAuth, unauthorized } from "@/lib/supabase/api";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/team — alle registrierten Nutzer der App
export async function GET() {
  const { user } = await withAuth();
  if (!user) return unauthorized();

  const admin = createAdminClient();

  const [{ data: authUsers }, { data: profiles }] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("profiles").select("id, name, title, initials"),
  ]);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const members = (authUsers?.users ?? [])
    .filter((u) => !u.banned_until)
    .map((u) => {
      const profile = profileMap.get(u.id);
      const name = profile?.name && profile.name !== u.email ? profile.name : (u.email ?? u.id);
      return {
        id: u.id,
        name,
        title: profile?.title ?? null,
        initials: profile?.initials ?? name.slice(0, 2).toUpperCase(),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  return NextResponse.json(members);
}
