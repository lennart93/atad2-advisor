import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/admin/AdminSidebar";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";

const AdminLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const fromLocation = (location.state as any)?.from;
  const fallback = fromLocation?.pathname || "/";

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(fallback);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (window.history.length > 1) navigate(-1);
        else navigate(fallback);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fallback, navigate]);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 p-4">
          <Outlet />
        </main>
      </div>
    </SidebarProvider>
  );
};

export default AdminLayout;
