# DB to Dashboard API Inventory

This file is the Apidog staging checklist for the `DB to DASHBOARD` folder.

Base path: same Next.js origin.

Auth model:
- Admin APIs require an authenticated session unless noted as platform-admin only.
- Client APIs require an authenticated tenant user and only expose read-only published runtime behavior.
- Data-source credentials are never returned by public API responses.

## Folder Plan

- `Admin / Tenancy`
- `Admin / Data Sources`
- `Admin / Semantic Model`
- `Admin / Semantic Datasets`
- `Admin / Dashboard Charts`
- `Admin / Observability`
- `Client / Runtime`

## Admin / Tenancy

### `GET /api/admin/api-docs/inventory`

Purpose: return the internal API inventory as structured JSON for Apidog sync tooling.

Auth: authenticated admin workspace user.

Response:

```json
{
  "inventory": {
    "endpoints": [],
    "folders": [],
    "counts": {
      "endpoints": 0,
      "admin": 0,
      "client": 0,
      "folders": 0
    }
  }
}
```

### `GET /api/admin/tenants`

Purpose: list tenants for platform administration.

Auth: platform admin.

Response:

```json
{
  "tenants": [
    {
      "id": "uuid",
      "name": "Acme",
      "slug": "acme",
      "status": "active",
      "primaryDomain": "dash.acme.com",
      "branding": {},
      "createdAt": "iso",
      "updatedAt": "iso"
    }
  ]
}
```

### `POST /api/admin/tenants`

Purpose: create a tenant and owner membership for the current admin.

Auth: platform admin.

Body:

```json
{
  "name": "Acme",
  "slug": "acme",
  "primaryDomain": "dash.acme.com",
  "status": "active"
}
```

Response: `{ "tenant": { ... } }`

### `GET /api/admin/projects`

Purpose: list dashboard projects, optionally by tenant.

Auth: authenticated tenant/project access.

Query:
- `tenantId`: optional UUID

Response: `{ "projects": [...] }`

### `POST /api/admin/projects`

Purpose: create a dashboard project under a tenant.

Auth: authenticated tenant editor.

Body:

```json
{
  "tenantId": "uuid",
  "name": "Revenue Ops",
  "description": "Executive dashboard workspace"
}
```

Response: `{ "project": { ... } }`

## Admin / Data Sources

### `GET /api/admin/data-sources`

Purpose: list data sources with safe connection metadata only.

Auth: authenticated project access.

Query:
- `tenantId`: optional UUID
- `projectId`: optional UUID

Response: `{ "dataSources": [...] }`

### `POST /api/admin/data-sources`

Purpose: save encrypted Postgres data-source credentials.

Auth: authenticated project editor.

Body:

```json
{
  "tenantId": "uuid",
  "projectId": "uuid",
  "name": "Production replica",
  "host": "db.example.com",
  "port": 5432,
  "database": "analytics",
  "username": "readonly_user",
  "password": "secret",
  "sslMode": "require"
}
```

Response: `{ "dataSource": { ...safe metadata... } }`

### `POST /api/admin/data-sources/{id}/test`

Purpose: test a saved Postgres connection and update status.

Auth: authenticated project editor.

Body: `{}`

Response: connection health, latency, database/user metadata, or error.

### `POST /api/admin/data-sources/{id}/introspect`

Purpose: read schema/table/column metadata from a saved data source.

Auth: authenticated project editor.

Body: `{}`

Response: introspected tables/columns and persisted metadata count.

### `GET /api/admin/schema-columns`

Purpose: list discovered schema columns for mapping.

Auth: authenticated project access.

Query:
- `dataSourceId`: optional UUID
- `projectId`: optional UUID

Response: `{ "columns": [...] }`

## Admin / Semantic Model

### `GET /api/admin/semantic-models`

Purpose: list business models, optionally by project.

Auth: authenticated project access.

Query:
- `projectId`: optional UUID

Response: `{ "models": [...] }`

### `POST /api/admin/semantic-models`

Purpose: create a draft semantic business model.

Auth: authenticated project editor.

Body:

```json
{
  "tenantId": "uuid",
  "projectId": "uuid",
  "name": "Utility Billing Model",
  "description": "Business layer for billing dashboards"
}
```

Response: `{ "model": { ... } }`

### `PATCH /api/admin/semantic-models/{id}`

Purpose: update semantic model status or metadata.

Auth: authenticated project editor.

Body: status/update payload defined by route validation.

Response: `{ "model": { ... } }`

### `GET /api/admin/semantic-models/{id}/field-mappings`

Purpose: list business entities and mapped fields for a semantic model.

Auth: authenticated project access.

Response: model entities with field mappings.

### `POST /api/admin/semantic-models/{id}/field-mappings`

Purpose: create business entities/fields from selected source columns.

Auth: authenticated project editor.

Response: mapped entities and fields.

