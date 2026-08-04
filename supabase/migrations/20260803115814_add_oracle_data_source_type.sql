alter table public.data_sources
  drop constraint if exists data_sources_type_check;

alter table public.data_sources
  add constraint data_sources_type_check
  check (type in ('postgres', 'oracle'));
