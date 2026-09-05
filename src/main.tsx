import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';
import { registerCytoscapeExtensions } from './features/graph-canvas';
import { injectThemeCssVars } from './shared/theme/cssVars';
import { DARK_TOKENS, LIGHT_TOKENS } from './shared/theme/tokens';

import './index.css';

registerCytoscapeExtensions();
injectThemeCssVars(LIGHT_TOKENS, DARK_TOKENS);

const root = document.getElementById('root');
if (root === null) {
  throw new Error('root element missing');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
