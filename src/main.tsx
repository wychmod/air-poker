import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { installGlobalErrorHandlers, reportGlobalError } from './app/global-errors';
import { App } from './App';
import './index.css';

installGlobalErrorHandlers(reportGlobalError);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
