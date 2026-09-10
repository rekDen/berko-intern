alter table communications
  add column if not exists gatekeeper_bypassed text,   -- 'ja' | 'nein'
  add column if not exists call_status         text,
  add column if not exists call_result         text,
  add column if not exists follow_up           text,
  add column if not exists sentiment           text;
