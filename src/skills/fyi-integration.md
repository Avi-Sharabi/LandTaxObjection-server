---
name: fyi-integration
description: >
  Complete reference for implementing and extending FYI document upload integration
  in the NestJS backend. Covers the 3-step FYI External API flow, environment config,
  feature flag gating, module wiring, and known gaps. Use this skill whenever working
  on FYI document uploads, the fyiStorageService, PdfStorageHandler, or any code that
  routes documents between Azure Blob Storage and the FYI platform.
---

# FYI Integration — Upload Preparation Guide

> **Backend location:** `c:\Users\CLS\OneDrive - BLESBOK ENTERPRISES PTY LTD\Desktop\landtaxdispute-server-orig`
>
> **FYI API region:** `ap-southeast-2` (Sydney)
>
> **Current status:** Production FYI uploads are DISABLED (`IS_FYI_PROD_ENABLED=false`). All uploads currently route to Azure Blob dev fallback.

---

## What is FYI?

FYI is a cloud document management platform used by YML Group to store client documents (e.g. valuation notices). When a client accepts T&C, their valuation notice PDF must be pushed from Azure Blob Storage into FYI so the accountant team can access it through their practice management workflow.

---

## Environment Variables

All FYI config lives in `.env.development` (and must be in `.env.production` for go-live).

| Variable | Value (dev) | Purpose |
|---|---|---|
| `FYI_BASE_URL` | `https://api-ap-southeast-2.fyi.app` | Base URL for all FYI API calls |
| `FYI_ACCESS_ID` | `89ca62d5-31b6-45d2-88cd-9766b69df511` | API credential — equivalent to a username |
| `FYI_ACCESS_SECRET` | `aaf34a80271c4a4a06c3c3eb63e51e353e4f109e2216ebc0bd7c4ae062866d4b` | API credential — equivalent to a password |
| `IS_FYI_PROD_ENABLED` | `false` | Feature flag. `false` = Azure dev fallback; `true` = real FYI API |
| `FYI_CLIENT_CODE` | *(not set — see Known Gaps)* | XPM client code associated with the document in FYI |

> **Never hardcode FYI credentials.** Always read via `ConfigService.get('FYI_ACCESS_ID')` etc.

---

## File Locations

| File | Path |
|---|---|
| Module | `src/common/fyi-storage/fyi-storage.module.ts` |
| Service | `src/common/fyi-storage/fyi-storage.service.ts` |
| PDF routing handler | `src/api/dispute-cases/intake/pdf-storage.handler.ts` |
| FYI not-linked exception | `src/api/clients/exceptions/client-fyi-not-linked.exception.ts` |

---

## Current Architecture

### `fyiStorageModule`
NestJS module that provides and exports `fyiStorageService`. Import it into any feature module that needs to upload to FYI.

```typescript
@Module({
  imports: [ConfigModule],
  providers: [fyiStorageService],
  exports: [fyiStorageService],
})
export class fyiStorageModule {}
```

> **Note:** `fyiStorageService` depends on `HttpService` from `@nestjs/axios`. The consuming module must also import `HttpModule`.

### `fyiStorageService.uploadToFyi(base64, documentId)`
Main upload method. Accepts a base64-encoded PDF string and a document ID, executes the 3-step FYI API flow, and returns the `version_id` string on success or `null` on failure.

### `PdfStorageHandler`
Orchestrator that decides whether to upload to FYI (real or dev) or Azure Blob based on two flags:
- `isFyiClient` (passed by caller) — whether the client is linked to FYI
- `IS_FYI_PROD_ENABLED` (from config) — whether real FYI uploads are enabled

---

## The 3-Step FYI Upload Flow

All requests to Steps 1 and 2 use these headers:
```
x-fyi-access-id: <FYI_ACCESS_ID>
x-fyi-access-secret: <FYI_ACCESS_SECRET>
Content-Type: application/json
```

### Step 1 — Create document record (action: `upsert`)
```http
POST {FYI_BASE_URL}/external/document
{
  "metadata": {
    "action": { "value": "upsert" },
    "data": {
      "model": {
        "name": "{documentId} Valuation Notice",
        "document_type": "Pdf",
        "client_code": "{FYI_CLIENT_CODE}"
      }
    }
  }
}
```
**Response:** `data.data.version_id` — the FYI document version identifier used in Step 2.

### Step 2 — Get S3 pre-signed upload form (action: `uploadForm`)
```http
POST {FYI_BASE_URL}/external/document
{
  "metadata": {
    "action": { "value": "uploadForm" },
    "data": { "id": "{version_id}" }
  }
}
```
**Response:** `data.data.url` (S3 bucket URL) and `data.data.fields` (pre-signed form fields object).

