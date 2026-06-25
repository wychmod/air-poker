import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { initializeDebugLoggerFromRuntime, logDebugEvent } from './app/debug-log';
import { installGlobalErrorHandlers, reportGlobalError } from './app/global-errors';
import { App } from './App';
import './index.css';

const debugLogEnabled = initializeDebugLoggerFromRuntime();
logDebugEvent('debug-log:configured', { enabled: debugLogEnabled });
logDebugEvent('app:boot');
installGlobalErrorHandlers(reportGlobalError);

const rootElement = document.getElementById('root');

if (rootElement === null) {
  logDebugEvent(
    'error:captured',
    {
      code: 'missing-root',
      message: 'Root element #root was not found',
      source: 'app:boot',
    },
    {
      level: 'error',
    },
  );
  throw new Error('Root element #root was not found');
}

logDebugEvent('app:root-found');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
logDebugEvent('app:mounted');
