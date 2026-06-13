import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { logger } from '@utils/logger'
import { initSentry } from '@utils/sentry'

// Initialize optional Sentry integration
initSentry();

// Global Unhandled Error Handler
window.addEventListener('error', (event) => {
  logger.error('Unhandled runtime error', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    errorStack: event.error ? event.error.stack : undefined
  });
});

// Global Unhandled Promise Rejection Handler
window.addEventListener('unhandledrejection', (event) => {
  logger.error('Unhandled promise rejection', {
    reason: event.reason instanceof Error ? event.reason.message : String(event.reason),
    errorStack: event.reason instanceof Error ? event.reason.stack : undefined
  });
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)