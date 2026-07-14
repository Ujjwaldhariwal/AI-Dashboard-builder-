alter table dashboard_export_artifacts
drop constraint if exists dashboard_export_artifacts_export_type_check;

alter table dashboard_export_artifacts
add constraint dashboard_export_artifacts_export_type_check
check (export_type in ('manifest_json', 'report_pdf', 'bundle_zip'));
