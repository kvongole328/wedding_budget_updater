# Wedding Budget Sheet Functions

I built this because I was too lazy to actually update the budget tracker for my wedding in Google sheets. A custom GPT hits this API and all I have to do is message the GPT.
## Functions

### sheet-updater
Adds new expenses to the wedding budget Google Sheet.

- **Endpoint**: `/functions/v1/sheet-updater`
- **Method**: POST
- **Purpose**: Appends a new row to the "Expenses" sheet with expense details
- **Required Fields**:
  - expense (string)
  - date (string, YYYY-MM-DD)
  - amount (number)
  - category (string)
  - status (string)
- **Optional Fields**:
  - bill (string, URL)

## Setup

1. Create a Google Cloud Project and enable Google Sheets API
2. Create a service account and download credentials
3. Set environment variables in Supabase:
   ```bash
   supabase secrets set GOOGLE_SERVICE_ACCOUNT_EMAIL="your-email"
   supabase secrets set GOOGLE_PRIVATE_KEY="your-key"
   supabase secrets set SPREADSHEET_ID="your-sheet-id"
   ```

## Development

1. Start local Supabase instance:
   ```bash
   supabase start
   ```

2. Test locally:
   ```bash
   curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/sheet-updater' \
     --header 'Authorization: Bearer your-anon-key' \
     --header 'Content-Type: application/json' \
     --data '{
       "expense": "Wedding Cake",
       "date": "2024-03-20",
       "amount": 500,
       "category": "Food",
       "status": "Paid"
     }'
   ```

## Deployment

Deploy to production:
