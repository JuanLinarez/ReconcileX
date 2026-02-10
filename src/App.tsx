import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '@/layouts/AppLayout';
import { DashboardPage } from '@/pages/DashboardPage';
import { ReconciliationFlowPage } from '@/pages/ReconciliationFlowPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/reconciliation/new" element={<ReconciliationFlowPage />} />
          <Route path="/history" element={<PlaceholderPage title="History" />} />
          <Route path="/templates" element={<PlaceholderPage title="Templates" />} />
          <Route path="/settings" element={<PlaceholderPage title="Settings" />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
