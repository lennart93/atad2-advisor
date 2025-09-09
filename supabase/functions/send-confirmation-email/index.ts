import React from 'npm:react@18.3.1'
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0'
import { Resend } from 'npm:resend@4.0.0'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { EmailConfirmationTemplate } from './_templates/email-confirmation.tsx'

const resend = new Resend(Deno.env.get('RESEND_API_KEY') as string)
const hookSecret = Deno.env.get('SEND_EMAIL_HOOK_SECRET') as string

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405,
      headers: corsHeaders 
    })
  }

  try {
    const payload = await req.text()
    const headers = Object.fromEntries(req.headers)
    const wh = new Webhook(hookSecret)
    
    const {
      user,
      email_data: { token_hash, redirect_to, email_action_type },
    } = wh.verify(payload, headers) as {
      user: {
        email: string
      }
      email_data: {
        token_hash: string
        redirect_to: string
        email_action_type: string
      }
    }

    // Only handle signup confirmations
    if (email_action_type !== 'signup') {
      return new Response('Not a signup confirmation', { 
        status: 400,
        headers: corsHeaders 
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const confirmationUrl = `${supabaseUrl}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${redirect_to}`

    const html = await renderAsync(
      React.createElement(EmailConfirmationTemplate, {
        confirmationUrl,
        userEmail: user.email,
      })
    )

    const { error } = await resend.emails.send({
      from: 'ATAD2 <noreply@resend.dev>', // Vervang dit met je eigen domein
      to: [user.email],
      subject: 'Bevestig je ATAD2 account',
      html,
    })

    if (error) {
      console.error('Resend error:', error)
      throw error
    }

    console.log('Confirmation email sent successfully to:', user.email)

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    })

  } catch (error) {
    console.error('Error in send-confirmation-email function:', error)
    
    return new Response(
      JSON.stringify({
        error: {
          message: error.message,
        },
      }),
      {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        },
      }
    )
  }
})