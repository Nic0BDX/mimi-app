import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './app/App';
import './styles/main.css';
import './styles/multiplayer.css';
import './styles/games.css';
import './styles/draughts.css';
import './styles/frenzy.css';
import './styles/horses.css';
import './styles/words.css';
import './styles/polish.css';
import './styles/preview.css';
import '@fontsource-variable/nunito/index.css';
import './styles/visual-v2.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
