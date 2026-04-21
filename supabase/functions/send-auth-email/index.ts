import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { Resend } from "npm:resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY") as string);
const hookSecret = (Deno.env.get("SEND_EMAIL_HOOK_SECRET") as string).replace(/^v1,/, "");
const AUTH_API_URL = Deno.env.get("PUBLIC_SUPABASE_URL") || "https://api.atad2.tax";

const shellHeader = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:40px 20px;">
      <tr>
        <td align="center">
          <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
            <tr>
              <td style="padding:40px 48px 8px 48px;">
                <div style="font-size:13px;font-weight:600;letter-spacing:1.5px;color:#0f172a;text-transform:uppercase;">ATAD2 Advisor</div>
              </td>
            </tr>`;

const shellFooter = `
            <tr>
              <td style="padding:32px 48px 40px 48px;">
                <div style="border-top:1px solid #f1f5f9;padding-top:24px;">
                  <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">Svalner Atlas Advisors<br/>Stadhouderskade 1, 1054 ES Amsterdam</p>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

const codeEmail = (heading: string, intro: string, code: string) => `${shellHeader}
            <tr>
              <td style="padding:16px 48px 0 48px;">
                <h1 style="margin:0;font-size:22px;font-weight:600;color:#0f172a;line-height:1.3;">${heading}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 48px 0 48px;">
                <p style="margin:0;font-size:15px;line-height:1.6;color:#475569;">${intro}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 48px 0 48px;">
                <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:24px;text-align:center;">
                  <div style="font-size:12px;font-weight:500;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Verification code</div>
                  <div style="font-family:'SF Mono',Monaco,Menlo,Consolas,monospace;font-size:32px;font-weight:600;color:#0f172a;letter-spacing:10px;">${code}</div>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 48px 0 48px;">
                <p style="margin:0;font-size:13px;line-height:1.5;color:#94a3b8;">This code expires in 10 minutes. If you did not request this, you can safely ignore this email.</p>
              </td>
            </tr>${shellFooter}`;

const linkEmail = (heading: string, intro: string, buttonLabel: string, url: string) => `${shellHeader}
            <tr>
              <td style="padding:16px 48px 0 48px;">
                <h1 style="margin:0;font-size:22px;font-weight:600;color:#0f172a;line-height:1.3;">${heading}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 48px 0 48px;">
                <p style="margin:0;font-size:15px;line-height:1.6;color:#475569;">${intro}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 48px 0 48px;" align="center">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;">
                  <tr>
                    <td align="center" bgcolor="#0f172a" style="background-color:#0f172a;border-radius:8px;mso-padding-alt:16px 36px;">
                      <a href="${url}" style="display:inline-block;padding:16px 36px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;letter-spacing:0.2px;mso-padding-alt:0;border-radius:8px;">${buttonLabel}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 48px 0 48px;">
                <p style="margin:0;font-size:13px;line-height:1.5;color:#94a3b8;">Or copy this link into your browser:<br/><a href="${url}" style="color:#64748b;word-break:break-all;">${url}</a></p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 48px 0 48px;">
                <p style="margin:0;font-size:13px;line-height:1.5;color:#94a3b8;">This link expires in 1 hour. If you did not request this, you can safely ignore this email.</p>
              </td>
            </tr>${shellFooter}`;

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
    const { token, token_hash, redirect_to, email_action_type } = email_data;

    let subject = "";
    let html = "";

    if (email_action_type === "signup") {
      subject = "Your ATAD2 verification code";
      html = codeEmail(
        "Confirm your email",
        "Welcome. Please enter the verification code below to confirm your email address and continue to the ATAD2 Advisor.",
        token
      );
    } else if (email_action_type === "recovery") {
      const resetUrl = `${AUTH_API_URL}/auth/v1/verify?token=${token_hash}&type=recovery&redirect_to=${encodeURIComponent(redirect_to)}`;
      subject = "Reset your ATAD2 password";
      html = linkEmail(
        "Reset your password",
        "We received a request to reset the password for your ATAD2 Advisor account. Click the button below to choose a new password.",
        "Reset password",
        resetUrl
      );
    }

    const emailResponse = await resend.emails.send({
      from: "ATAD2 <noreply@atad2.tax>",
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
