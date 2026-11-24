import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { RequireAuth, LoginRoute } from './App';
import { DashboardPage } from './pages/DashboardPage';
import { CitizensPage } from './pages/CitizensPage';
import { ComplaintsPage, ComplaintDetailPage } from './pages/ComplaintsPage';
import { ModulePlaceholder } from './pages/ModulePlaceholder';
import { CallStudioPage } from './pages/CallStudioPage';
import { SessionsPage, SessionDetailPage } from './pages/SessionsPage';
import { PublicUploadPage } from './pages/PublicUploadPage';
import { CampaignsPage, CampaignDetailPage } from './pages/CampaignsPage';
import { ReportsPage } from './pages/ReportsPage';
import '@fontsource-variable/inter';
import './style.css';
import './citizens.css';
import './complaints.css';
import './studio.css';
import './attachments.css';
import './reports.css';
import './accessibility.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginRoute />} />
            <Route path="/upload/:token" element={<PublicUploadPage />} />
            <Route element={<RequireAuth />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/citizens" element={<CitizensPage />} />
              <Route path="/complaints" element={<ComplaintsPage />} />
              <Route path="/complaints/:id" element={<ComplaintDetailPage />} />
              <Route path="/studio" element={<CallStudioPage />} />
              <Route path="/sessions" element={<SessionsPage />} />
              <Route path="/sessions/:id" element={<SessionDetailPage />} />
              <Route path="/campaigns" element={<CampaignsPage />} />
              <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route
                path="/settings"
                element={
                  <ModulePlaceholder
                    title="AI configuration"
                    description="AI and language configuration will be available in a later phase."
                  />
                }
              />
            </Route>
            <Route path="*" element={<LoginRoute />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
