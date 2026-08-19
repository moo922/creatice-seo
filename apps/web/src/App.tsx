import { Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/app-shell';
import { RedirectIfAuthed, RequireAuth } from '@/components/routing/guards';
import { LoginPage } from '@/features/auth/login-page';
import { PortfolioDashboard } from '@/features/portfolio/portfolio-dashboard';
import { SiteDetailPage } from '@/features/sites/site-detail-page';
import { SitesPage } from '@/features/sites/sites-page';
import { AddSitePage } from '@/features/sites/add-site-page';
import { ClientsPage } from '@/features/clients/clients-page';
import { KnowledgeBasePage } from '@/features/knowledge/knowledge-page';
import { WordPressPage } from '@/features/wordpress/wordpress-page';
import { IssuesPage } from '@/features/issues/issues-page';
import { TasksPage } from '@/features/tasks/tasks-page';
import { ReportsPage } from '@/features/reports/reports-page';
import { AutomationPage } from '@/features/automation/automation-page';
import { MonitoringPage } from '@/features/monitoring/monitoring-page';
import { VisibilityPage } from '@/features/visibility/visibility-page';
import { WorkQueuePage } from '@/features/workqueue/workqueue-page';
import { ContentStudioPage } from '@/features/content-studio/content-studio-page';
import { ClientPortalPage } from '@/features/client/client-portal-page';
import { ClientSitePage } from '@/features/client/client-site-page';

export function App() {
  return (
    <Routes>
      <Route element={<RedirectIfAuthed />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<PortfolioDashboard />} />
          <Route path="/sites" element={<SitesPage />} />
          <Route path="/sites/new" element={<AddSitePage />} />
          <Route path="/sites/:siteId" element={<SiteDetailPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/knowledge" element={<KnowledgeBasePage />} />
          <Route path="/wordpress" element={<WordPressPage />} />
          <Route path="/issues" element={<IssuesPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/automation" element={<AutomationPage />} />
          <Route path="/monitoring" element={<MonitoringPage />} />
          <Route path="/visibility" element={<VisibilityPage />} />
          <Route path="/work" element={<WorkQueuePage />} />
          <Route path="/content-studio" element={<ContentStudioPage />} />
          <Route path="/client" element={<ClientPortalPage />} />
          <Route path="/client/sites/:siteId" element={<ClientSitePage />} />
        </Route>
      </Route>
    </Routes>
  );
}
