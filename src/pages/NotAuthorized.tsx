import { Link } from "react-router-dom";
import { Seo } from "@/components/Seo";

const NotAuthorized = () => {
  return (
    <main className="min-h-[60vh] flex items-center justify-center">
      <Seo title="Not authorized" description="You don't have access to this page" canonical="/not-authorized" />
      <div className="text-center">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-muted-foreground mt-2">Your account doesn't have permission to view this section.</p>
        <Link to="/" className="inline-block mt-4 underline text-primary">Back to home</Link>
      </div>
    </main>
  );
};

export default NotAuthorized;
