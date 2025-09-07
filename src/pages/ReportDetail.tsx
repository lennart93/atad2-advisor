import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Seo } from "@/components/Seo";
import { useToast } from "@/hooks/use-toast";
import { Download, ArrowLeft, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

const ReportDetail = () => {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: report, isLoading, error } = useQuery({
    queryKey: ["report", reportId],
    queryFn: async () => {
      if (!reportId || !user) return null;
      
      const { data, error } = await supabase
        .from("atad2_reports")
        .select("*")
        .eq("id", reportId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!reportId && !!user,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!reportId) throw new Error("No report ID");
      
      const { error } = await supabase
        .from("atad2_reports")
        .delete()
        .eq("id", reportId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Rapport verwijderd" });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      navigate("/");
    },
    onError: (error) => {
      toast({
        title: "Fout bij verwijderen",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDownload = () => {
    if (!report) return;
    
    const blob = new Blob([report.report_md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.report_title || 'ATAD2-rapport'}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("nl-NL", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!user) {
    navigate("/auth");
    return null;
  }

  if (isLoading) {
    return (
      <main className="container mx-auto px-4 py-8">
        <Skeleton className="h-8 w-48 mb-6" />
        <Card className="p-6">
          <Skeleton className="h-6 w-64 mb-4" />
          <Skeleton className="h-4 w-32 mb-6" />
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </Card>
      </main>
    );
  }

  if (error || !report) {
    return (
      <main className="container mx-auto px-4 py-8">
        <Seo 
          title="Rapport niet gevonden" 
          description="Het opgevraagde rapport kon niet worden gevonden"
          canonical={`/report/${reportId}`}
        />
        <div className="text-center py-12">
          <h1 className="text-xl font-semibold mb-4">Rapport niet gevonden</h1>
          <p className="text-muted-foreground mb-6">
            Het rapport bestaat niet of u heeft geen toegang.
          </p>
          <Button onClick={() => navigate("/")} variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Terug naar dashboard
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <Seo 
        title={report.report_title || "ATAD2 Rapport"} 
        description="Gedetailleerd ATAD2 risico-analyse rapport"
        canonical={`/report/${reportId}`}
      />
      
      <div className="mb-6">
        <Button 
          onClick={() => navigate("/")} 
          variant="outline" 
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Terug naar dashboard
        </Button>
        
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              {report.report_title || "ATAD2 Rapport"}
            </h1>
            <p className="text-muted-foreground">
              Gegenereerd op {formatDate(report.generated_at)}
            </p>
          </div>
          
          <div className="flex gap-2">
            <Button onClick={handleDownload} variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Download .md
            </Button>
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Verwijderen
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Rapport verwijderen</AlertDialogTitle>
                  <AlertDialogDescription>
                    Weet u zeker dat u dit rapport wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuleren</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate()}
                    disabled={deleteMutation.isPending}
                  >
                    {deleteMutation.isPending ? "Verwijderen..." : "Verwijderen"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      <div className="grid gap-6 mb-6">
        {/* Metadata Card */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Rapportgegevens</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {report.model && (
              <div>
                <p className="text-sm text-muted-foreground">Model</p>
                <p className="font-medium">{report.model}</p>
              </div>
            )}
            {report.total_risk !== null && (
              <div>
                <p className="text-sm text-muted-foreground">Totaal risico</p>
                <p className="font-medium">{report.total_risk} punten</p>
              </div>
            )}
            {report.answers_count !== null && (
              <div>
                <p className="text-sm text-muted-foreground">Beantwoorde vragen</p>
                <p className="font-medium">{report.answers_count}</p>
              </div>
            )}
          </div>
        </Card>

        {/* Report Content */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Rapport inhoud</h2>
          <div className="prose prose-sm max-w-none">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
              {report.report_md}
            </pre>
          </div>
        </Card>
      </div>
    </main>
  );
};

export default ReportDetail;