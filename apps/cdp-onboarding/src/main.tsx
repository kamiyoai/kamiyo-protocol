import React from 'react';
import ReactDOM from 'react-dom/client';
import { CDPReactProvider } from '@coinbase/cdp-react';

import { App } from './App';
import './styles.css';

const projectId = import.meta.env.VITE_CDP_PROJECT_ID as string | undefined;

function Root() {
  if (!projectId) {
    return (
      <div className="page">
        <div className="shell">
          <h1 className="title">Embedded Onboarding</h1>
          <p className="muted">
            Missing <code>VITE_CDP_PROJECT_ID</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <CDPReactProvider
      config={{
        projectId,
        appName: 'KAMIYO',
        authMethods: ['email'],
        ethereum: { createOnLogin: 'eoa' },
      }}
    >
      <App />
    </CDPReactProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
