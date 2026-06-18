import { createRoot } from 'react-dom/client';
import 'tiptap-html-table/styles.css';

import { App } from './App';
import './styles.css';

const container = document.getElementById('app');

if (!container) {
  throw new Error('Missing root container for the S1000D React demo.');
}

createRoot(container).render(<App />);
