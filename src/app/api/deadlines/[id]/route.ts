import { NextRequest, NextResponse } from "next/server";
import { withAuth, unauthorized } from "@/lib/supabase/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { mirrorUpsert, mirrorDelete } from "@/lib/google/sync";
import {
  sendDeadlineInvitations,
  sendDeadlineCancellations,
  normalizeInviteEmails,
} from "@/lib/deadline-invites";

// PATCH /api/deadlines/:id
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await withAuth();
  if (!supabase || !user) return unauthorized();

  const { id } = await params;
  const body = await request.json();

  const allowed = ["date", "time", "title", "description", "type", "completed", "assigned_to", "location", "contact_id", "invite_emails"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }
  if ("contact_id" in updates) updates.contact_id = updates.contact_id || null;

  // Frühere Teilnehmerliste laden, um neu Eingeladene und Entfernte zu ermitteln.
  // Nur relevant, wenn invite_emails Teil der Aktualisierung ist.
  const invitesChanged = "invite_emails" in updates;
  let oldEmails: string[] = [];
  if (invitesChanged) {
    const { data: existing } = await supabase
      .from("deadlines")
      .select("invite_emails")
      .eq("id", id)
      .single();
    oldEmails = normalizeInviteEmails(existing?.invite_emails);
    // Normalisierte Liste speichern (dedupliziert, getrimmt).
    updates.invite_emails = normalizeInviteEmails(updates.invite_emails);
  }

  const { data, error } = await supabase
    .from("deadlines")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await mirrorUpsert(user.id, data);

  let invitesSent = 0;
  let cancellationsSent = 0;
  if (invitesChanged) {
    const newEmails = normalizeInviteEmails(data.invite_emails);
    const oldKeys = new Set(oldEmails.map((e) => e.toLowerCase()));
    const newKeys = new Set(newEmails.map((e) => e.toLowerCase()));
    const added = newEmails.filter((e) => !oldKeys.has(e.toLowerCase()));
    const removed = oldEmails.filter((e) => !newKeys.has(e.toLowerCase()));

    const deadline = {
      id: data.id,
      title: data.title,
      description: data.description ?? "",
      location: data.location ?? "",
      date: data.date,
      time: data.time,
      type: data.type,
    };
    [invitesSent, cancellationsSent] = await Promise.all([
      sendDeadlineInvitations(user.id, added, deadline),
      sendDeadlineCancellations(user.id, removed, deadline),
    ]);
  }

  return NextResponse.json({ ...data, invites_sent: invitesSent, cancellations_sent: cancellationsSent });
}

// DELETE /api/deadlines/:id
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, tenantId } = await withAuth();
  if (!user || !tenantId) return unauthorized();

  const { id } = await params;

  // Admin client bypasses RLS; scope the delete to the caller's tenant for safety.
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("deadlines")
    .select("google_event_id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  const { error } = await admin
    .from("deadlines")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await mirrorDelete(user.id, existing?.google_event_id ?? null);

  return NextResponse.json({ success: true });
}
