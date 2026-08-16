import { RouterProvider } from 'react-router-dom';
import { RepositoryProvider, SessionGate, SessionProvider } from './domain';
import { Skeleton } from './design-system';
import { router } from './app/routes';

/**
 * Two providers, in order: the data layer, then who is signed in — because the session is
 * read *through* the data layer rather than beside it. Configuration decides whether that
 * layer is fixtures or an API; nothing below here knows which.
 *
 * The gate is one wait in one place. With fixtures it is a microtask; with an API it is the
 * single identity request an auth boundary makes before the app renders. Screens below it
 * see a resolved session — signed in or signed out — and never a half-resolved one.
 */
export default function App() {
  return (
    <RepositoryProvider>
      <SessionProvider>
        <SessionGate
          fallback={
            <div className="tc-page" aria-busy="true">
              <span className="tc-visually-hidden" role="status">
                Signing you in
              </span>
              <Skeleton count={4} height={44} gap={8} />
            </div>
          }
        >
          <RouterProvider router={router} />
        </SessionGate>
      </SessionProvider>
    </RepositoryProvider>
  );
}
