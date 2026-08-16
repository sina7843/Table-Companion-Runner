import { Suspense, type ReactNode } from 'react';
import { Link, matchPath, Outlet, useLocation } from 'react-router-dom';
import { BottomNav, Skeleton } from '../design-system';
import { PLAYER_NAV } from './nav';
import { RouteLoading } from './DMShell';

/**
 * The player shell: header, scrolling content, bottom navigation.
 *
 * Mobile-first at touch density, which is what arms the design system's 44px control
 * floor. This is not the DM shell at a narrow width — it is a different composition,
 * because the player is holding a phone in one hand at a table with five other people.
 */
export function PlayerShell() {
  const { pathname } = useLocation();

  const active =
    PLAYER_NAV.find(
      (item) => item.to !== '/play' && matchPath({ path: item.to, end: false }, pathname),
    )?.id ?? 'home';

  return (
    <div className="tc-mobile tc-appsurface" data-density="touch">
      <a className="tc-btn tc-btn--primary tc-skiplink" href="#main">
        Skip to content
      </a>

      <Suspense fallback={<RouteLoading />}>
        <Outlet />
      </Suspense>

      <BottomNav
        items={PLAYER_NAV}
        value={active}
        as={Link}
        itemProps={(item) => ({
          to: PLAYER_NAV.find((entry) => entry.id === item.id)?.to ?? '/play',
        })}
      />
    </div>
  );
}

export interface PlayerPageProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

/** Page chrome for a player route: header, then the scrolling content region. */
export function PlayerPage({ eyebrow, title, actions, children }: PlayerPageProps) {
  return (
    <>
      <header className="tc-mobile__header">
        <div className="tc-topbar__titles">
          {eyebrow && <span className="tc-topbar__eyebrow">{eyebrow}</span>}
          <h1 className="tc-topbar__title">{title}</h1>
        </div>
        {actions}
      </header>

      <main className="tc-mobile__content" id="main" tabIndex={-1}>
        <Suspense fallback={<RouteLoading />}>{children}</Suspense>
      </main>
    </>
  );
}

/** Mobile route loading state — touch rows are 52px, so the skeleton matches. */
export function PlayerRouteLoading() {
  return (
    <div className="tc-page" aria-busy="true">
      <span className="tc-visually-hidden" role="status">
        Loading
      </span>
      <Skeleton count={6} height={52} gap={8} />
    </div>
  );
}
