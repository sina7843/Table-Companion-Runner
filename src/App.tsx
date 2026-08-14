/**
 * Neutral boot shell for TC-00. It exists only to prove the app mounts.
 * The real app shell (sidebar + top bar for the DM, bottom nav for the Player),
 * the design tokens and the `tc-*` component layer arrive in TC-01 and TC-02.
 */
export default function App() {
  return (
    <main className="boot">
      <p className="boot__eyebrow">Table Companion</p>
      <h1 className="boot__title">Foundation ready</h1>
      <p className="boot__note">
        React + TypeScript + Vite are running. The approved Digital Grimoire design system is
        integrated in TC-01; the DM and Player app shells follow in TC-02.
      </p>
    </main>
  );
}
