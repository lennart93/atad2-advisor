import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, RefreshCw, Loader2 } from "lucide-react";
import { Button, StatusPill } from "@/components/ds";
import { loadFactsheet, startFactsheetBuild } from "@/lib/factsheet/client";
import type { FactsheetPrewarmState } from "@/hooks/useFactsheetPrewarm";

/**
 * Minimal, read-only fact sheet panel for the documents step. Quiet by default
 * (hover-revealed rebuild, neutral chips); no editing in v1. The prewarm hook
 * owns generation + the progressive re-run; this panel only reads and offers a
 * manual Rebuild. Status colours use the existing StatusPill vocabulary.
 */
export function FactsheetPanel({
  sessionId,
  prewarm,
}: {
  sessionId: string;
  prewarm: FactsheetPrewarmState;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);

  const { data: fs } = useQuery({
    queryKey: ["session-factsheet", sessionId],
    queryFn: () => loadFactsheet(sessionId),
    // Refresh while anything is in flight so the panel tracks the prewarm.
    refetchInterval: prewarm.status === "complete" && !prewarm.rerun.active ? false : 4000,
  });

  const sheet = fs?.factsheet ?? null;
  const version = fs?.version ?? prewarm.version;

  const rebuild = async () => {
    setRebuilding(true);
    try {
      await startFactsheetBuild(sessionId);
      await qc.invalidateQueries({ queryKey: ["session-factsheet", sessionId] });
    } catch (e) {
      console.warn("[factsheet-panel] rebuild failed", (e as Error).message);
    } finally {
      setRebuilding(false);
    }
  };

  const { chip, label } = statusChip(prewarm, version, !!sheet);
  const stale = prewarm.status === "waiting_docs" && !!sheet;

  return (
    <div className="group rounded-ds-card border border-ds-hairline bg-ds-card">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center gap-2 text-left text-sm text-ds-ink"
        >
          {open ? <ChevronDown className="size-4 text-ds-ink-secondary" /> : <ChevronRight className="size-4 text-ds-ink-secondary" />}
          <span className="font-medium">Group fact sheet</span>
          <StatusPill status={chip}>{label}</StatusPill>
          {stale && <StatusPill status="insufficient">Out of date, rebuild</StatusPill>}
          {prewarm.rerun.active && (
            <span className="flex items-center gap-1.5 text-xs text-ds-ink-secondary">
              <Loader2 className="size-3 animate-spin" />
              Re-assessing with the dossier overview… {prewarm.rerun.done}/{prewarm.rerun.total}
            </span>
          )}
        </button>
        <Button
          variant="ghost"
          size="sm"
          onClick={rebuild}
          disabled={rebuilding || prewarm.status === "generating"}
          className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          <RefreshCw className={rebuilding ? "size-3.5 animate-spin" : "size-3.5"} />
          Rebuild
        </Button>
      </div>

      {open && (
        <div className="border-t border-ds-hairline px-3 py-3 text-sm">
          {!sheet ? (
            <p className="text-ds-ink-secondary">
              {prewarm.status === "error"
                ? `Fact sheet failed to build. ${fs?.error ?? ""}`
                : prewarm.status === "waiting_docs"
                  ? "Reading the documents…"
                  : "No fact sheet yet. It builds automatically once the documents are analysed."}
            </p>
          ) : (
            <FactsheetBody sheet={sheet} />
          )}
        </div>
      )}
    </div>
  );
}

function statusChip(
  prewarm: FactsheetPrewarmState,
  version: number,
  hasSheet: boolean,
): { chip: "complete" | "insufficient" | "neutral"; label: string } {
  if (prewarm.status === "error") return { chip: "insufficient", label: "Failed" };
  if (prewarm.status === "generating") return { chip: "neutral", label: "Building…" };
  if (prewarm.status === "waiting_docs") return { chip: "neutral", label: "Reading documents…" };
  if (hasSheet && version > 0) return { chip: "complete", label: `Ready · v${version}` };
  return { chip: "neutral", label: "Preparing…" };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ds-ink-secondary">{title}</div>
      {children}
    </div>
  );
}

