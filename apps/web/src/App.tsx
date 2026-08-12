import { Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppShell } from '@/components/layout/app-shell';
import { ModulePlaceholder } from '@/components/layout/module-placeholder';
import { RedirectIfAuthed, RequireAuth } from '@/components/routing/guards';
import { LoginPage } from '@/features/auth/login-page';
import { PortfolioPage } from '@/features/portfolio/portfolio-page';
import { SiteDetailPage } from '@/features/sites/site-detail-page';
import { SitesPage } from '@/features/sites/sites-page';
import { WordPressPage } from '@/features/wordpress/wordpress-page';

export function App() {
  return (
    <Routes>
      <Route element={<RedirectIfAuthed />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<PortfolioPage />} />
          <Route path="/sites" element={<SitesPage />} />
          <Route path="/sites/:siteId" element={<SiteDetailPage />} />
          <Route path="/wordpress" element={<WordPressPage />} />
          <Route path="/issues" element={<NavPlaceholder name="nav.issues" />} />
          <Route path="/tasks" element={<NavPlaceholder name="nav.tasks" />} />
          <Route path="/reports" element={<NavPlaceholder name="nav.reports" />} />
          <Route path="/automation" element={<NavPlaceholder name="nav.automation" />} />
        </Route>
      </Route>
    </Routes>
  );
}

function NavPlaceholder({ name }: { name: string }) {
  const { t } = useTranslation();
  return <ModulePlaceholder name={t(name)} />;
}