### Step 3 — Upload file to S3
```typescript
const form = new globalThis.FormData();  // Node 18+ native FormData
for (const [key, value] of Object.entries(fields)) {
  form.append(key, value as string);
}
form.append('file', new Blob([buffer], { type: 'application/pdf' }), `${documentId}.pdf`);
await firstValueFrom(
  this.httpService.post(url, form, { maxBodyLength: Infinity }),
);
```
> Use `maxBodyLength: Infinity` — S3 multipart uploads will fail without it.

**Return value:** `version_id` from Step 1. Store this if you need to reference the FYI document later.

---

## Feature Flag Routing Logic

```
isFyiClient = true
├── IS_FYI_PROD_ENABLED = true  → fyiStorageService.uploadToFyi()       (real FYI)
└── IS_FYI_PROD_ENABLED = false → azureBlobService.uploadToFyiDev()     (Azure dev bucket)

isFyiClient = false
└── azureBlobService.uploadToAzureBlob()                                 (standard Azure path)
```

This routing is implemented in `PdfStorageHandler.handlePdfStorage()`.

---

## Wiring Into a Feature Module

```typescript
import { fyiStorageModule } from 'src/common/fyi-storage/fyi-storage.module';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    HttpModule,         // required — fyiStorageService uses HttpService
    fyiStorageModule,
  ],
})
export class YourFeatureModule {}
```

Inject into a service:
```typescript
constructor(private readonly fyiStorageService: fyiStorageService) {}
```

---

## Error Handling

`uploadToFyi` swallows errors and returns `null` on failure:
```typescript
} catch (error) {
  console.error('FYI upload failed:', error.message);
  return null;
}
```

**Callers must always handle `null`:**
```typescript
const versionId = await this.fyiStorageService.uploadToFyi(base64, documentId);
if (!versionId) {
  // log a warning or schedule retry — do not throw unless upload is blocking
}
```

---

## Known Gaps & Issues

### 1. `FYI_CLIENT_CODE` is missing from `.env`
The service calls `this.config.get('FYI_CLIENT_CODE')` but this variable is not defined in `.env.development`. In FYI, `client_code` identifies which client the document belongs to — typically the XPM client code.

**Resolution options:**
- Add a static `FYI_CLIENT_CODE` to `.env` if all uploads target one FYI client (unlikely for multi-client)
- Make it dynamic: pass `clientCode` as a parameter to `uploadToFyi()` and source it from `client.xpm_uuid` or a dedicated `client.fyi_client_code` column

### 2. FYI client fields were removed from `clients` table
Migration `1775022368813-CleanupClientFyiFields` dropped `fyi_id`, `fyi_uuid`, `fyi_manager_email`, `fyi_partner_email`, and `client_code` from the `clients` table.

If per-client FYI linking is required, a new column must be added back via migration. Follow the `update-database` skill.

### 3. `isFyiClient` source is undefined
`PdfStorageHandler.handlePdfStorage()` accepts `isFyiClient: boolean` but with FYI fields removed from `client.entity.ts`, there is no authoritative source for this value.

**Resolution options:**
- Add a boolean flag column `is_fyi_enabled` on `clients`
- Derive from presence of a non-null `fyi_client_code` column
- Treat `client.source === 'xpm'` as a proxy if all XPM clients use FYI

---

## Document Metadata — Currently Hardcoded

The document name and type in Step 1 are hardcoded for valuation notices:
```typescript
name: `${documentId} Valuation Notice`,
document_type: 'Pdf',
```

When adding other document types (objection packages, advisory letters), extend the signature:
```typescript
async uploadToFyi(
  base64: string,
  documentId: string,
  documentName: string,
  documentType: 'Pdf' | 'Word' | 'Excel' = 'Pdf',
): Promise<string | null>
```

---

## Go-Live Checklist (before setting `IS_FYI_PROD_ENABLED=true`)

- [ ] `FYI_CLIENT_CODE` is set correctly — per-client or global
- [ ] `isFyiClient` logic has a reliable source in the database
- [ ] Production FYI credentials are in `.env.production` and confirmed active with FYI team
- [ ] `null` returns from `uploadToFyi` are handled gracefully in all callers
- [ ] A retry/alert mechanism exists for failed FYI uploads (currently silent)
- [ ] `document_name` and `document_type` are correct for each upload context
- [ ] End-to-end tested in staging with `IS_FYI_PROD_ENABLED=true` against a FYI sandbox org
