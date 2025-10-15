import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Rocket, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";

interface EnhanceMemoButtonProps {
  sessionId: string;
  reportId: string;
  onEnhanced?: () => void;
}

const EnhanceMemoButton = ({ sessionId, reportId, onEnhanced }: EnhanceMemoButtonProps) => {
  const [isOpen, setIsOpen] = useState(false);
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
      setIsOpen(false);
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
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          disabled={hasEnhanced || isEnhancing}
          variant="outline"
          className="rounded-2xl shadow-sm hover:shadow-md transition-all"
        >
          <Rocket className="h-4 w-4 mr-2" />
          {hasEnhanced ? "Memorandum enhanced" : "Enhance memorandum"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Enhance memorandum</DialogTitle>
          <DialogDescription>
            Describe what you want to improve in the memorandum
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Textarea
            placeholder="E.g., Add more details about the tax implications, improve the executive summary, clarify the technical assessment..."
            value={enhancementInput}
            onChange={(e) => setEnhancementInput(e.target.value)}
            rows={6}
            disabled={isEnhancing}
            className="resize-none"
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setIsOpen(false);
              setEnhancementInput("");
            }}
            disabled={isEnhancing}
          >
            Cancel
          </Button>
          <Button
            onClick={handleEnhance}
            disabled={isEnhancing || !enhancementInput.trim()}
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EnhanceMemoButton;
