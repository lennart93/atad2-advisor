import { Outlet } from "react-router-dom";
import { AppSidebar } from "@/components/admin/AdminSidebar";

const AdminLayout = () => {
  return (
    <div className="max-w-6xl mx-auto px-4">
      <div className="flex gap-6 min-h-[calc(100vh-4rem)] py-6">
        <AppSidebar />
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
