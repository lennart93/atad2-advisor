import { Seo } from "@/components/Seo";

const Sessions = () => {
  return (
    <main>
      <Seo title="Admin Sessies" description="Overzicht en beheer van sessies" canonical="/admin/sessions" />
      <h1 className="text-xl font-semibold">Sessies</h1>
      <p className="text-muted-foreground">Filter, bekijk en exporteer sessies.</p>
    </main>
  );
};

export default Sessions;