### `GET /api/admin/semantic-models/{id}/metrics`

Purpose: list business metrics for a semantic model.

Auth: authenticated project access.

Response: `{ "metrics": [...] }`

### `POST /api/admin/semantic-models/{id}/metrics`

Purpose: create business metrics from model fields.

Auth: authenticated project editor.

Response: `{ "metric": { ... } }`

### `GET /api/admin/semantic-models/{id}/relationships`

Purpose: list join relationships for a semantic model.

Auth: authenticated project access.

Response: `{ "relationships": [...] }`

### `POST /api/admin/semantic-models/{id}/relationships`

Purpose: create join relationships between business entities.

Auth: authenticated project editor.

Response: `{ "relationship": { ... } }`

## Admin / Semantic Datasets

### `GET /api/admin/datasets`

Purpose: list semantic datasets, optionally by project.

Auth: authenticated project access.

Query:
- `projectId`: optional UUID

Response: `{ "datasets": [...] }`

### `POST /api/admin/datasets`

Purpose: create a draft semantic dataset from selected fields, metrics, and relationships.

Auth: authenticated project editor.

Body:

```json
{
  "tenantId": "uuid",
  "projectId": "uuid",
  "modelId": "uuid",
  "name": "Daily recharge by zone",
  "description": "Published chart dataset",
  "fieldIds": ["uuid"],
  "metricIds": ["uuid"],
  "relationshipIds": ["uuid"]
}
```

Response: `{ "dataset": { ... } }`

### `PATCH /api/admin/datasets/{id}`

Purpose: move a dataset between `draft`, `published`, and `archived`.

Auth: authenticated project editor.

Body:

```json
{ "status": "published" }
```

Response: `{ "dataset": { ... } }`

### `GET /api/admin/datasets/{id}/plan`

Purpose: compile dataset plan, SQL readiness, shape analysis, and chart recommendations.

Auth: authenticated project access.

Response:

```json
{
  "plan": {
    "dataset": {},
    "fields": [],
    "metrics": [],
    "relationships": [],
    "limits": { "rowLimit": 500, "timeoutMs": 12000 },
    "dataSourceId": "uuid",
    "warnings": [],
    "queryPlan": {},
    "chartOptions": {
      "shape": {},
      "compatibility": []
    }
  }
}
```

### `POST /api/admin/datasets/{id}/run`

Purpose: execute a read-only admin dataset preview.

Auth: authenticated project access.

Body: `{}`

Response: rows, fields, row count, elapsed time, and warnings.

## Admin / Dashboard Charts

### `GET /api/admin/dashboard-charts`

Purpose: list saved chart configs, optionally by project.

Auth: authenticated project access.

Query:
- `projectId`: optional UUID

Response: `{ "charts": [...] }`

### `POST /api/admin/dashboard-charts`

Purpose: validate and save a draft dashboard chart config.

Auth: authenticated project editor.

Body:

```json
{
  "tenantId": "uuid",
  "projectId": "uuid",
  "datasetId": "uuid",
  "name": "Recharge by zone",
  "description": "",
  "templateId": "grouped-bar",
  "encoding": {
    "xAxisFieldId": "uuid",
    "yMetricIds": ["uuid"],
    "seriesFieldId": "uuid",
    "stackMetricIds": [],
    "tooltipFieldIds": ["uuid"],
    "labelById": {
      "uuid": "Revenue"
    },
    "colorById": {},
    "sort": null,
    "limit": 25
  },
  "presentation": {
    "size": "standard",
    "showLegend": true,
    "showLabels": false,
    "valueFormat": null
  },
  "interactions": {},
  "layout": {
    "order": 0,
    "gridSpan": 2
  }
}
```

Response:

```json
{
  "chart": {},
  "validation": {
    "state": "valid",
    "issues": []
  }
}
```

### `POST /api/admin/dashboard-charts/validate`

Purpose: validate a chart config without saving it.

Auth: authenticated project editor.

Body:

```json
{
  "datasetId": "uuid",
  "templateId": "bar",
  "encoding": {
    "xAxisFieldId": "uuid",
    "yMetricIds": ["uuid"],
    "tooltipFieldIds": [],
    "labelById": {},
    "colorById": {},
    "limit": 25
  }
}
```

Response: `{ "validation": { "state": "valid|warning|invalid", "issues": [] } }`

### `GET /api/admin/dashboard-charts/audit`

Purpose: revalidate saved chart configs against current datasets, semantic fields, and metrics without mutating them.

Auth: authenticated project access.

Query:
- `projectId`: optional UUID
- `tenantId`: optional UUID
- `status`: optional chart status, defaults to `published`; use `all` to include every status

Response:

