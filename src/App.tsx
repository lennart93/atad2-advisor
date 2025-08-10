
import { Suspense, lazy } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/routing/ProtectedRoute";
import PublicOnlyRoute from "@/components/routing/PublicOnlyRoute";
import ErrorBoundary from "@/components/ErrorBoundary";
import AdminRoute from "@/components/routing/AdminRoute";
import ScrollRestoration from "@/components/routing/ScrollRestoration";
// Route-based code splitting
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Assessment = lazy(() => import("./pages/Assessment"));
const AssessmentReport = lazy(() => import("./pages/AssessmentReport"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AppLayout = lazy(() => import("./pages/AppLayout"));

// Admin routes
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const AdminQuestions = lazy(() => import("./pages/admin/Questions"));
const AdminContextQuestions = lazy(() => import("./pages/admin/ContextQuestions"));
const AdminSessions = lazy(() => import("./pages/admin/Sessions"));
const AdminUsers = lazy(() => import("./pages/admin/Users"));
const NotAuthorized = lazy(() => import("./pages/NotAuthorized"));

const queryClient = new QueryClient();

const LoadingSpinner = () => (
  <div className="min-h-screen flex items-center justify-center">
    <p className="text-lg text-muted-foreground">Loading...</p>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Sonner />
        <BrowserRouter>
          <ScrollRestoration />
          <ErrorBoundary>
            <Suspense fallback={<LoadingSpinner />}>
                <Routes>
                  <Route path="/auth" element={<PublicOnlyRoute><Auth /></PublicOnlyRoute>} />

                  <Route element={<AppLayout />}>
                    <Route path="/" element={<Index />} />
                    <Route path="/assessment" element={<ProtectedRoute><Assessment /></ProtectedRoute>} />
                    <Route path="/assessment-report/:sessionId" element={<ProtectedRoute><AssessmentReport /></ProtectedRoute>} />

                    <Route path="/admin" element={<ProtectedRoute><AdminRoute><AdminLayout /></AdminRoute></ProtectedRoute>}>
                      <Route index element={<AdminDashboard />} />
                      <Route path="dashboard" element={<AdminDashboard />} />
                      <Route path="questions" element={<AdminQuestions />} />
                      <Route path="context-questions" element={<AdminContextQuestions />} />
                      <Route path="sessions" element={<AdminSessions />} />
                      <Route path="users" element={<AdminUsers />} />
                      <Route path="*" element={<NotAuthorized />} />
                    </Route>

                    <Route path="*" element={<NotFound />} />
                  </Route>
                </Routes>
            </Suspense>
          </ErrorBoundary>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
