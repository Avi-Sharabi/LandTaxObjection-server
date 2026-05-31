# FYI Document Upload Skill

## What is FYI
FYI (fyi.app) is YML Group's cloud-based document management platform for accounting clients. Uploaded PDFs are stored against a specific client record inside FYI and become accessible to accountants and their clients via the FYI portal.

---

## Available MCP Tools

There are three tools. Use them together or individually depending on the task.

| Tool | When to use |
|---|---|
| `get_case_documents` | List all documents for a case with pre-built FYI names and download URLs |
| `upload_fyi_document` | Upload a single document (via URL or base64) |
| `upload_all_case_documents` | Upload every document for a case in one call |

---

## Tool: `get_case_documents`

Retrieves all documents for a dispute case. Always call this first when you need to upload specific documents — it returns the `fyi_name` and `download_url` needed by `upload_fyi_document`.

### Parameters

| Field | Type | Required | Description |
|---|---|---|---|
| `case_reference` | string | One of these | Human-readable reference e.g. `LTD-2026-000088` |
| `case_id` | string | One of these | UUID of the dispute case |

### Response
```json
{
  "documents": [
    {
      "id": "uuid",
      "document_type": "valuation_notice",
      "filename": "valuation-notice.pdf",
      "fyi_name": "LTD-2026-000088 - valuation-notice",
      "download_url": "https://blob.core.windows.net/...?sas...",
      "uploaded_at": "2025-01-20T00:00:00Z"
    }
  ]
}
```

> `download_url` is a 30-minute Azure Blob SAS URL. `fyi_name` is pre-built as `{case_reference} - {filename_without_extension}` — always pass it as `document_name` when calling `upload_fyi_document`.

---

## Tool: `upload_fyi_document`

Uploads a single file to FYI. Provide the file as either a URL (from `get_case_documents`) or raw base64.

### Parameters

| Field | Type | Required | Description |
|---|---|---|---|
| `url` | string | One of these | HTTP/HTTPS URL to fetch the file from (use `download_url` from `get_case_documents`) |
| `base64` | string | One of these | Base64-encoded PDF content |
| `document_name` | string | **Always provide** | Display name in FYI. Use the `fyi_name` from `get_case_documents` (e.g. `LTD-2026-000088 - valuation-notice`). Defaults to `"Valuation Notice"` if omitted. |

### Response (success)
```json
{ "version_id": "abc123-fyi-version-id", "success": true }
```

### Response (failure)
```json
{ "content": [{ "type": "text", "text": "FYI upload failed. Verify credentials and IS_FYI_PROD_ENABLED flag." }], "isError": true }
```

### File naming rule
The file stored in FYI (and on S3) is always named `{document_name}.pdf`. To avoid double extensions, `document_name` must **not** include `.pdf`:
- ✅ `LTD-2026-000088 - valuation-notice` → stored as `LTD-2026-000088 - valuation-notice.pdf`
- ❌ `LTD-2026-000088 - valuation-notice.pdf` → stored as `LTD-2026-000088 - valuation-notice.pdf.pdf`

The `fyi_name` field from `get_case_documents` is already stripped of the extension — use it directly.

---

## Tool: `upload_all_case_documents`

Uploads every document for a case in a single call. Use this when you want to bulk-upload without listing first.

### Parameters

| Field | Type | Required | Description |
|---|---|---|---|
| `case_reference` | string | One of these | e.g. `LTD-2026-000088` |
| `case_id` | string | One of these | UUID of the dispute case |

### Response (all succeeded)
```json
{
  "uploaded": [
    { "document_type": "valuation_notice", "filename": "valuation-notice.pdf", "fyi_name": "LTD-2026-000088 - valuation-notice", "version_id": "abc123" }
  ],
  "total": 1
}
```

### Response (partial failure — stops on first error)
```json
{
  "uploaded": [...],
  "failed": { "document_type": "...", "filename": "...", "fyi_name": "...", "error": "FYI upload failed — verify credentials and IS_FYI_PROD_ENABLED flag" }
}
```

> FYI name for each document = `{case_reference} - {blob_filename_without_extension}` e.g. `LTD-2026-000088 - valuation-notice`

---

## Recommended Flows

### Upload a specific document
```
1. get_case_documents(case_reference: "LTD-2026-000088")
2. upload_fyi_document(url: <download_url>, document_name: <fyi_name>)
```

### Upload all documents at once
```
1. upload_all_case_documents(case_reference: "LTD-2026-000088")
```

---

## Upload Process (3 Steps — `fyiStorageService`)

### Step 1 — Create Document Record
`POST {FYI_BASE_URL}/external/document`
```json
{
  "metadata": {
    "action": { "value": "upsert" },
    "data": { "model": { "name": "<document_name>", "document_type": "Pdf", "client_code": "<FYI_CLIENT_CODE>" } }
  }
}
```
Returns: `{ data: { version_id: "..." } }`

### Step 2 — Get S3 Pre-signed Upload Form
`POST {FYI_BASE_URL}/external/document`
```json
{
  "metadata": { "action": { "value": "uploadForm" }, "data": { "id": "<version_id>" } }
}
```
Returns: `{ data: { url: "https://s3...", fields: { ... } } }`

### Step 3 — Upload PDF to S3
`POST <url from Step 2>` — multipart form with all `fields` first, then:
- `file`: PDF blob, `Content-Type: application/pdf`, filename `{document_name}.pdf`

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `FYI_BASE_URL` | FYI API base URL (e.g. `https://api-ap-southeast-2.fyi.app`) |
| `FYI_ACCESS_ID` | API access credential |
| `FYI_ACCESS_SECRET` | API access credential |
| `FYI_CLIENT_CODE` | Client code for uploads. If set → production mode. If unset → falls back to `ASHT0001` (test mode) |

> Production vs test mode is determined solely by whether `FYI_CLIENT_CODE` is set. There is no separate `IS_FYI_PROD_ENABLED` flag in the current implementation.

---

## Implementation Files

| Purpose | File |
|---|---|
| Upload service (3-step logic) | `src/common/fyi-storage/fyi-storage.service.ts` |
| FYI module | `src/common/fyi-storage/fyi-storage.module.ts` |
| MCP tool — single upload | `src/mcp/tools/upload-fyi.tool.ts` |
| MCP tool — bulk upload | `src/mcp/tools/upload-all-case-documents.tool.ts` |
| MCP tool — list documents | `src/mcp/tools/get-case-documents.tool.ts` |
| AI chat service (orchestrates tools) | `src/api/fyi-ai/fyi-ai.service.ts` |
| Upload args DTO | `src/mcp/dto/fyi-upload-args.dto.ts` |

---

## Known Limitations

1. **`FYI_CLIENT_CODE` required for production** — If unset, all uploads go against the fallback client code `ASHT0001`. Set this env var to target the correct client in FYI.

2. **SAS URL expiry** — `download_url` from `get_case_documents` is valid for 30 minutes. Do not cache it across sessions.

3. **Stops on first failure** — `upload_all_case_documents` halts immediately when any single upload fails. Documents uploaded before the failure are not rolled back.

4. **PDF only** — The upload service always sends `Content-Type: application/pdf`. Non-PDF files will be stored with the wrong MIME type.
