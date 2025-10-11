/**
 * Application Entry Point
 * Initializes React app and service worker
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { updateSW } from './serviceWorker';

// Mount app
const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register service worker in production
if (import.meta.env.PROD) {
  updateSW;
}
