import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { Resend } from "npm:resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY") as string);
const hookSecret = (Deno.env.get("SEND_EMAIL_HOOK_SECRET") as string).replace(/^v1,/, "");

// Svalner Atlas brand values (mirrors src/styles/tokens.css, light theme).
// Email clients need inline styles and solid colors, so the tokens are
// flattened to hex here.
const INK = "#16150f";
const INK_SECONDARY = "#57534a";
const PAPER = "#faf8f4";
const CARD = "#ffffff";
const HAIRLINE = "#e7e3da";
const TERRACOTTA = "#c25c3c";
const FONT_STACK =
  "'Neue Haas Grotesk Display Pro','Helvetica Neue',Helvetica,Arial,sans-serif";

const shellHeader = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:${PAPER};font-family:${FONT_STACK};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${PAPER};padding:40px 20px;">
      <tr>
        <td align="center">
          <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:${CARD};border:1px solid ${HAIRLINE};border-top:3px solid ${TERRACOTTA};border-radius:4px;">
            <tr>
              <td style="padding:40px 48px 0 48px;">
                <div style="font-size:15px;font-weight:500;letter-spacing:3px;color:${INK};text-transform:uppercase;">Svalner&nbsp;Atlas</div>
                <div style="font-size:11px;font-weight:400;letter-spacing:2px;color:${INK_SECONDARY};text-transform:uppercase;margin-top:6px;">ATAD2 risk assessment</div>
              </td>
            </tr>`;

const shellFooter = `
            <tr>
              <td style="padding:32px 48px 0 48px;">
                <div style="border-top:1px solid ${HAIRLINE};padding-top:20px;">
                  <p style="margin:0;font-size:12px;line-height:1.6;color:${INK_SECONDARY};">Svalner Atlas Advisors</p>
                  <p style="margin:4px 0 0 0;font-size:12px;line-height:1.6;color:${INK_SECONDARY};">This is an automated message from the ATAD2 Advisor.</p>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 48px 36px 48px;"></td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

const codeEmail = (heading: string, intro: string, code: string) => `${shellHeader}
            <tr>
              <td style="padding:32px 48px 0 48px;">
                <h1 style="margin:0;font-size:22px;font-weight:400;color:${INK};line-height:1.3;">${heading}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 48px 0 48px;">
                <p style="margin:0;font-size:15px;line-height:1.6;color:${INK_SECONDARY};">${intro}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 48px 0 48px;">
                <div style="background-color:${PAPER};border:1px solid ${HAIRLINE};border-radius:2px;padding:24px;text-align:center;">
                  <div style="font-size:11px;font-weight:500;color:${INK_SECONDARY};text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;">Verification code</div>
                  <div style="font-family:'SF Mono',Monaco,Menlo,Consolas,monospace;font-size:32px;font-weight:500;color:${INK};letter-spacing:10px;">${code}</div>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 48px 0 48px;">
                <p style="margin:0;font-size:13px;line-height:1.5;color:${INK_SECONDARY};">This code expires in 10 minutes. If you did not request this, you can safely ignore this email.</p>
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
    const { token, email_action_type } = email_data;

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
      // A one-time verify link gets consumed by corporate email link scanners
      // (Outlook Safe Links) before the user can click it, so send a code instead.
      subject = "Your ATAD2 password reset code";
      html = codeEmail(
        "Reset your password",
        "A password reset was requested for your ATAD2 Advisor account. Enter the code below on the reset page to choose a new password.",
        token
      );
    } else if (email_action_type === "email_change") {
      subject = "Confirm your new ATAD2 email address";
      html = codeEmail(
        "Confirm your new email address",
        "A change of email address was requested for your ATAD2 Advisor account. Enter the code below to confirm this address.",
        token
      );
    } else if (email_action_type === "magiclink") {
      subject = "Your ATAD2 sign-in code";
      html = codeEmail(
        "Sign in to the ATAD2 Advisor",
        "Enter the code below to sign in to your ATAD2 Advisor account.",
        token
      );
    } else {
      // Fallback for any other auth email (invite, reauthentication, ...):
      // never send an unbranded or empty email.
      subject = "Your ATAD2 verification code";
      html = codeEmail(
        "Verification code",
        "Enter the code below in the ATAD2 Advisor to continue.",
        token
      );
    }

    const emailResponse = await resend.emails.send({
      from: "Svalner Atlas ATAD2 <noreply@atad2.tax>",
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
