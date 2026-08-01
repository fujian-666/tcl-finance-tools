import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider } from './contexts/ToastContext';
import ToastContainer from './components/Toast';
import Layout from './components/Layout';
import Home from './pages/Home';
import ToolDetail from './pages/ToolDetail';
import AssetInventory from './pages/AssetInventory';

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/tool/:id" element={<ToolDetail />} />
            <Route path="/tool/asset-inventory" element={<AssetInventory />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <ToastContainer />
    </ToastProvider>
  );
}