'use client';

import React, { useState } from 'react';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
// @ts-ignore - no TS types ship with docxtemplater-image-module-free
import ImageModule from 'docxtemplater-image';
import { captureChartPng } from '@/components/structure/exports/exportToPng';

// HTML to Docxtemplater inline formatting converter
function htmlToDocxFormatting(input: string): string {
  if (typeof input !== 'string') return input as any;
  // Onderstreping: <u>...</u> -> {u}...{/u}
  let out = input.replace(/<u>([\s\S]*?)<\/u>/gi, '{u}$1{/u}');

  // (optioneel, veilig & handig) extra's:
  // <i> / <em> -> {i}...{/i}
  out = out.replace(/<(i|em)>([\s\S]*?)<\/\1>/gi, '{i}$2{/i}');
  // <b> / <strong> -> {b}...{/b}
  out = out.replace(/<(b|strong)>([\s\S]*?)<\/\1>/gi, '{b}$2{/b}');
  // Verwijder overige kale HTML-tags (preventief)
  out = out.replace(/<\/?[^>]+>/g, '');
  return out;
}

// Dot-parser for handling nested object paths like "meta.taxpayer_name"
const dotParser = (tag: string) => ({
  get: (scope: any) => {
    const path = tag.trim();
    if (path === '.' || path === '') return scope;
    const value = path.split('.').reduce((obj, key) => (obj == null ? obj : obj[key]), scope);
    // Alleen strings transformeren
    if (typeof value === 'string') {
      return htmlToDocxFormatting(value);
    }
    // Arrays (bijv. bullets) element-voor-element transformeren
    if (Array.isArray(value)) {
      return value.map(v => (typeof v === 'string' ? htmlToDocxFormatting(v) : v));
    }
    return value;
  },
});
import { supabase } from '@/integrations/supabase/client';
import { loadAppendix } from '@/lib/appendix/client';
import { toAppendixSections } from '@/lib/appendix/appendixDocxSections';
import { loadAppendixSkeleton } from '@/lib/appendix/skeletonStore';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

type Props = {
  sessionId: string;
  memoMarkdown?: string;
  templatePath?: string;
  enabled?: boolean;
  disabled?: boolean;
  /** Whether to capture and embed the structure-chart PNG in the DOCX. Default true. */
  includeChart?: boolean;
};

