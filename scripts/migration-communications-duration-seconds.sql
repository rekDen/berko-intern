alter table communications
  add column if not exists duration_seconds int check (duration_seconds is null or duration_seconds >= 0);
