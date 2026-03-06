import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import SessionsPage from '@/pages/SessionsPage';
import RolesPage from '@/pages/RolesPage';
import PRDDecomposerPage from '@/pages/PRDDecomposerPage';
import EvolutionPage from '@/pages/EvolutionPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/sessions" replace />} />
        <Route path="sessions" element={<SessionsPage />} />
        <Route path="roles" element={<RolesPage />} />
        <Route path="prd" element={<PRDDecomposerPage />} />
        <Route path="evolution" element={<EvolutionPage />} />
      </Route>
    </Routes>
  );
}