export default function DownloadMemoButton({
  sessionId,
  memoMarkdown,
  templatePath = 'memo_atad2_with_structure_placeholder.docx',
  enabled = true,
  disabled = false,
  includeChart = true,
}: Props) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function handleDownload() {
    setLoading(true);
    
    try {
      // A) Get memo if not provided
      let memo = memoMarkdown;
      if (!memo) {
        const { data: reportData, error } = await supabase
          .from('atad2_reports')
          .select('report_md')
          .eq('session_id', sessionId)
          .is('archived_at', null)
          .order('generated_at', { ascending: false })
          .limit(1)
          .single();

        if (error || !reportData?.report_md) {
          throw new Error('Could not fetch memo');
        }
        memo = reportData.report_md;
      }

      // Get session to find user_id + meta (taxpayer + fiscal year), zodat we
      // de docxData kunnen aanvullen mocht de parser ze niet meegeven.
      const { data: sessionData } = await supabase
        .from('atad2_sessions')
        .select('user_id, taxpayer_name, fiscal_year')
        .eq('session_id', sessionId)
        .single();

      // Fetch user profile data
      let userFullName = '';
      let userFirstName = '';
      let userLastName = '';

      if (sessionData?.user_id) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('full_name, first_name, last_name')
          .eq('user_id', sessionData.user_id)
          .single();
        
        if (profileData) {
          userFullName = profileData.full_name || '';
          userFirstName = profileData.first_name || '';
          userLastName = profileData.last_name || '';
        }
      }

      // B) Parse to docx_data via n8n webhook (can take 2-5 min)
      const { data: { session: authSession } } = await supabase.auth.getSession();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6 * 60 * 1000); // 6 minutes

      let parseResponse: Response;
      try {
        parseResponse = await fetch(`${import.meta.env.VITE_N8N_WEBHOOK_BASE}/parse-memo`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
          body: JSON.stringify({
            session_id: sessionId,
            auth_token: authSession?.access_token,
            memo_markdown: memo,
            user_full_name: userFullName,
            user_first_name: userFirstName,
            user_last_name: userLastName
          })
        });
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          throw new Error('Generation took too long (>6 min). Please try again.');
        }
        throw err;
      }
      clearTimeout(timeoutId);

      if (!parseResponse.ok) {
        throw new Error(`Parse service error: ${parseResponse.status} ${parseResponse.statusText}`);
      }

      const parseJson = await parseResponse.json();
      const envelope = Array.isArray(parseJson) ? parseJson[0] : parseJson;
      let docxData = envelope?.docx_data;
      if (!docxData) {
        throw new Error('No docx_data returned from parser');
      }

      // Vul meta aan vanuit sessionData mocht de parser het hebben overgeslagen
      // of leeg gelaten. De template heeft taxpayer_name + fiscal_year nodig en
      // we hebben die zelf al in de DB.
      docxData.meta = docxData.meta ?? {};
      if (!docxData.meta.taxpayer_name && sessionData?.taxpayer_name) {
        docxData.meta.taxpayer_name = sessionData.taxpayer_name;
      }
      if (!docxData.meta.fiscal_year && sessionData?.fiscal_year != null) {
        docxData.meta.fiscal_year = String(sessionData.fiscal_year);
      }
      if (!docxData.meta.user_full_name && userFullName) {
        docxData.meta.user_full_name = userFullName;
      }
      if (!docxData.meta.today_long) {
        docxData.meta.today_long = new Date().toLocaleDateString('en-GB', {
          day: 'numeric', month: 'long', year: 'numeric',
        });
      }

      // C) Get signed URL for template
      const { data: signedUrlData, error: urlError } = await supabase
        .storage
        .from('templates')
        .createSignedUrl(templatePath, 60);

      if (urlError || !signedUrlData?.signedUrl) {
        throw new Error('Could not create signed URL for template');
      }

      console.log('Using templatePath:', templatePath, 'signed:', signedUrlData.signedUrl.slice(0, 80) + '...');

      // D) Download template
      const templateResponse = await fetch(signedUrlData.signedUrl);
      if (!templateResponse.ok) {
        throw new Error('Template download failed');
      }
      const templateArrayBuffer = await templateResponse.arrayBuffer();

      // E) Render DOCX using v4 API
      const zip = new PizZip(templateArrayBuffer);

      // 1x1 transparante PNG als fallback — voorkomt crash van de image-module
      // als er geen structure-chart snapshot beschikbaar is.
      const FALLBACK_PNG_BASE64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=';

      // Decodeer een base64 string naar Uint8Array. getImage moet binaire
      // image-bytes teruggeven aan de module (die ze dan in het docx-zip stopt).
      const base64ToBytes = (b64: string): Uint8Array => {
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return arr;
      };

      const imageModule = new ImageModule({
        centered: true,
        fileType: 'docx',
        getImage: (tagValue: unknown, tagName: string) => {
          console.log('[DownloadMemoButton] imageModule.getImage', {
            tagName,
            isString: typeof tagValue === 'string',
            stringLen: typeof tagValue === 'string' ? (tagValue as string).length : undefined,
          });
          if (typeof tagValue === 'string' && tagValue.length > 0) {
            return base64ToBytes(tagValue);
          }
          console.warn('[DownloadMemoButton] structureChart leeg/ongeldig — fallback PNG gebruikt');
          return base64ToBytes(FALLBACK_PNG_BASE64);
        },
        getSize: () => [600, 360],
      });

      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: '{{', end: '}}' }, // onze .docx gebruikt {{ }}
        nullGetter: () => '', // voorkom letterlijk "undefined" in output
        parser: dotParser, // ← BELANGRIJK voor nested paths
        modules: [imageModule],
      });

      // ---- TAG AUDIT (laten staan voor nu) ----
      const allTags = (doc as any).getFullTags?.() ?? (doc as any).getTags?.();
      console.group('DOCX TEMPLATE TAG AUDIT');
      console.log('DocxData structure:', docxData);
      console.log('Tags detected in template:', JSON.stringify(allTags, null, 2));
      console.groupEnd();
      // ----------------------------------------

      // Guard: alleen de meta-velden zijn echt vereist (voor de bestandsnaam).
      // De template heeft `nullGetter: () => ''` (zie hierboven), dus ontbrekende
      // sectie-keys leveren netjes een lege string op — geen reden om de download
      // te blokkeren. Loggen we wel zodat we het zien als het structureel is.
      function hasPath(o: any, p: string) {
        return p.split('.').reduce((v, k) => (v != null ? v[k] : undefined), o) !== undefined;
      }
      const requiredMeta = ['meta.taxpayer_name', 'meta.fiscal_year'];
      const missingMeta = requiredMeta.filter((k) => {
        const v = k.split('.').reduce((o: any, kk) => (o != null ? o[kk] : undefined), docxData);
        return v === undefined || v === null || v === '';
      });
      if (missingMeta.length) {
        throw new Error('docxData missing required meta keys: ' + missingMeta.join(', '));
      }

      // Informatieve log: welke sectie-tags in het template ontbreken in de data?
      const templateSectionTags = [
        'sections.introduction',
        'sections.risk_outcome_line',
        'sections.executive_summary_intro',
        'sections.executive_summary_bullets',
        'sections.general_background_intro',
        'sections.general_background_bullets',
        'sections.technical_assessment',
        'sections.conclusion_intro',
        'sections.conclusion_next_steps_bullets',
      ];
      const missingSections = templateSectionTags.filter((k) => !hasPath(docxData, k));
      if (missingSections.length) {
        console.warn('[DownloadMemoButton] template tags zonder data (worden leeg):', missingSections);
      }

      console.group('DOCX RENDER DIAG');
      console.log('docxData at render():', JSON.stringify(docxData, null, 2));

      // Toggle deze in de console: window.__forceTestData = true
      // Hiermee sluiten we uit dat de template of rendering stuk is.
      if ((window as any).__forceTestData) {
        docxData = {
          meta: { taxpayer_name: 'TestCo BV', fiscal_year: '2024' },
          sections: {
            introduction: 'Intro text\nLine 2',
            risk_outcome_line: 'Low risk',
            executive_summary_bullets: ['Point A', 'Point B'],
            general_background: 'Background…',
            technical_assessment: 'Assessment…',
            conclusion_next_steps: 'Next steps…',
          },
        };
        console.warn('Using __forceTestData for render()');
      }

      // Haal de opgeslagen structure-chart PNG uit de DB. Op de report-pagina
      // is er geen live react-flow meer; de chart is bij finalize als
      // transparant PNG opgeslagen in atad2_structure_charts.snapshot_png.
      // Fallback: als er geen snapshot is, probeer alsnog een live capture
      // (zou normaal niet gebeuren, maar voorkomt dat de download faalt).
      // Belangrijk: de image-module ziet objecten (zoals Uint8Array) als
      // 'al gerenderd' en probeert tagValue.rId/sizePixel te lezen — dat crasht.
      // We geven daarom een base64 STRING door als tagValue, en decoden die in
      // getImage naar bytes.
      let structureChartBase64: string | null = null;
      if (includeChart) {
        try {
          const { data: chartRow, error: chartErr } = await supabase
            .from('atad2_structure_charts')
            .select('snapshot_png')
            .eq('session_id', sessionId)
            .maybeSingle();
          if (chartErr) {
            console.warn('[DownloadMemoButton] chart query error', chartErr);
          }
          const pngDataUrl = chartRow?.snapshot_png;
          console.log('[DownloadMemoButton] snapshot in DB?',
            pngDataUrl ? `yes, ${pngDataUrl.length} chars` : 'no');
          if (pngDataUrl && pngDataUrl.startsWith('data:image/png;base64,')) {
            structureChartBase64 = pngDataUrl.slice('data:image/png;base64,'.length);
            console.log('[DownloadMemoButton] snapshot base64 length:', structureChartBase64.length);
          } else {
            console.log('[DownloadMemoButton] geen DB-snapshot, probeer live capture');
            const chartBlob = await captureChartPng();
            const arrayBuf = await chartBlob.arrayBuffer();
            let binStr = '';
            const bytes = new Uint8Array(arrayBuf);
            for (let i = 0; i < bytes.length; i++) binStr += String.fromCharCode(bytes[i]);
            structureChartBase64 = btoa(binStr);
            console.log('[DownloadMemoButton] live capture base64 length:', structureChartBase64.length);
          }
        } catch (e) {
          console.warn('Structure chart capture failed; memo will be generated without chart', e);
        }
      }

      try {
        // ✅ v4 API: data direct meegeven.
        // hasStructureChart drijft de `{{#hasStructureChart}}...{{/hasStructureChart}}`
        // sectie in de template. Wanneer false, valt de hele Corporate
        // structure overview-sectie weg (heading + image-placeholder + lege
        // paragraaf), zodat een memo zonder chart geen lege chart-regel toont.
        const hasStructureChart = !!structureChartBase64;

        // Confirmed technical appendix -> native Word tables (Reference column dropped).
        // A checklist page that the advisor explicitly skipped stays out of the
        // export (matches the UI promise and mirrors the memo narrative path in
        // appendixMemoBlock). Facts are not rendered in the DOCX at all, so
        // facts_skipped has no effect here.
        let appendixSections: ReturnType<typeof toAppendixSections> = [];
        try {
          const [appendix, appendixSkeleton] = await Promise.all([loadAppendix(sessionId), loadAppendixSkeleton()]);
          if (appendix && appendix.review_status === 'confirmed' && !appendix.checklist_skipped) {
            appendixSections = toAppendixSections(appendix.rows, appendixSkeleton);
          }
        } catch (e) {
          console.warn('[DownloadMemoButton] loadAppendix failed, exporting without appendix', e);
        }

        doc.render({
          ...docxData,
          structureChart: structureChartBase64 ?? '',
          hasStructureChart,
          appendixSections,
        });
        console.log('Render OK, hasStructureChart:', hasStructureChart);
      } catch (err: any) {
        console.error('Render ERR properties:', err?.properties);
        console.groupEnd();
        throw new Error(
          'Template render error: ' + JSON.stringify({ message: err?.message, properties: err?.properties }, null, 2),
        );
      }
      console.groupEnd();

      const blob = doc.getZip().generate({ type: 'blob' });

      const nameSafe = (docxData?.meta?.taxpayer_name || 'Taxpayer').replace(/[^\w\-]+/g, '_');
      const fy = docxData?.meta?.fiscal_year || '';
      const fileName = `ATAD2_Memo_${nameSafe}_${fy}.docx`;

      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);

      toast({
        title: "Downloaded",
        description: "Word document downloaded successfully.",
      });

    } catch (error: any) {
      console.error('Download error:', error);
      toast({
        title: "Error",
        description: error?.message || 'Failed to download Word document',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  if (!enabled) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <Button
                disabled={true}
                variant="outline"
                className="flex items-center gap-2 opacity-50 cursor-not-allowed"
              >
                <Download className="h-4 w-4" />
                Download Word (.docx)
              </Button>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Memo not yet available</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (disabled) {
    return (
      <Button
        disabled
        variant="outline"
        className="flex items-center gap-2"
      >
        <Download className="h-4 w-4" />
        Download Word (.docx)
      </Button>
    );
  }

  return (
    <Button
      onClick={handleDownload}
      disabled={loading}
      variant="outline"
      className="flex items-center gap-2 transition-all duration-fast"
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Generating Word…
        </>
      ) : (
        <>
          <Download className="h-4 w-4" />
          Download Word (.docx)
        </>
      )}
    </Button>
  );
}