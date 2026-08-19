import { Link, NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BarChart3,
  BookOpen,
  Bot,
  Building2,
  FileText,
  FolderKanban,
  Globe,
  Languages,
  ListChecks,
  LogOut,
  Menu,
  Settings,
  Sparkles,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { NotificationBell } from '@/components/shared/notifications';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const NAV_ITEMS = [
  { to: '/', label: 'nav.portfolio', icon: FolderKanban, end: true, permission: 'sites:read' },
  { to: '/sites', label: 'nav.sites', icon: Globe, end: false, permission: 'sites:read' },
  { to: '/clients', label: 'nav.clients', icon: Building2, end: false, permission: 'organizations:read' },
  { to: '/knowledge', label: 'nav.knowledge', icon: BookOpen, end: false, permission: 'knowledge:read' },
  { to: '/wordpress', label: 'nav.wordpress', icon: Globe, end: false, permission: 'wordpress:read' },
  { to: '/issues', label: 'nav.issues', icon: BarChart3, end: false, permission: 'operations:read' },
  { to: '/tasks', label: 'nav.tasks', icon: Users, end: false, permission: 'operations:read' },
  { to: '/monitoring', label: 'nav.monitoring', icon: BarChart3, end: false, permission: 'operations:read' },
  { to: '/work', label: 'nav.work', icon: ListChecks, end: false, permission: 'workqueue:read' },
  { to: '/content-studio', label: 'nav.contentStudio', icon: FileText, end: false, permission: 'content:read' },
  { to: '/visibility', label: 'nav.visibility', icon: Sparkles, end: false, permission: 'visibility:read' },
  { to: '/reports', label: 'nav.reports', icon: BarChart3, end: false, permission: 'reports:read' },
  { to: '/automation', label: 'nav.automation', icon: Bot, end: false, permission: 'orchestration:read' },
  { to: '/settings', label: 'nav.settings', icon: Settings, end: false, permission: 'ai:read' },
  { to: '/client', label: 'nav.client', icon: Users, end: false, clientOnly: true },
] as const;

export function AppShell() {
  const { t } = useTranslation();
  const { user, logout, hasPermission } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isClient = user?.roles.includes('CLIENT') ?? false;
  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if ('clientOnly' in item && item.clientOnly) return isClient;
    return !('permission' in item) || hasPermission(item.permission);
  });

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 p-3">
      {visibleNavItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )
          }
        >
          <item.icon className="size-4" />
          {t(item.label)}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-muted/40">
      <aside className="hidden w-64 border-e bg-card md:flex md:flex-col">
        <Link to="/" className="flex items-center gap-2 border-b p-4">
          <Globe className="size-6 text-primary" />
          <div className="leading-tight">
            <div className="font-semibold">{t('brand.title')}</div>
            <div className="text-xs text-muted-foreground">{t('brand.subtitle')}</div>
          </div>
        </Link>
        {sidebar}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 start-0 w-64 bg-card">
            <div className="flex items-center justify-between border-b p-4">
              <span className="font-semibold">{t('brand.title')}</span>
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)}>
                <Menu className="size-4" />
              </Button>
            </div>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)}>
              <Menu className="size-5" />
            </Button>
            <span className="text-sm font-medium text-muted-foreground">
              {user?.fullName ?? ''}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <LanguageSwitch />
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Account">
                  <Settings className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <div className="px-2 py-1.5 text-sm">
                  <div className="font-medium">{user?.fullName}</div>
                  <div className="text-xs text-muted-foreground">{user?.email}</div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/settings">
                    <Settings className="size-4" />
                    {t('nav.settings')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void logout()}>
                  <LogOut className="size-4" />
                  {t('userMenu.logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function LanguageSwitch() {
  const { t, i18n } = useTranslation();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => void i18n.changeLanguage(i18n.language === 'en' ? 'ar' : 'en')}
    >
      <Languages className="size-4" />
      {t('language.switch')}
    </Button>
  );
}
