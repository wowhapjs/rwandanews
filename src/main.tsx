import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { NewsroomRoot } from './NewsroomRoot';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NewsroomRoot />
  </StrictMode>,
);
