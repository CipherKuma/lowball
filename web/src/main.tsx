import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/base.css';
import './styles/scene.css';
import './styles/screens.css';
import './styles/buyer.css';
import './styles/room.css';
import './styles/casefile.css';
import './styles/interro.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
