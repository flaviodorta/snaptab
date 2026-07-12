import { Route, Routes } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { LoginPage } from './pages/LoginPage';
import { ReceiptDetailPage } from './pages/ReceiptDetailPage';
import { ReceiptsPage } from './pages/ReceiptsPage';
import { SignupPage } from './pages/SignupPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <ReceiptsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/receipts/:id"
        element={
          <RequireAuth>
            <ReceiptDetailPage />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