```json
{
  "audit": {
    "checkedAt": "iso",
    "summary": {
      "total": 1,
      "healthy": 1,
      "stale": 0,
      "blocked": 0
    },
    "items": [
      {
        "chart": {
          "id": "uuid",
          "name": "Recharge by zone",
          "status": "published",
          "templateId": "grouped-bar",
          "validationState": "valid"
        },
        "dataset": {
          "id": "uuid",
          "status": "published"
        },
        "healthState": "healthy",
        "validation": {
          "state": "valid",
          "issues": []
        }
      }
    ]
  }
}
```

### `POST /api/admin/dashboard-charts/audit`

Purpose: run the chart health audit and persist a `chart_health_runs` snapshot for degraded dashboard reporting.

Auth: authenticated project access.

Query:
- `projectId`: optional UUID
- `tenantId`: optional UUID
- `status`: optional chart status filter, defaults to `published`; use `all` for all statuses

Response:

```json
{
  "audit": {
    "summary": {
      "total": 0,
      "healthy": 0,
      "stale": 0,
      "blocked": 0
    },
    "items": []
  },
  "run": {
    "id": "uuid",
    "degraded_chart_ids": []
  }
}
```

### `PATCH /api/admin/dashboard-charts/{id}`

Purpose: update chart status. Publishing revalidates current dataset/template/encoding and requires the dataset to be published.

Auth: authenticated project editor.

Body:

```json
{ "status": "published" }
```

Response: `{ "chart": { ... }, "validation": { ... } }`

## Admin / Observability

### `GET /api/admin/query-runs`

Purpose: list recent semantic query runtime executions for troubleshooting latency, failures, and workload patterns.

Auth: authenticated tenant/project access.

Query:
- `tenantId`: optional UUID
- `projectId`: optional UUID
- `datasetId`: optional UUID
- `chartId`: optional UUID
- `status`: optional `success` or `error`
- `surface`: optional runtime surface, for example `admin_preview`, `client_dataset`, or `client_chart`
- `limit`: optional number, default `50`, max `200`

Response:

```json
{
  "runs": [
    {
      "id": "uuid",
      "tenantId": "uuid",
      "projectId": "uuid",
      "datasetId": "uuid",
      "chartId": "uuid",
      "surface": "client_chart",
      "status": "success",
      "queryHash": "sha256",
      "rowCount": 25,
      "elapsedMs": 120,
      "timeoutMs": 12000,
      "warnings": [],
      "createdAt": "2026-06-25T00:00:00.000Z"
    }
  ]
}
```

## Client / Runtime

### `POST /api/client/{tenantSlug}/charts/{id}/run`

Purpose: execute a published, valid chart config through the read-only runtime and return server-resolved chart field names.

Auth: authenticated tenant user.

Body: `{}`

Security:
- tenant slug must resolve to an active tenant
- chart must belong to that tenant
- chart status must be `published`
- chart validation state must be `valid`
- chart config is revalidated against current semantic fields and metrics at runtime
- dataset must be published
- source data source must belong to the same tenant and project
- query must pass read-only validation
- execution is logged to `semantic_query_runs` with query hash, row count, latency, timeout, warnings, and status
- runtime calls are rate-limited and return `429` with `Retry-After` when exceeded

Response:

```json
{
  "result": {
    "chart": {
      "id": "uuid",
      "name": "Recharge by zone",
      "templateId": "grouped-bar",
      "resolved": {
        "xField": "Zone",
        "yFields": ["Revenue"],
        "tooltipFields": ["Zone", "Revenue"],
        "sortField": "Revenue"
      }
    },
    "dataset": { "id": "uuid", "name": "Revenue", "status": "published" },
    "warnings": [],
    "rows": [],
    "fields": [],
    "rowCount": 0,
    "elapsedMs": 0
  }
}
```

### `POST /api/client/{tenantSlug}/datasets/{id}/run`

Purpose: execute a published client dataset through the read-only runtime.

Auth: authenticated tenant user.

Body: `{}`

Security:
- tenant slug must resolve to an active tenant
- dataset must belong to that tenant
- dataset status must be `published`
- source data source must belong to the same tenant and project
- query must pass read-only validation
- execution is logged to `semantic_query_runs` with query hash, row count, latency, timeout, warnings, and status
- runtime calls are rate-limited and return `429` with `Retry-After` when exceeded

Response:

```json
{
  "result": {
    "tenant": { "id": "uuid", "name": "Acme", "slug": "acme" },
    "dataset": { "id": "uuid", "name": "Revenue", "status": "published" },
    "warnings": [],
    "rows": [],
    "fields": [],
    "rowCount": 0,
    "elapsedMs": 0
  }
}
```

## Apidog Sprint Notes

When we do the Apidog import sprint:
- Create one endpoint per section above under the `DB to DASHBOARD` Apidog folder.
- Add session/cookie auth at folder level.
- Add sample `401`, `400`, `422`, and success responses for mutating endpoints.
- Mark credential-bearing request fields as secret or masked.
- Add environment variables for base URL and sample tenant/project/dataset/chart IDs.
