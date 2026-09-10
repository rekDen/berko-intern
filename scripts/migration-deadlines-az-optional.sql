-- Aktenzeichen (az) ist optional – es wird nicht im Termin/Frist-Formular erfasst.
alter table deadlines alter column az drop not null;
alter table deadlines alter column az set default '';
