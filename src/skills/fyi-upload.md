# FYI Document Upload Skill

## What is FYI
FYI (fyi.app) is YML Group's cloud-based document management platform for accounting clients. Uploaded PDFs are stored against a specific client record inside FYI and become accessible to accountants and their clients via the FYI portal.

---

## When to Use This Tool
Use `upload_fyi_document` when you need to:
- Store a generated PDF (advisory letter, objection package, valuation notice) in a client's FYI workspace
- Trigger a permanent document record in FYI after AI processing is complete

Do **not** use this tool if `IS_FYI_PROD_ENABLED` is not `true` — uploads will fail silently and the method returns `null`.

---

## Tool: `upload_fyi_document`

### Parameters

| Field | Type | Required | Description |
|---|---|---|---|
| `base64` | string | Yes | Base64-encoded PDF file content |
| `document_id` | string | Yes | Unique identifier — used as the PDF filename and document name prefix in FYI |
| `document_name` | string | No | Display label shown inside FYI. Defaults to `"{document_id} Valuation Notice"` |
| `client_code` | string | No | Per-client FYI client code override. Falls back to `FYI_CLIENT_CODE` env var |

### Response (success)
```json
{
  "version_id": "abc123-fyi-version-id",
  "success": true
}
```

### Response (failure)
```json
{
  "content": [{ "type": "text", "text": "FYI upload failed. Verify credentials and IS_FYI_PROD_ENABLED flag." }],
  "isError": true
}
```

---

## Upload Process (3 Steps)

### Step 1 — Create Document Record
`POST {FYI_BASE_URL}/external/document`

```json
{
  "metadata": {
    "action": { "value": "upsert" },
    "data": {
      "model": {
        "name": "<document_name>",
        "document_type": "Pdf",
        "client_code": "<client_code>"
      }
    }
  }
}
```
Headers: `x-fyi-access-id`, `x-fyi-access-secret`

Returns: `{ data: { version_id: "..." } }`

### Step 2 — Get S3 Pre-signed Upload Form
`POST {FYI_BASE_URL}/external/document`

```json
{
  "metadata": {
    "action": { "value": "uploadForm" },
    "data": { "id": "<version_id from Step 1>" }
  }
}
```
Returns: `{ data: { url: "https://s3...", fields: { ... } } }`

### Step 3 — Upload PDF to S3
`POST <url from Step 2>` with multipart form data:
- All `fields` from Step 2 appended first
- `file` field: PDF blob with `Content-Type: application/pdf`, filename `{document_id}.pdf`

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `FYI_BASE_URL` | FYI API base URL (e.g. `https://api-ap-southeast-2.fyi.app`) |
| `FYI_ACCESS_ID` | API access credential |
| `FYI_ACCESS_SECRET` | API access credential |
| `FYI_CLIENT_CODE` | Default client code for uploads (can be overridden per call) |
| `IS_FYI_PROD_ENABLED` | Must be `"true"` for real FYI uploads; dev/test uses Azure Blob fallback |

---

## Implementation Files

| Purpose | File |
|---|---|
| Upload service (3-step logic) | `src/common/fyi-storage/fyi-storage.service.ts` |
| NestJS module | `src/common/fyi-storage/fyi-storage.module.ts` |
| MCP tool wrapper | `src/mcp/tools/upload-fyi.tool.ts` |
| MCP input DTO | `src/mcp/dto/fyi-upload-args.dto.ts` |
| REST controller | `src/api/fyi-upload/fyi-upload.controller.ts` |
| REST DTO | `src/api/fyi-upload/dto/fyi-upload.dto.ts` |

---

## Known Limitations

1. **`IS_FYI_PROD_ENABLED` flag** — When this is not `"true"`, `uploadToFyi` falls through to the Azure Blob dev path in the intake handler. The MCP tool and REST endpoint call `uploadToFyi` directly and will return `null` if the FYI API call fails.

2. **Per-client `client_code`** — The `FYI_CLIENT_CODE` env var is a global fallback. For multi-client scenarios, pass the per-client `client_code` explicitly in the tool call.

3. **Base64 size** — Very large PDFs should be pre-compressed before encoding. FYI does not enforce a size limit at the API layer but S3 pre-signed forms may expire within 15 minutes of generation.
