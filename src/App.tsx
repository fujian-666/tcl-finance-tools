import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import type { ReactElement } from 'react';
import { ToastProvider } from './contexts/ToastContext';
import ToastContainer from './components/Toast';
import Layout from './components/Layout';
import Home from './pages/Home';
import Login from './pages/Login';
import ToolDetail from './pages/ToolDetail';
import AssetInventory from './pages/AssetInventory';
import CasualInventory from './pages/CasualInventory';
import AccessPassword from './pages/AccessPassword';
import { isLoggedIn } from './lib/api';

// 路由守卫：未登录跳转登录页
function RequireAuth({ children }: { children: ReactElement }) {
  const location = useLocation();
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth><Layout /></RequireAuth>}>
            <Route path="/" element={<Home />} />
            <Route path="/tool/:id" element={<ToolDetail />} />
            <Route path="/tool/asset-inventory" element={<AssetInventory />} />
            <Route path="/tool/casual-inventory" element={<CasualInventory />} />
            <Route path="/tool/access-password" element={<AccessPassword />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <ToastContainer />
    </ToastProvider>
  );
}
