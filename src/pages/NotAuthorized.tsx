import { Link } from "react-router-dom";
import { Seo } from "@/components/Seo";

const NotAuthorized = () => {
  return (
    <main className="min-h-[60vh] flex items-center justify-center">
      <Seo title="Niet geautoriseerd" description="Je hebt geen toegang tot deze pagina" canonical="/not-authorized" />
      <div className="text-center">
        <h1 className="text-xl font-semibold">Geen toegang</h1>
        <p className="text-muted-foreground mt-2">Je account heeft geen rechten om dit onderdeel te bekijken.</p>
        <Link to="/" className="inline-block mt-4 underline text-primary">Terug naar start</Link>
      </div>
    </main>
  );
};

export default NotAuthorized;
