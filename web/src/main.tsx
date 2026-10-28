import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

const inicio = performance.now();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Mantém a tela de carregamento por um instante mínimo e depois a remove com transição.
const restante = Math.max(0, 900 - (performance.now() - inicio));
setTimeout(() => {
  const splash = document.getElementById('splash');
  if (!splash) return;
  splash.classList.add('sumir');
  setTimeout(() => splash.remove(), 400);
}, restante);
