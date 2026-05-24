import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ConsoleApp from './ConsoleApp';

const isConsole = window.location.hash === '#console';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isConsole ? <ConsoleApp /> : <App />}
  </React.StrictMode>
);
