import { ReactNode } from "react";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import NotAuthorized from "@/pages/NotAuthorized";

interface AdminRouteProps {
  children: ReactNode;
}

const AdminRoute = ({ children }: AdminRouteProps) => {
  const { hasAccess, isLoading } = useAdminAccess();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!hasAccess) {
    return <NotAuthorized />;
  }

  return <>{children}</>;
};

export default AdminRoute;
