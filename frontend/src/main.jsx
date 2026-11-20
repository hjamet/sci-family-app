import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import App from './App.jsx'
import './index.css'
import { initErrorLogger } from './utils/errorLogger'

initErrorLogger();

// Capture précoce de l'événement Chrome/Edge PWA avant le montage React (Android, PC, Mac)
if (typeof window !== 'undefined') {
  window.__sciDeferredInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    window.__sciDeferredInstallPrompt = event;
    window.dispatchEvent(new CustomEvent('sci-pwa-install-available'));
  });
  window.addEventListener('appinstalled', () => {
    window.__sciDeferredInstallPrompt = null;
    window.dispatchEvent(new CustomEvent('sci-pwa-installed'));
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
        console.warn('Service Worker non enregistré:', err);
      });
    });
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
