import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/admin/AdminSidebar";

const AdminLayout = () => {
  return (
    <SidebarProvider>
      <header className="h-12 flex items-center border-b px-2">
        <SidebarTrigger className="ml-1" />
        <h1 className="ml-3 text-sm font-medium text-foreground">Admin</h1>
      </header>
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
