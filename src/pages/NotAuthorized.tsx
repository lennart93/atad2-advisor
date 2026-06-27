import { Link } from "react-router-dom";
import { Seo } from "@/components/Seo";

const NotAuthorized = () => {
  return (
    <main className="min-h-[60vh] flex items-center justify-center">
      <Seo title="Not authorized" description="You don't have access to this page" canonical="/not-authorized" />
      <div className="text-center">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-ds-ink-secondary">Access</p>
        <h1 className="text-xl font-normal tracking-tight mt-1">Access denied</h1>
        <p className="text-ds-ink-secondary mt-2">Your account does not have permission to view this section.</p>
        <Link to="/" className="inline-block mt-4 underline text-primary">Back to home</Link>
      </div>
    </main>
  );
};

export default NotAuthorized;
