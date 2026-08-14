import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// The approved design system, then the structural adapter layer that sits on top of it.
// Order matters: adapters.css neutralises user-agent <dialog> styling that would otherwise
// fight the .tc-modal / .tc-drawer geometry.
import './design-system/styles.css';
import './design-system/components/adapters.css';
import './app/shell.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element in index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
