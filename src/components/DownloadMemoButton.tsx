'use client';

import React, { useState } from 'react';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

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
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

type Props = {
  sessionId: string;
  memoMarkdown?: string;
  templatePath?: string;
  enabled?: boolean;
  disabled?: boolean;
};

export default function DownloadMemoButton({ 
  sessionId, 
  memoMarkdown, 
  templatePath = 'memo_atad2.docx',
  enabled = true,
  disabled = false
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
          .order('generated_at', { ascending: false })
          .limit(1)
          .single();

        if (error || !reportData?.report_md) {
          throw new Error('Could not fetch memo');
        }
        memo = reportData.report_md;
      }

      // Get session to find user_id
      const { data: sessionData } = await supabase
        .from('atad2_sessions')
        .select('user_id')
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

      // B) Parse to docx_data via edge function
      const parseResponse = await supabase.functions.invoke('parse-memo', {
        body: { 
          session_id: sessionId, 
          memo_markdown: memo,
          user_full_name: userFullName,
          user_first_name: userFirstName,
          user_last_name: userLastName
        }
      });

      if (parseResponse.error) {
        throw new Error(`Parse service error: ${parseResponse.error.message}`);
      }

      const parseJson = parseResponse.data;
      const envelope = Array.isArray(parseJson) ? parseJson[0] : parseJson;
      let docxData = envelope?.docx_data;
      if (!docxData) {
        throw new Error('No docx_data returned from parser');
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
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: '{{', end: '}}' }, // onze .docx gebruikt {{ }}
        nullGetter: () => '', // voorkom letterlijk "undefined" in output
        parser: dotParser, // ← BELANGRIJK voor nested paths
      });

      // ---- TAG AUDIT (laten staan voor nu) ----
      const allTags = (doc as any).getFullTags?.() ?? (doc as any).getTags?.();
      console.group('DOCX TEMPLATE TAG AUDIT');
      console.log('DocxData structure:', docxData);
      console.log('Tags detected in template:', JSON.stringify(allTags, null, 2));
      console.groupEnd();
      // ----------------------------------------

      // Guard: vereiste velden checken en duidelijke error tonen
      function hasPath(o: any, p: string) {
        return p.split('.').reduce((v, k) => (v != null ? v[k] : undefined), o) !== undefined;
      }
      const required = [
        'meta.taxpayer_name',
        'meta.fiscal_year',
        'sections.introduction',
        'sections.general_background',
        'sections.technical_assessment',
        'sections.conclusion_next_steps',
      ];
      // log missende paden
      const missing = required.filter((k) => !hasPath(docxData, k) || docxData?.meta?.taxpayer_name === '');
      console.log('Missing/empty required keys:', missing);
      if (missing.length) {
        throw new Error('docxData missing required keys: ' + missing.join(', '));
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

      try {
        // ✅ v4 API: data direct meegeven
        doc.render(docxData);
        console.log('Render OK');
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

      // Record the download timestamp to start the 24-hour countdown
      await supabase
        .from('atad2_sessions')
        .update({ docx_downloaded_at: new Date().toISOString() })
        .eq('session_id', sessionId);

      toast({
        title: "Success",
        description: "Word document downloaded successfully. This assessment will be automatically deleted in 24 hours.",
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
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <Button
                disabled
                variant="outline"
                className="flex items-center gap-2 opacity-50"
              >
                <Download className="h-4 w-4" />
                Download Word (.docx)
              </Button>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Wait for feedback to be applied</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Button
      onClick={handleDownload}
      disabled={loading}
      variant="outline"
      className="flex items-center gap-2"
    >
      <Download className="h-4 w-4" />
      {loading ? 'Generating...' : 'Download Word (.docx)'}
    </Button>
  );
}