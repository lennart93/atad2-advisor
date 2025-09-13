import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { Resend } from "npm:resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY") as string);
const hookSecret = Deno.env.get("SEND_EMAIL_HOOK_SECRET") as string;

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  console.log("Webhook received");

  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);
  const wh = new Webhook(hookSecret);

  try {
    const data = wh.verify(payload, headers) as any;
    console.log("Webhook verified:", data);

    const { user, email_data } = data;
    const { token, token_hash, redirect_to, email_action_type, site_url } = email_data;

    let subject = "";
    let html = "";

    if (email_action_type === "signup") {
      subject = "Bevestig je e-mailadres";
      const confirmUrl = `${site_url}/auth/confirm?token_hash=${token_hash}&type=email&redirect_to=${redirect_to}`;
      
      html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333; text-align: center;">Welkom!</h2>
          <p style="color: #555; font-size: 16px;">
            Bedankt voor je registratie. Klik op de onderstaande knop om je e-mailadres te bevestigen:
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${confirmUrl}" 
               style="background-color: #4F46E5; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 8px; display: inline-block;
                      font-weight: bold;">
              E-mail bevestigen
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">
            Of kopieer deze link naar je browser: <br>
            <a href="${confirmUrl}" style="color: #4F46E5; word-break: break-all;">${confirmUrl}</a>
          </p>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">
            Als je dit niet hebt aangevraagd, kun je deze e-mail negeren.
          </p>
        </div>
      `;
    } else if (email_action_type === "recovery") {
      subject = "Reset je wachtwoord";
      const resetUrl = `${site_url}/auth/reset-password?token_hash=${token_hash}&type=recovery&redirect_to=${redirect_to}`;
      
      html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333; text-align: center;">Wachtwoord resetten</h2>
          <p style="color: #555; font-size: 16px;">
            Je hebt een verzoek gedaan om je wachtwoord te resetten. Klik op de onderstaande knop:
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background-color: #EF4444; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 8px; display: inline-block;
                      font-weight: bold;">
              Wachtwoord resetten
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">
            Of kopieer deze link naar je browser: <br>
            <a href="${resetUrl}" style="color: #EF4444; word-break: break-all;">${resetUrl}</a>
          </p>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">
            Als je dit niet hebt aangevraagd, kun je deze e-mail negeren.
          </p>
        </div>
      `;
    }

    const emailResponse = await resend.emails.send({
      from: "Auth <onboarding@resend.dev>", // Pas dit aan naar je geverifieerde domein
      to: [user.email],
      subject: subject,
      html: html,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in send-auth-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});