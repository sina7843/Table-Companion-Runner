import { Showcase } from './showcase/Showcase';

/**
 * TC-01 renders the design-system showcase, because no product screen exists yet and
 * the showcase is what the fidelity checks run against. TC-02 replaces this with the
 * real app shell and routing; the showcase moves behind a dev-only route then.
 */
export default function App() {
  return <Showcase />;
}
