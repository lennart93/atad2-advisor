import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Rocket, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";

interface EnhanceMemoButtonProps {
  sessionId: string;
  reportId: string;
  onEnhanced?: () => void;
}


const EnhanceMemoButton = ({ sessionId, reportId, onEnhanced }: EnhanceMemoButtonProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [enhancementInput, setEnhancementInput] = useState("");
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [hasEnhanced, setHasEnhanced] = useState(false);

  const handleEnhance = async () => {
    if (!enhancementInput.trim()) {
      toast.error("Error", {
        description: "Please describe what you want to improve",
      });
      return;
    }

    setIsEnhancing(true);
    
    try {
      // Call n8n webhook to enhance the memo
      const response = await fetch('https://lennartwilming.app.n8n.cloud/webhook/atad2/enhance-memo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId,
          report_id: reportId,
          enhancement_request: enhancementInput
        })
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      setHasEnhanced(true);
      setIsExpanded(false);
      setEnhancementInput("");
      
      toast.success("Success", {
        description: "Memorandum enhanced successfully",
      });

      onEnhanced?.();

    } catch (error) {
      console.error('Error enhancing memo:', error);
      toast.error("Error", {
        description: `Failed to enhance memorandum: ${error.message}`,
      });
    } finally {
      setIsEnhancing(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button
        onClick={() => setIsExpanded(!isExpanded)}
        disabled={isEnhancing || hasEnhanced}
        variant="outline"
        className="rounded-2xl shadow-sm hover:shadow-md transition-all min-w-[180px]"
      >
        <Rocket className="h-4 w-4 mr-2" />
        {hasEnhanced ? "Enhanced" : "Enhance"}
        {!hasEnhanced && (
          isExpanded ? (
            <ChevronUp className="h-4 w-4 ml-2" />
          ) : (
            <ChevronDown className="h-4 w-4 ml-2" />
          )
        )}
      </Button>

      {isExpanded && !hasEnhanced && (
        <Card className="border-primary/20 bg-background z-10">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Enhancement request</CardTitle>
            <CardDescription>
              Describe what you want to improve in the memorandum
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              placeholder="E.g., Add more details about the tax implications, improve the executive summary, clarify the technical assessment..."
              value={enhancementInput}
              onChange={(e) => setEnhancementInput(e.target.value)}
              rows={4}
              disabled={isEnhancing}
              className="resize-none"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setIsExpanded(false);
                  setEnhancementInput("");
                }}
                disabled={isEnhancing}
              >
                Cancel
              </Button>
              <Button
                onClick={handleEnhance}
                disabled={isEnhancing || !enhancementInput.trim()}
                className="bg-primary hover:bg-primary/90"
              >
                {isEnhancing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enhancing...
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4 mr-2" />
                    Enhance
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default EnhanceMemoButton;
