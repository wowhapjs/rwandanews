import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { NewsroomRoot } from './NewsroomRoot';
import './index.css';
import './newsroom.css';
import './reader/reader-enhancements.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NewsroomRoot />
  </StrictMode>,
);
