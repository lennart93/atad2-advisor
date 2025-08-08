import { Seo } from "@/components/Seo";
import { Skeleton } from "@/components/ui/skeleton";

const Dashboard = () => {
  return (
    <main>
      <Seo title="Admin Dashboard" description="Overzicht van statistieken en recente activiteit" canonical="/admin/dashboard" />
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <p className="text-muted-foreground mb-4">Kerncijfers en recente activiteit</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-lg border p-4">
          <h2 className="text-sm text-muted-foreground">Sessies totaal</h2>
          <Skeleton className="h-8 w-24 mt-2" />
        </div>
        <div className="rounded-lg border p-4">
          <h2 className="text-sm text-muted-foreground">Gem. score</h2>
          <Skeleton className="h-8 w-24 mt-2" />
        </div>
        <div className="rounded-lg border p-4">
          <h2 className="text-sm text-muted-foreground">Nieuwe vandaag</h2>
          <Skeleton className="h-8 w-24 mt-2" />
        </div>
      </div>
    </main>
  );
};

export default Dashboard;
