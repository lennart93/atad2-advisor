import { AnimatedLogo } from "@/components/AnimatedLogo";
import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import { Shot } from "./Shot";
import type { Chapter } from "./types";

function LiveOnlyPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex w-full items-center gap-4 rounded-xl border border-dashed border-[hsl(var(--border-default))] bg-muted/30 px-6 py-5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[hsl(var(--border-default))] bg-background text-foreground">
        <Lock className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10.5px] font-normal uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </div>
        <p className="mt-0.5 text-[13px] leading-relaxed text-foreground/80">
          The live screen here is only shown in a real, completed assessment of your own. The tour
          doesn’t mock it, to avoid showing fictional outcomes.
        </p>
      </div>
    </div>
  );
}

const HERO = (
  <div className="relative flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-xl border border-[hsl(var(--border-default))] bg-gradient-to-br from-muted/40 via-background to-muted/30">
    <div
      className="pointer-events-none absolute inset-0 opacity-[0.04]"
      style={{
        backgroundImage:
          "linear-gradient(to right, hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--foreground)) 1px, transparent 1px)",
        backgroundSize: "32px 32px",
      }}
    />
    <div className="relative z-10 flex flex-col items-center gap-6 text-center">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.2, 0, 0, 1] }}
      >
        <AnimatedLogo size={88} state="idle" interactive={false} />
      </motion.div>
      <motion.div
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.2, 0, 0, 1], delay: 0.1 }}
        className="flex flex-col gap-3"
      >
        <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">A guided tour</div>
        <h2 className="text-3xl font-normal tracking-tight">ATAD2 Advisor</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          From intake to memo in six confident steps. This tour shows every screen of the live app
          so you can run a full ATAD2 risk assessment with zero guesswork.
        </p>
      </motion.div>
    </div>
  </div>
);

const SHOT = "/tutorial/screens";

