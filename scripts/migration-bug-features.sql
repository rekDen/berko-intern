-- Bug / Feature tracker
create table if not exists bug_features (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id),
  created_by  uuid references auth.users(id),
  title       text not null,
  description text,
  type        text not null default 'feature' check (type in ('bug', 'feature')),
  status      text not null default 'backlog'
              check (status in ('backlog', 'on_hold', 'in_progress', 'review', 'done', 'rejected')),
  attachments jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table bug_features enable row level security;

create policy "tenant members can manage bug_features"
  on bug_features for all
  using (tenant_id = (select tenant_id from profiles where id = auth.uid()));

-- Storage bucket: create manually in Supabase dashboard → Storage → New bucket → "bug-features" (public)
-- Or run: insert into storage.buckets (id, name, public) values ('bug-features', 'bug-features', true) on conflict do nothing;
