import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const Index = () => {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-xl text-muted-foreground">Laden...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect to auth
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold">ATAD2 Risk Assessment</h1>
            <p className="text-xl text-muted-foreground mt-2">
              Welkom, {user.email}
            </p>
          </div>
          <Button variant="outline" onClick={signOut}>
            Uitloggen
          </Button>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle>Start je risicobeoordeling</CardTitle>
            <CardDescription>
              Beantwoord de vragen om je ATAD2 risicoscore te bepalen
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="lg">
              Start Assessment
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Index;