export const CHAPTERS: Chapter[] = [
  // ──────────────────────────────────────────────────────────────────
  {
    id: "welcome",
    title: "Welcome",
    teaser: "What this app does — and what you’ll learn here.",
    intro:
      "ATAD2 Advisor walks you from raw documents to a signed-off risk memo in six steps. " +
      "This tour follows the same journey, with real screenshots of every screen.",
    steps: [
      {
        heading: "About this tour",
        caption: [
          "This tour goes through the app in the same order you’d use it: sign in, start an assessment, upload documents, answer questions, confirm an outcome, map the structure, and read the memo.",
          "Each chapter is short. Use the chapter list on the left, or the arrows below, to move at your own pace. Press Esc any time to return home.",
        ],
        bullets: [
          "Roughly 5 minutes end-to-end",
          "All taxpayer and entity names shown are fictitious — “Atlas Holdings B.V.” is not a real client",
          "Nothing you do in this tour changes your real assessments",
        ],
        visual: HERO,
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────
  {
    id: "auth",
    title: "Sign in",
    teaser: "Your account and how the workspace opens.",
    intro:
      "ATAD2 Advisor is gated to Svalner Atlas accounts. You sign in with your work email; the @svalneratlas.com part is filled in for you.",
    steps: [
      {
        heading: "Sign in or sign up",
        caption:
          "Use the Sign in tab if you already have an account. New colleagues use Sign up. You only enter the part before @ — the domain is fixed.",
        bullets: [
          "Email prefix only — @svalneratlas.com is appended for you",
          "Forgot your password? Tap the link below the form to receive a reset link",
          "New accounts require an email verification step (one-time code) before access",
        ],
        visual: <Shot src={`${SHOT}/01-auth.png`} url="app.atad2.tax/auth" alt="The Sign in screen" />,
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────
  {
    id: "dashboard",
    title: "Dashboard",
    teaser: "Your home base — start work, resume work, find work.",
    intro:
      "After signing in you land on the dashboard. Everything else in the app starts from one of three cards: start something new, take this tour, or resume one of your previous assessments.",
    steps: [
      {
        heading: "Three sections, one home",
        caption:
          "The Get started card launches a fresh assessment. The Tutorial card opens this very tour. The History section lists everything you’ve already started, with a status, a date, and a single action.",
        bullets: [
          "Each assessment belongs to one taxpayer and one or more fiscal years; you can have many open at once",
          "Resume picks up at the exact step you left off",
          "The trash icon deletes everything for that assessment, after a confirmation",
        ],
        visual: <Shot src={`${SHOT}/02-dashboard.png`} url="app.atad2.tax/" alt="The dashboard with start, tutorial, and history sections" />,
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────
  {
    id: "intake",
    title: "Start an assessment",
    teaser: "Step 1 of 6: taxpayer and fiscal years.",
    intro:
      "Every assessment starts with two facts: who it’s for, and which fiscal years you’re assessing. Keep it short. The app fills in everything else from the documents you upload next.",
    steps: [
      {
        heading: "Taxpayer and fiscal years",
        caption:
          "Enter the legal taxpayer name and select one or more fiscal years. They are assessed together in this one assessment. If the period doesn’t match the calendar year, tick the checkbox to reveal one shared start and end date.",
        bullets: [
          "Use the legal name; it appears in the final memo",
          "Select every year you want covered by this assessment, not today’s year",
          "You can reopen the session later to review it",
        ],
        visual: <Shot src={`${SHOT}/03-intake-filled.png`} url="app.atad2.tax/assessment" alt="Start risk assessment form with taxpayer name and tax year filled in" />,
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────
  {
    id: "upload",
    title: "Upload documents",
    teaser: "Step 2 of 6 — let the AI read the source materials.",
    intro:
      "Documents are the fuel. The more relevant material you drop in, the more answers and entities the app can prefill for you. Nothing is uploaded outside your workspace.",
    steps: [
      {
        heading: "Drop, paste, or skip",
        caption:
          "Drag files into the zone (or click Upload files). Need to paste in a piece of text instead of uploading a file? Use Paste text. You can also Skip and answer everything by hand.",
        bullets: [
          "Supported: PDF, images (PNG/JPG/WEBP), Word, PowerPoint, Excel, text/CSV/Markdown",
          "Max 15 MB per file, 100 MB per session",
          "Documents are used only for pre-fill extraction, never for AI training, and stay with the assessment after the report is generated",
        ],
        visual: <Shot src={`${SHOT}/04-upload-empty.png`} url="app.atad2.tax/assessment/upload" alt="Empty document upload screen with dropzone, Upload files and Paste text" />,
      },
      {
        heading: "Skipping the upload",
        caption:
          "If you choose to skip without uploading anything, the app warns you. Uploaded documents significantly reduce the time you spend on the questionnaire — so the skip path is a deliberate choice, not a misclick.",
        visual: <Shot src={`${SHOT}/04-upload-skip-confirm.png`} url="app.atad2.tax/assessment/upload" alt="Confirmation dialog asking whether to skip without uploading documents" />,
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────
  {
    id: "questions",
    title: "Answer the questions",
    teaser: "Step 3 of 6 — the heart of the assessment.",
    intro:
      "You’ll see one question at a time, grouped by topic on the left. For each one you pick Yes, No, or Unknown. Where the AI is confident based on the documents, it suggests an answer for you.",
    steps: [
      {
        heading: "One question at a time",
        caption:
          "The left panel shows your overall progress and the categories of questions. The centre is the active question with three answer options — Yes (green check), No (red cross), Unknown (blue question mark).",
        bullets: [
          "Picking Unknown never raises your risk score on its own — it just flags that more information is needed",
          "The Previous button at the bottom lets you revise any earlier answer",
          "Questions are grouped into topics so you always know roughly where you are",
        ],
        visual: <Shot src={`${SHOT}/05-questions.png`} url="app.atad2.tax/assessment" alt="A single question with three answer options: Yes, No, Unknown" />,
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────
  {
    id: "outcome",
    title: "Confirm the outcome",
    teaser: "Step 4 of 6 — accept or override.",
    intro:
      "Before the memo is written, you sign off on the headline outcome. The app proposes one based on your answers — you decide whether to accept it or replace it with your own reasoning.",
    steps: [
      {
        heading: "Two paths",
        caption: [
          "Accept moves you straight on. Override asks for a paragraph of reasoning and lets you pick a different outcome. Both paths are recorded.",
          "An override always wins over the AI in the memo and the admin analytics.",
        ],
        bullets: [
          "The outcome and score are derived from your answers — not from documents you didn’t reference",
          "You can revisit and change this until the memo is generated",
        ],
        visual: <LiveOnlyPlaceholder label="Step 4 — Confirmation" />,
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────
  {
    id: "structure",
    title: "Map the structure",
    teaser: "Step 5 of 6 — the ownership chart.",
    intro:
      "Most groups have a structure that matters for the assessment. The app extracts an initial chart from the documents you uploaded; you refine it visually until it’s correct.",
    steps: [
      {
        heading: "Auto-extracted, then refined",
        caption:
          "On first load you’ll see a banner: the AI built a starting chart from your documents and is still checking whether the Q&A answers need adjustments. Verify the names, jurisdictions, and ownership percentages — correct anything that’s off.",
        bullets: [
          "Add new entities from the Entity button (top-left)",
          "Auto-arrange and Collapse non-relevant in the toolbar at the bottom",
          "When you’re done, Save structure chart and continue moves to the final overview; Continue without structure chart leaves it as-is",
        ],
        visual: <Shot src={`${SHOT}/06-structure.png`} url="app.atad2.tax/assessment/structure" alt="The interactive structure chart showing the ownership tree of a fictitious Atlas group" />,
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────
  {
    id: "memo",
    title: "Read & download the memo",
    teaser: "Step 6 of 6 — the deliverable.",
    intro:
      "Once you confirm the outcome, the memo writes itself. You read it on screen, send a round of feedback to refine it if needed, and download a polished DOCX with the structure chart embedded.",
    steps: [
      {
        heading: "Memo, summary, download",
        caption: [
          "The full memo renders in the main column. The side rail has the download button, a quick summary of the outcome, and a button to open the feedback editor.",
          "DOCX download embeds your latest structure chart as a PNG. Feedback runs through the AI again and produces a revised version, with a diff view between revisions.",
        ],
        visual: <LiveOnlyPlaceholder label="Step 6 — Overview / memo" />,
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────
  {
    id: "feedback",
    title: "Send feedback",
    teaser: "A bug, an idea, a question — one click from anywhere.",
    intro:
      "The small Feedback button in the bottom-left corner follows you across the entire app. Use it whenever something feels off, missing or unclear.",
    steps: [
      {
        heading: "Pick a type and tell us",
        caption:
          "Click Feedback to open the dialog. Pick a type (Idea, Bug, Question, Other), write a short note, send. Your message goes to the admin inbox where it’s triaged.",
        bullets: [
          "Up to 5,000 characters per message",
          "Page URL is recorded automatically — screenshots aren’t always needed",
          "You’ll see a confirmation toast when it’s sent",
        ],
        visual: <Shot src={`${SHOT}/07-feedback.png`} url="app.atad2.tax/" alt="The Send feedback dialog with type, message, and send button" />,
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────
  {
    id: "admin",
    title: "Admin overview",
    teaser: "For admins and moderators only.",
    intro:
      "If you have admin or moderator access, the Admin button in the header opens a workspace for managing the questionnaire, users, prompts, and incoming feedback.",
    steps: [
      {
        heading: "What lives behind the Admin button",
        caption:
          "The admin area has its own side-nav. The top of the dashboard shows key metrics for the selected period; the Shortcuts row gives you one-click access to each section.",
        bullets: [
          "Questions and Context questions — the source of truth for the entire questionnaire",
          "Sessions and Users — operational management, with the Audit Log to back every change",
          "Prompts and Pre-Fill Jobs — tune what the AI does and monitor every run",
          "Feedback — triage messages sent from the floating Feedback button",
        ],
        visual: <Shot src={`${SHOT}/admin-dashboard.png`} url="app.atad2.tax/admin" alt="The admin Dashboard with KPI cards and shortcut tiles" />,
      },
    ],
  },
];
