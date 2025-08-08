import { Seo } from "@/components/Seo";

const ContextQuestions = () => {
  return (
    <main>
      <Seo title="Admin Contextvragen" description="Beheer van contextvragen" canonical="/admin/context-questions" />
      <h1 className="text-xl font-semibold">Contextvragen</h1>
      <p className="text-muted-foreground">Beheer contextuele vragen en triggers.</p>
    </main>
  );
};

export default ContextQuestions;
