import { Suspense, type ReactNode } from 'react';
import { Link, matchPath, Outlet, useLocation } from 'react-router-dom';
import {
  Button,
  ConnectionStatus,
  IconButton,
  NavItem,
  Sidebar,
  SidebarGroup,
  Skeleton,
} from '../design-system';
import { ContextPanel } from './ContextPanel';
import { ContextPanelProvider, useContextPanel } from './panelContext';
import { campaignNavGroups, globalNavGroups } from './nav';
import { BP, useMediaQuery } from './useMediaQuery';
import { useConnection } from './useConnection';

/** True when `to` is the current route, or an ancestor of it unless `end` is set. */
function isActivePath(pathname: string, to: string, end?: boolean): boolean {
  return matchPath({ path: to, end: end ?? false }, pathname) !== null;
}

/**
 * The DM shell: three columns — navigation, workspace, context.
 *
 * Responsive behaviour is the design's, not invented:
 *   ≥ 1280px  full 232px sidebar, compact density, context panel docked in its column
 *   < 1280px  56px icon rail, comfortable density (the DM is touching the screen now,
 *             often one-handed), context panel as a non-modal drawer
 */
function DMShellInner() {
  const isDesktop = useMediaQuery(BP.xl);
  const connection = useConnection();
  const { content, close } = useContextPanel();
  const { pathname } = useLocation();

  const campaignMatch = matchPath({ path: '/dm/campaigns/:campaignId', end: false }, pathname);
  const activeCampaign = campaignMatch?.params.campaignId;
  const groups = activeCampaign ? campaignNavGroups(activeCampaign) : globalNavGroups();

  return (
    <div
      className="tc-shell tc-appsurface"
      // Density steps up, not down: the tablet is a touch surface even though it is
      // still the DM's workspace. Theme stays dark — the session-running environment.
      data-density={isDesktop ? 'compact' : 'comfortable'}
    >
      <a className="tc-btn tc-btn--primary tc-skiplink" href="#main">
        Skip to content
      </a>

      <Sidebar
        label="Main"
        collapsed={!isDesktop}
        brand={
          isDesktop ? (
            <span className="tc-sidebar__mark">
              Table<span>·</span>Companion
            </span>
          ) : (
            <span className="tc-sidebar__mark" aria-label="Table Companion">
              T<span>·</span>C
            </span>
          )
        }
        // Reported, not asserted: the shell used to claim Live whatever was true.
        footer={isDesktop ? <ConnectionStatus state={connection.state} /> : undefined}
      >
        {/*
          A live combat pins itself to the top of the sidebar for its duration. That needs
          real combat state, which arrives with TC-03 and TC-11 — it is deliberately not
          faked here, because a permanent placeholder would be exactly the kind of empty
          promise the design rules out.
        */}
        {groups.map((group) => (
          <SidebarGroup key={group.label} label={isDesktop ? group.label : undefined}>
            {group.items.map((item) => (
              <NavItem
                key={item.to}
                as={Link}
                to={item.to}
                icon={item.icon}
                label={item.label}
                count={item.count}
                active={isActivePath(pathname, item.to, item.end)}
                collapsed={!isDesktop}
              />
            ))}
          </SidebarGroup>
        ))}
      </Sidebar>

      <div className="tc-shell__main" data-panel-open={content ? 'true' : undefined}>
        {/*
          The route modules are loaded on demand, so the Outlet needs its own boundary —
          the one inside DMPage sits below the route and would never see it suspend.
        */}
        <Suspense fallback={<RouteLoading />}>
          <Suspense fallback={<RouteLoading />}>
            <Outlet />
          </Suspense>
        </Suspense>

        <ContextPanel
          open={content !== null}
          onClose={close}
          eyebrow={content?.eyebrow}
          title={content?.title ?? ''}
          actions={content?.actions}
        >
          {content?.body}
        </ContextPanel>
      </div>
    </div>
  );
}

export function DMShell() {
  return (
    <ContextPanelProvider>
      <DMShellInner />
    </ContextPanelProvider>
  );
}

export interface DMPageProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  actions?: ReactNode;
  /** Rendered below the bar — campaign tabs, or the combat control bar. */
  subbar?: ReactNode;
  children?: ReactNode;
}

/**
 * Page chrome for a DM route: top bar, optional sub-bar, then the scrolling workspace.
 * Routes compose this rather than each reinventing a header.
 */
export function DMPage({ eyebrow, title, actions, subbar, children }: DMPageProps) {
  return (
    <>
      <header className="tc-topbar">
        <div className="tc-topbar__titles">
          {eyebrow && <span className="tc-topbar__eyebrow">{eyebrow}</span>}
          <h1 className="tc-topbar__title">{title}</h1>
        </div>
        {actions}
        <Button variant="secondary" size="sm">
          Search
          <span className="tc-kbd">⌘K</span>
        </Button>
        <IconButton icon="bell" label="Notifications" size="sm" />
      </header>

      {subbar && <div className="tc-subbar">{subbar}</div>}

      <main className="tc-shell__content" id="main" tabIndex={-1}>
        <Suspense fallback={<RouteLoading />}>{children}</Suspense>
      </main>
    </>
  );
}

/**
 * Route-level loading state. Skeletons stand in for the rows they replace so nothing
 * shifts when the data lands; section headers are not data, so they render immediately.
 */
export function RouteLoading() {
  return (
    <div className="tc-page" aria-busy="true">
      <span className="tc-visually-hidden" role="status">
        Loading
      </span>
      <Skeleton count={8} height={40} gap={8} />
    </div>
  );
}
