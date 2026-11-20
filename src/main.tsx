import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

declare global {
  interface Window {
    __zorvyxInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__zorvyxInstallPrompt = e as BeforeInstallPromptEvent;
  window.dispatchEvent(new Event('zorvyx-install-available'));
});

window.addEventListener('appinstalled', () => {
  window.__zorvyxInstallPrompt = null;
  window.dispatchEvent(new Event('zorvyx-app-installed'));
});

if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
