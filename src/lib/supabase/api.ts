import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createAdminClient } from "./admin";

/**
 * Erstellt einen authentifizierten Supabase-Client für API-Routes.
 * Gibt den Client und den aktuellen User zurück.
 * Bei fehlender Auth wird automatisch ein 401-Response erzeugt.
 *
 * Auto-Provisioning: Wenn der User noch keinen Tenant hat, wird
 * automatisch ein Tenant + Profil-Link erstellt (Erstanmeldung).
 */
export async function withAuth() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder",
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // ignore in read-only context
          }
        },
      },
    }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { supabase: null, user: null, tenantId: null };
  }

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();

  let tenantId = (profile?.tenant_id as string) ?? null;

  // Immer den ältesten Tenant als gemeinsamen Workspace verwenden
  const { data: sharedTenant } = await admin
    .from("tenants")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  const sharedId = (sharedTenant?.id as string) ?? null;

  if (!tenantId || (sharedId && tenantId !== sharedId)) {
    const displayName = user.user_metadata?.name ?? user.email ?? "Mein Unternehmen";

    if (sharedId) {
      tenantId = sharedId;
    } else {
      // Erster Nutzer überhaupt → Tenant anlegen
      const slug = user.id.slice(0, 8);
      const { data: newTenant } = await admin
        .from("tenants")
        .insert({ name: displayName, slug })
        .select("id")
        .single();
      if (newTenant) tenantId = newTenant.id as string;
    }

    if (tenantId) {
      if (profile) {
        await admin.from("profiles").update({ tenant_id: tenantId }).eq("id", user.id);
      } else {
        await admin.from("profiles").insert({
          id: user.id,
          tenant_id: tenantId,
          role: "tenant_user",
          name: displayName,
          initials: displayName.slice(0, 2).toUpperCase(),
        });
      }
    }
  }

  return { supabase, user, tenantId };
}

export function unauthorized() {
  return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}
