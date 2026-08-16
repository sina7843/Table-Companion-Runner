import { RouterProvider } from 'react-router-dom';
import {
  noopSink,
  RepositoryProvider,
  SessionGate,
  SessionProvider,
  TelemetryProvider,
} from './domain';
import { Skeleton } from './design-system';
import { router } from './app/routes';

/**
 * Three providers, in order: telemetry, the data layer, then who is signed in — because the
 * session is read *through* the data layer rather than beside it, and both may have something
 * to report. Configuration decides whether the data layer is fixtures or an API; nothing
 * below here knows which.
 *
 * The telemetry sink is `noopSink` and that is the shipped default: the boundary exists so a
 * deployment can supply one, and this build supplies nothing. No vendor script, no network
 * call, no identifier — see `domain/telemetry.ts` for what may be reported and why the list
 * is closed.
 *
 * The gate is one wait in one place. With fixtures it is a microtask; with an API it is the
 * single identity request an auth boundary makes before the app renders. Screens below it
 * see a resolved session — signed in or signed out — and never a half-resolved one.
 */
export default function App() {
  return (
    <TelemetryProvider value={noopSink}>
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
    </TelemetryProvider>
  );
}
