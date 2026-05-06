import { Outlet } from "react-router-dom";
import { AppSidebar } from "@/components/admin/AdminSidebar";
import { MotionPage } from "@/components/motion";

const AdminLayout = () => {
  return (
    <div className="max-w-6xl mx-auto px-4">
      <div className="flex gap-6 min-h-[calc(100vh-4rem)] py-6">
        <AppSidebar />
        <main className="flex-1 min-w-0">
          <MotionPage>
            <Outlet />
          </MotionPage>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
