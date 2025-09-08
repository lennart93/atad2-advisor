'use client';

import React, { useState } from 'react';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
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
};

export default function DownloadMemoButton({ 
  sessionId, 
  memoMarkdown, 
  templatePath = 'memo_atad2.docx',
  enabled = true
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

      // B) Parse to docx_data via edge function
      const parseResponse = await supabase.functions.invoke('parse-memo', {
        body: { 
          session_id: sessionId, 
          memo_markdown: memo 
        }
      });

      if (parseResponse.error) {
        throw new Error(`Parse service error: ${parseResponse.error.message}`);
      }

      const parseJson = parseResponse.data;
      const envelope = Array.isArray(parseJson) ? parseJson[0] : parseJson;
      const docxData = envelope?.docx_data;
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

      // D) Download template
      const templateResponse = await fetch(signedUrlData.signedUrl);
      if (!templateResponse.ok) {
        throw new Error('Template download failed');
      }
      const templateArrayBuffer = await templateResponse.arrayBuffer();

      // E) Render DOCX
      const zip = new PizZip(templateArrayBuffer);
      const doc = new Docxtemplater(zip, { 
        paragraphLoop: true, 
        linebreaks: true,
        delimiters: { start: '{{', end: '}}' },
        nullGetter: () => '', // Prevents literal 'undefined' in document
      });

      // AUDIT: Check template tags vs docxData (for debugging)
      console.group('DOCX TEMPLATE TAG AUDIT');
      console.log('DocxData structure:', JSON.stringify(docxData, null, 2));
      
      (function auditTemplate() {
        function deepHas(obj: any, path: string): boolean {
          try {
            const keys = path.split('.');
            let current = obj;
            for (let i = 0; i < keys.length; i++) {
              if (current && keys[i] in current) {
                current = current[keys[i]];
              } else {
                return false;
              }
            }
            return current !== undefined;
          } catch (e) {
            return false;
          }
        }

        try {
          const tags = (doc as any).getFullTags?.() ?? (doc as any).getTags?.() ?? [];
          console.log('Tags detected in template:', tags);

          const missing: string[] = [];
          const found: string[] = [];
          
          for (let i = 0; i < tags.length; i++) {
            const t = tags[i];
            const name = typeof t === 'string' ? t : (t?.raw || t?.name || '');
            if (!name) continue;

            // skip helpers zoals "." in loops
            if (name === '.' || name.startsWith('@')) continue;

            if (!deepHas(docxData, name)) {
              missing.push(name);
            } else {
              found.push(name);
            }
          }
          
          console.log('Found/valid paths:', found);
          console.log('Missing/undefined paths:', missing);
          
          if (missing.length) {
            console.warn('Template expects paths missing in docxData:', missing);
          }
        } catch (auditError) {
          console.log('Template audit failed, continuing without audit:', auditError);
        }
      })();
      console.groupEnd();

      doc.setData(docxData);
      
      try {
        doc.render();
      } catch (renderError: any) {
        console.error('Template render error:', renderError);
        console.error('Template properties:', renderError.properties);
        throw new Error(`Template render error: ${JSON.stringify({ 
          message: renderError?.message, 
          properties: renderError?.properties 
        }, null, 2)}`);
      }
      
      const blob = doc.getZip().generate({ type: 'blob' });

      // F) Download
      const nameSafe = (docxData.meta?.taxpayer_name || 'Taxpayer')
        .replace(/[^\w\-]+/g, '_');
      const fiscalYear = docxData.meta?.fiscal_year || '';
      const fileName = `ATAD2_Memo_${nameSafe}_${fiscalYear}.docx`;

      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(link.href);

      toast({
        title: "Success",
        description: "Word document downloaded successfully",
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
            <p>Memo nog niet beschikbaar</p>
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