alter table dashboard_export_artifacts
add column if not exists storage_bucket text,
add column if not exists storage_path text,
add column if not exists storage_status text not null default 'inline' check (storage_status in ('inline', 'uploaded', 'failed', 'skipped')),
add column if not exists storage_error text,
add column if not exists byte_size integer check (byte_size is null or byte_size >= 0),
add column if not exists checksum_sha256 text;

create index if not exists idx_dashboard_export_artifacts_storage_path
on dashboard_export_artifacts (storage_bucket, storage_path)
where storage_path is not null;
