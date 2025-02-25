import React from 'react';
import ReactDOM from 'react-dom/client'; // Import the "react-dom/client" for React 18
import './index.css'; // Optional styles
import App from './App'; // Import your App component

// Create a root element
const root = ReactDOM.createRoot(document.getElementById('root'));

// Render your app using the "root.render" method
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
