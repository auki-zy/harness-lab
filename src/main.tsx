import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import 'antd/dist/reset.css';
import './styles/tokens.css';
import './styles/app.css';
import './styles/record.css';
import './styles/responsive.css';

const el = document.getElementById('root');
if (!el) throw new Error('#root not found');

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
