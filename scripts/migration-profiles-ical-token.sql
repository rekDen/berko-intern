alter table profiles add column if not exists ical_token uuid;
update profiles set ical_token = gen_random_uuid() where ical_token is null;
