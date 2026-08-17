import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AdminPortal from "./components/admin/AdminPortal.jsx";
import './App.css';
const isAdminRoute = window.location.pathname.replace(/\/+$/, '') === '/admin';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isAdminRoute ? <AdminPortal /> : <App />}
  </React.StrictMode>
);
