import { Seo } from "@/components/Seo";

const Questions = () => {
  return (
    <main>
      <Seo title="Admin Vragen" description="Beheer van ATAD2 vragen" canonical="/admin/questions" />
      <h1 className="text-xl font-semibold">Vragenbeheer</h1>
      <p className="text-muted-foreground">Maak, bewerk en verwijder vragen.</p>
    </main>
  );
};

export default Questions;
