// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { serve } from "https://deno.land/std@0.208.0/http/server.ts"

// Interface for the expense data
interface ExpenseData {
  expense: string;
  date: string;
  amount: number;
  category: string;
  status: string;
  bill?: string;
}

console.log("Sheet updater function initialized")

serve(async (req) => {
  const requestId = crypto.randomUUID()
  console.log(`[${requestId}] New request received`)
  
  try {
    const body = await req.json()
    console.log(`[${requestId}] Request body:`, JSON.stringify(body, null, 2))
    
    const { expense, date, amount, category, status, bill } = body as ExpenseData
    console.log(`[${requestId}] Parsed expense data:`, { expense, date, amount, category, status, bill })

    // Check environment variables first
    const clientEmail = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL")
    const privateKey = Deno.env.get("GOOGLE_PRIVATE_KEY")
    const spreadsheetId = Deno.env.get("SPREADSHEET_ID")

    if (!clientEmail || !privateKey || !spreadsheetId) {
      throw new Error(`Missing environment variables: ${[
        !clientEmail && "GOOGLE_SERVICE_ACCOUNT_EMAIL",
        !privateKey && "GOOGLE_PRIVATE_KEY",
        !spreadsheetId && "SPREADSHEET_ID",
      ].filter(Boolean).join(", ")}`)
    }

    // First, get an access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: await createJWT(
          clientEmail,
          privateKey.replace(/\\n/g, '\n')
        )
      })
    })

    const { access_token } = await tokenResponse.json()
    
    const values = [[expense, date, amount, category, status, bill || '']]
    console.log(`[${requestId}] Prepared values for sheet:`, values)

    console.log(`[${requestId}] Spreadsheet ID:`, spreadsheetId)
    
    console.log("Environment variables check:", {
      serviceEmail: Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
      hasPrivateKey: !!Deno.env.get("GOOGLE_PRIVATE_KEY"),
      spreadsheetId: Deno.env.get("SPREADSHEET_ID")
    })
    
    // Make request to Google Sheets API
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Expenses!A:F:append?valueInputOption=USER_ENTERED`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: values
        })
      }
    )

    const data = await response.json()
    console.log(`[${requestId}] API Response:`, JSON.stringify(data, null, 2))

    if (!response.ok) {
      throw new Error(`Google Sheets API error: ${data.error?.message || 'Unknown error'}`)
    }

    return new Response(
      JSON.stringify({ 
        message: "Expense added successfully",
        details: {
          updatedRange: data.updates?.updatedRange,
          updatedRows: data.updates?.updatedRows
        }
      }),
      { headers: { "Content-Type": "application/json" } },
    )

  } catch (error) {
    console.error(`[${requestId}] Error occurred:`, error)
    console.error(`[${requestId}] Error stack:`, error.stack)
    
    console.log(`[${requestId}] Environment variables check:`, {
      hasServiceEmail: !!Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
      hasPrivateKey: !!Deno.env.get("GOOGLE_PRIVATE_KEY"),
      hasSpreadsheetId: !!Deno.env.get("SPREADSHEET_ID")
    })

    return new Response(
      JSON.stringify({ 
        error: error.message,
        errorType: error.constructor.name,
        stack: error.stack
      }),
      { 
        headers: { "Content-Type": "application/json" },
        status: 400 
      },
    )
  }
})

// Helper function to create JWT token
async function createJWT(clientEmail: string, privateKey: string): Promise<string> {
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  }

  const now = Math.floor(Date.now() / 1000)
  const claim = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  }

  const encoder = new TextEncoder()
  const headerB64 = btoa(JSON.stringify(header))
  const claimB64 = btoa(JSON.stringify(claim))
  const message = `${headerB64}.${claimB64}`

  const keyData = privateKey.split('\n')
    .filter(line => !line.includes('BEGIN') && !line.includes('END'))
    .join('')
  
  const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0))
  const key = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    encoder.encode(message)
  )

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
  return `${message}.${signatureB64}`
}

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/hello-world' \
    --header 'Authorization: Bearer ' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
