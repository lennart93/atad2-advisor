
import { Suspense, lazy } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
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
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Assessment = lazy(() => import("./pages/Assessment"));
const AssessmentUpload = lazy(() => import("./pages/AssessmentUpload"));
const AssessmentConfirmation = lazy(() => import("./pages/AssessmentConfirmation"));
const AssessmentStructure = lazy(() => import("./pages/AssessmentStructure"));
const AssessmentReport = lazy(() => import("./pages/AssessmentReport"));
const ReportDetail = lazy(() => import("./pages/ReportDetail"));
const EmailConfirmed = lazy(() => import("./pages/EmailConfirmed"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AppLayout = lazy(() => import("./pages/AppLayout"));
const AssessmentShell = lazy(() => import("./components/assessment/AssessmentShell"));
const Tutorial = lazy(() => import("./pages/Tutorial"));

// Admin routes
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const AdminQuestions = lazy(() => import("./pages/admin/Questions"));
const AdminContextQuestions = lazy(() => import("./pages/admin/ContextQuestions"));
const AdminSessions = lazy(() => import("./pages/admin/Sessions"));
const AdminSessionDetail = lazy(() => import("./pages/admin/SessionDetail"));
const AdminUsers = lazy(() => import("./pages/admin/Users"));
const AdminAuditLogs = lazy(() => import("./pages/admin/AuditLogs"));
const AdminAnalytics = lazy(() => import("./pages/admin/Analytics"));
const AdminDataExplorer = lazy(() => import("./pages/admin/DataExplorer"));
const AdminPrompts = lazy(() => import("./pages/admin/Prompts"));
const AdminPrefillJobs = lazy(() => import("./pages/admin/PrefillJobs"));
const AdminFeedback = lazy(() => import("./pages/admin/Feedback"));
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
        {/* Sonner (used in parts of the app) */}
        <Sonner />
        {/* shadcn/use-toast toasts (used by DownloadMemoButton, etc.) */}
        <Toaster />
        <BrowserRouter>
          <ScrollRestoration />
          <ErrorBoundary>
            <Suspense fallback={<LoadingSpinner />}>
                <Routes>
                  <Route path="/auth" element={<PublicOnlyRoute><Auth /></PublicOnlyRoute>} />
                  <Route path="/verify-email" element={<VerifyEmail />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/email-confirmed" element={<EmailConfirmed />} />
                  <Route path="/tutorial" element={<ProtectedRoute><Tutorial /></ProtectedRoute>} />

                  <Route element={<AppLayout />}>
                    <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                    <Route element={<AssessmentShell />}>
                      <Route path="/assessment" element={<ProtectedRoute><Assessment /></ProtectedRoute>} />
                      <Route path="/assessment/upload" element={<ProtectedRoute><AssessmentUpload /></ProtectedRoute>} />
                      <Route path="/assessment/structure/:sessionId" element={<ProtectedRoute><AssessmentStructure /></ProtectedRoute>} />
                      <Route path="/assessment-confirmation/:sessionId" element={<ProtectedRoute><AssessmentConfirmation /></ProtectedRoute>} />
                      <Route path="/assessment-report/:sessionId" element={<ProtectedRoute><AssessmentReport /></ProtectedRoute>} />
                    </Route>
                    <Route path="/report/:reportId" element={<ProtectedRoute><ReportDetail /></ProtectedRoute>} />

                    <Route path="/admin" element={<ProtectedRoute><AdminRoute><AdminLayout /></AdminRoute></ProtectedRoute>}>
                      <Route index element={<AdminDashboard />} />
                      <Route path="dashboard" element={<AdminDashboard />} />
                      <Route path="questions" element={<AdminQuestions />} />
                      <Route path="questions/:id" element={<AdminQuestions />} />
                      <Route path="context-questions" element={<AdminContextQuestions />} />
                      <Route path="context-questions/:id" element={<AdminContextQuestions />} />
                      <Route path="sessions" element={<AdminSessions />} />
                      <Route path="sessions/:id" element={<AdminSessionDetail />} />
                      <Route path="users" element={<AdminUsers />} />
                      <Route path="audit" element={<AdminAuditLogs />} />
                      <Route path="analytics" element={<AdminAnalytics />} />
                      <Route path="explorer" element={<AdminDataExplorer />} />
                      <Route path="prompts" element={<AdminPrompts />} />
                      <Route path="prefill-jobs" element={<AdminPrefillJobs />} />
                      <Route path="feedback" element={<AdminFeedback />} />
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
