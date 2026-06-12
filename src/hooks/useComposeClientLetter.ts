import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  isNotDeployedMessage,
  type ComposedLetter,
  type ComposeQuestionItem,
} from "@/lib/openQuestions/composeLetter";

/**
 * The compose_client_letter action is not live on the VM yet: the deployed
 * index.ts answers "Unknown action: ..." or loadActivePrompt reports
 * "No active prompt ...". This error is caught by the calling letter block,
 * which handles display and messaging inline.
 */
export class ComposeNotDeployedError extends Error {}

/**
 * supabase-js wraps non-2xx edge responses in a FunctionsHttpError whose
 * .context is the raw fetch Response; the server message lives in the JSON
 * body's error field. Falls back to error.message when the body is missing
 * or not JSON.
 */
async function extractFunctionErrorMessage(error: unknown): Promise<string> {
  const err = error as { message?: string; context?: Response };
  let msg = err.message || "Letter composition failed";
  try {
    const body = await err.context?.clone().json();
    if (body?.error) msg = String(body.error);
  } catch {
    // Keep error.message.
  }
  return msg;
}

function classifyComposeError(msg: string): Error {
  return isNotDeployedMessage(msg)
    ? new ComposeNotDeployedError(msg)
    : new Error(msg);
}

/**
 * ONE compose call to the compose_client_letter edge action: the per-question
 * drafts go in, one merged letter comes out. The action writes nothing, so
 * there is nothing to invalidate; flips and audit events happen client-side
 * after a successful copy. No toasts here, the letter block handles messaging.
 */
export function useComposeClientLetter(sessionId: string) {
  return useMutation({
    mutationFn: async ({
      items,
      taxpayerName,
      fiscalYear,
    }: {
      items: ComposeQuestionItem[];
      taxpayerName: string;
      fiscalYear: string;
    }): Promise<ComposedLetter> => {
      const { data, error } = await supabase.functions.invoke(
        "prefill-documents",
        {
          body: {
            action: "compose_client_letter",
            session_id: sessionId,
            questions: items,
            taxpayer_name: taxpayerName,
            fiscal_year: fiscalYear,
          },
        },
      );
      if (error) {
        throw classifyComposeError(await extractFunctionErrorMessage(error));
      }
      const payload = data as {
        ok?: boolean;
        error?: string;
        letter?: ComposedLetter;
      } | null;
      if (payload?.ok === false) {
        throw classifyComposeError(
          String(payload.error ?? "Letter composition failed"),
        );
      }
      if (!payload?.letter) {
        throw new Error("The compose action returned no letter.");
      }
      return payload.letter;
    },
  });
}
