import React, { useState } from 'react';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type Props = {
  sessionId: string;
  memoMarkdown?: string;
  templatePath?: string;
};

export default function DownloadMemoButton({ 
  sessionId, 
  memoMarkdown, 
  templatePath = 'memo_atad2.docx' 
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

      const docxData = parseResponse.data?.docx_data;
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
        linebreaks: true 
      });
      doc.setData(docxData);
      doc.render();
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