import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { setPendingJoin } from './screens/Household';
import './styles.css';

// An invite link (/?join=CODE) survives sign-in: keep the code, clean the URL.
const join = new URLSearchParams(location.search).get('join');
if (join) { setPendingJoin(join); history.replaceState(null, '', location.pathname + location.hash); }

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
