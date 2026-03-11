# Dispute Intake Endpoint

## Endpoint: POST /dispute-cases/intake/submit

This endpoint handles the submission of a new dispute application from the intake form.

### Request Format

- **Content-Type**: `application/json`
- **Request Body**: JSON with base64-encoded PDF (optional)

### Request Body Fields

```json
{
  "fullName": "Jane Smith",              // Required: string
  "email": "jane@example.com",           // Required: email
  "propAddress": "123 Example St, Sydney NSW 2000",  // Required: string
  "assessYearFrom": 2024,                // Required: number (1976-2100)
  "assessYearTo": 2026,                  // Required: number (1976-2100)
  "state": "NSW",                        // Required: 'NSW' | 'VIC' | 'QLD' | 'WA'
  "dirName": "Michael Huang",            // Required: string
  "dirEmail": "director@company.com",    // Required: email
  "grounds": [                           // Required: array of legal grounds
    "incorrect_land_value",
    "incorrect_area_or_dimensions"
  ],
  "addNotes": "Additional context...",   // Optional: string
  "pdfBase64": "JVBERi0xLjQKJeLjz9M...", // Optional: base64-encoded PDF content
  "pdfFileName": "land_tax_bill.pdf"     // Required if pdfBase64 is provided
}
```

### Legal Ground Options

- `incorrect_land_value`
- `constraint_oversight`
- `incorrect_area_or_dimensions`
- `incorrect_apportionment`

### PDF Encoding

The PDF should be base64-encoded. On the frontend, convert the File object to base64 before sending:

```javascript
const reader = new FileReader();
reader.onload = (event) => {
  const base64 = event.target.result.split(',')[1]; // Remove data URL prefix
  // Use base64 string in request payload
};
reader.readAsDataURL(file);
```

### Response

On successful submission, returns the created dispute case:

```json
{
  "id": "uuid",
  "case_reference": "DISPUTE-XXXX-XXXXXX",
  "client": {
    "id": "uuid",
    "display_name": "Jane Smith",
    "contact_email": "jane@example.com"
  },
  "property": {
    "id": "uuid",
    "address": "123 Example St, Sydney NSW 2000",
    "state": "NSW"
  },
  "status": "intake",
  "jurisdiction": "NSW",
  "statutory_deadline": "2024-XX-XX",
  "legal_grounds": [
    {
      "id": "uuid",
      "ground": "incorrect_land_value",
      "validated": false
    }
  ],
  "created_at": "2024-XX-XXTXX:XX:XXZ"
}
```

### Error Responses

- `400 Bad Request` - Missing required fields or invalid data
  - "Full name and email are required"
  - "Director name and email are required"
  - "Property address is required"
  - "At least one legal ground must be selected"
  - "PDF filename is required when PDF is provided"
  - "Invalid base64 format for PDF"
  - "Only PDF files are allowed"

- `500 Internal Server Error` - Database or server error

### Example Usage (JavaScript/Fetch)

```javascript
const fileInput = document.getElementById('pdfInput');
const file = fileInput.files[0];

let pdfBase64 = null;
if (file) {
  const reader = new FileReader();
  reader.onload = async (event) => {
    pdfBase64 = event.target.result.split(',')[1];
    
    const payload = {
      fullName: 'Jane Smith',
      email: 'jane@example.com',
      propAddress: '123 Example St, Sydney NSW 2000',
      assessYearFrom: 2024,
      assessYearTo: 2026,
      state: 'NSW',
      dirName: 'Michael Huang',
      dirEmail: 'director@company.com',
      grounds: ['incorrect_land_value', 'incorrect_area_or_dimensions'],
      addNotes: 'Additional notes here',
      pdfBase64: pdfBase64,
      pdfFileName: file.name
    };

    const response = await fetch('/api/dispute-cases/intake/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log(result);
  };
  reader.readAsDataURL(file);
}
```

### Example Usage (TypeScript with Helper Function)

```typescript
import { submitDisputeIntake, fileToBase64 } from './dispute-intake.handler';

async function handleSubmit() {
  const formData = {
    fullName: 'Jane Smith',
    email: 'jane@example.com',
    propAddress: '123 Example St, Sydney NSW 2000',
    assessYearFrom: 2024,
    assessYearTo: 2026,
    state: 'NSW',
    dirName: 'Michael Huang',
    dirEmail: 'director@company.com',
    grounds: ['incorrect_land_value'],
    addNotes: 'Additional notes',
    pdfFile: document.getElementById('pdfInput').files[0],
  };

  const result = await submitDisputeIntake(formData);
  console.log('Created case:', result.case_reference);
}
```

### Notes

1. The endpoint automatically creates or finds related entities (User, Client, Property, etc.)
2. A unique case reference is automatically generated
3. The statutory deadline is calculated as valuation_date + 60 days
4. PDF is stored with base64 encoding - can be integrated with Azure Blob Storage, S3, or other blob services
5. The dispute case is created in `intake` status by default
6. State field is required and must be one of: NSW, VIC, QLD, WA

