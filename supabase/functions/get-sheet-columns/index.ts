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

// Interface for standardized error responses
interface ErrorResponse {
  error: string;
  code: string;
}

console.log("Sheet updater function initialized")

serve(async (req) => {
  const requestId = crypto.randomUUID()
  console.log(`[${requestId}] New request received`)
  
  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('Missing or invalid authorization header')
    }

    // Get the Supabase client auth token
    const token = authHeader.replace('Bearer ', '')
    const supabaseAuth = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!supabaseAuth.ok) {
      throw new Error('Unauthorized')
    }
    
    // Check environment variables first
    const clientEmail = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL")
    const privateKey = Deno.env.get("GOOGLE_PRIVATE_KEY")
    const spreadsheetId = Deno.env.get("SPREADSHEET_ID")

    if (!clientEmail || !privateKey || !spreadsheetId) {
      throw new Error('Configuration error')
    }

    // Get access token (same as before)
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

    // Modified API request to get only the first row (headers)
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Expenses!1:1`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        }
      }
    )

    const data = await response.json()
    
    if (!response.ok) {
      throw new Error('Failed to fetch sheet data')
    }

    // Extract column names from the first row
    const columnNames = data.values?.[0] || []

    return new Response(
      JSON.stringify({ 
        columns: columnNames
      }),
      { headers: { "Content-Type": "application/json" } },
    )

  } catch (error) {
    console.error(`[${requestId}] Error occurred: ${error.message}`)

    // Standardized error response without sensitive details
    const errorResponse: ErrorResponse = {
      error: 'An error occurred while processing your request',
      code: error.message === 'Unauthorized' ? 'AUTH_ERROR' : 'INTERNAL_ERROR'
    }

    return new Response(
      JSON.stringify(errorResponse),
      { 
        headers: { "Content-Type": "application/json" },
        status: error.message === 'Unauthorized' ? 401 : 400
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
    // Use more restricted scope
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
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
