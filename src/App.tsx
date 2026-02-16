import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { AuthProvider } from '@/contexts/auth-context'
import { Toaster } from '@/components/ui/sonner'
import { AppLayout } from '@/components/layout/app-layout'
import { ProtectedRoute } from '@/components/layout/protected-route'

const LoginPage = lazy(() => import('@/pages/login').then((m) => ({ default: m.LoginPage })))
const AccessDeniedPage = lazy(() => import('@/pages/access-denied').then((m) => ({ default: m.AccessDeniedPage })))
const AuthCallbackPage = lazy(() => import('@/pages/auth-callback').then((m) => ({ default: m.AuthCallbackPage })))
const DashboardPage = lazy(() => import('@/pages/dashboard').then((m) => ({ default: m.DashboardPage })))
const TasksPage = lazy(() => import('@/pages/tasks').then((m) => ({ default: m.TasksPage })))
const NewTaskPage = lazy(() => import('@/pages/new-task').then((m) => ({ default: m.NewTaskPage })))
const TaskDetailPage = lazy(() => import('@/pages/task-detail').then((m) => ({ default: m.TaskDetailPage })))
const NotificationsPage = lazy(() => import('@/pages/notifications').then((m) => ({ default: m.NotificationsPage })))
const SettingsPage = lazy(() => import('@/pages/settings').then((m) => ({ default: m.SettingsPage })))
const TeamManagementPage = lazy(() => import('@/pages/team-management').then((m) => ({ default: m.TeamManagementPage })))
const AdminPage = lazy(() => import('@/pages/admin').then((m) => ({ default: m.AdminPage })))

function RouteLoader() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<RouteLoader />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/access-denied" element={<AccessDeniedPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />

            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="tasks" element={<TasksPage />} />
              <Route path="tasks/new" element={<NewTaskPage />} />
              <Route path="tasks/:id" element={<TaskDetailPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route
                path="settings/team"
                element={
                  <ProtectedRoute requireRole="ceo">
                    <TeamManagementPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="admin"
                element={
                  <ProtectedRoute requireRole="ceo">
                    <AdminPage />
                  </ProtectedRoute>
                }
              />
            </Route>
          </Routes>
        </Suspense>
        <Toaster richColors position="bottom-right" />
      </AuthProvider>
    </BrowserRouter>
  )
}