function FactsheetBody({ sheet }: { sheet: NonNullable<Awaited<ReturnType<typeof loadFactsheet>>>["factsheet"] }) {
  if (!sheet) return null;
  const ext = sheet.financing?.external ?? [];
  const ic = sheet.financing?.intercompany ?? [];
  const negatives = sheet.pe_and_residence?.negatives ?? [];

  return (
    <div>
      {sheet.entities.length > 0 && (
        <Section title="Entities">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-ds-ink-secondary">
                <tr>
                  <th className="pb-1 pr-3 font-medium">Name</th>
                  <th className="pb-1 pr-3 font-medium">Aliases</th>
                  <th className="pb-1 pr-3 font-medium">TIN</th>
                  <th className="pb-1 pr-3 font-medium">Jur.</th>
                  <th className="pb-1 pr-3 font-medium">NL class.</th>
                  <th className="pb-1 font-medium">Related</th>
                </tr>
              </thead>
              <tbody className="align-top">
                {sheet.entities.map((e, i) => (
                  <tr key={i} className="border-t border-ds-hairline/60">
                    <td className="py-1 pr-3">{e.canonical_name || "—"}</td>
                    <td className="py-1 pr-3 text-ds-ink-secondary">{e.aliases.filter((a) => a && a !== e.canonical_name).join(", ") || "—"}</td>
                    <td className="py-1 pr-3 ds-tabular-nums">{e.tin || "—"}</td>
                    <td className="py-1 pr-3">{e.jurisdiction || "—"}</td>
                    <td className="py-1 pr-3">{e.nl_classification}</td>
                    <td className="py-1 text-ds-ink-secondary">{e.related_to_taxpayers?.is_related ? (e.related_to_taxpayers.basis ?? "yes") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {(ext.length > 0 || ic.length > 0) && (
        <Section title="Financing">
          <ul className="space-y-0.5 text-xs text-ds-ink">
            {ext.map((l, i) => (
              <li key={`e${i}`}>
                External: <span className="font-medium">{l.borrower || "?"}</span> from {l.lender || "unidentified lender"}
                {l.amount != null ? ` — ${l.ccy ?? ""} ${l.amount.toLocaleString("en-US")}` : ""}{l.rate ? `, ${l.rate}` : ""}
                {l.unusual_terms ? <span className="text-ds-amber-text"> · {l.unusual_terms}</span> : ""}
              </li>
            ))}
            {ic.map((l, i) => (
              <li key={`i${i}`}>
                Intercompany: {l.lender || "?"} → {l.borrower || "?"}
                {l.amount != null ? ` — ${l.ccy ?? ""} ${l.amount.toLocaleString("en-US")}` : ""}{l.rate ? `, ${l.rate}` : ""}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {sheet.flows.length > 0 && (
        <Section title="Flows">
          <ul className="space-y-0.5 text-xs text-ds-ink">
            {sheet.flows.map((f, i) => (
              <li key={i}>
                {f.payer || "?"} → {f.payee || "?"}: {f.type}
                {f.amount != null ? ` ${f.ccy ?? ""} ${f.amount.toLocaleString("en-US")}` : ""}
                {f.included_at_recipient ? ` · included at recipient: ${f.included_at_recipient.value}` : ""}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {negatives.length > 0 && (
        <Section title="Negatives (evidenced)">
          <ul className="space-y-0.5 text-xs text-ds-ink">
            {negatives.map((n, i) => <li key={i}>{n.claim}</li>)}
          </ul>
        </Section>
      )}

      {sheet.inconsistencies.length > 0 && (
        <Section title="Inconsistencies to verify">
          <ul className="space-y-0.5 text-xs text-ds-amber-text">
            {sheet.inconsistencies.map((c, i) => <li key={i}>{c.description}</li>)}
          </ul>
        </Section>
      )}

      {sheet.open_points.length > 0 && (
        <Section title="Open points">
          <ul className="space-y-0.5 text-xs text-ds-ink">
            {sheet.open_points.map((o, i) => (
              <li key={i}>{o.question}{o.suggested_addressee ? ` (${o.suggested_addressee})` : ""}</li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
