
import { Suspense, lazy } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/routing/ProtectedRoute";
import PublicOnlyRoute from "@/components/routing/PublicOnlyRoute";
import ErrorBoundary from "@/components/ErrorBoundary";

// Route-based code splitting
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Assessment = lazy(() => import("./pages/Assessment"));
const AssessmentReport = lazy(() => import("./pages/AssessmentReport"));
const NotFound = lazy(() => import("./pages/NotFound"));

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
          <ErrorBoundary>
            <Suspense fallback={<LoadingSpinner />}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<PublicOnlyRoute><Auth /></PublicOnlyRoute>} />
                <Route path="/assessment" element={<ProtectedRoute><Assessment /></ProtectedRoute>} />
                <Route path="/assessment-report/:sessionId" element={<ProtectedRoute><AssessmentReport /></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
