import { useMemo } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { ChatPage } from '../components/chat/ChatPage';
import { EvaluationPage } from '../components/evaluation/EvaluationPage';
import { AppHeader } from '../components/layout/AppHeader';
import { AppShell } from '../components/layout/AppShell';
import { LogsPage } from '../components/logs/LogsPage';
import { ResumePage } from '../components/resume/ResumePage';
import { StateMessage } from '../components/shared/StateMessage';
import { createService, type ResumeDeskService } from '../services';
import { ConversationsProvider } from '../state/ConversationsContext';
import { ResumeProvider } from '../state/ResumeContext';
import { ServiceProvider } from '../state/ServiceContext';
import { ToastProvider } from '../state/ToastContext';

export function AppProviders({ service, children }: { service: ResumeDeskService; children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ServiceProvider service={service}>
        <ResumeProvider>
          <ConversationsProvider>{children}</ConversationsProvider>
        </ResumeProvider>
      </ServiceProvider>
    </ToastProvider>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<ChatPage />} />
        <Route path="chat/:conversationId" element={<ChatPage />} />
        <Route path="resume" element={<ResumePage />} />
        <Route path="evaluation" element={<EvaluationPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

function NotFound() {
  return (
    <>
      <AppHeader title="Not found" />
      <div className="page">
        <div className="page__inner">
          <StateMessage title="This page doesn’t exist" actions={<Link to="/" className="btn btn--primary">Go to Ask resume</Link>}>
            Check the address, or return to the workspace.
          </StateMessage>
        </div>
      </div>
    </>
  );
}

export function App() {
  const service = useMemo(() => createService(), []);
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppProviders service={service}>
        <AppRoutes />
      </AppProviders>
    </BrowserRouter>
  );
}
