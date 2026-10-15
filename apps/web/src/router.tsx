import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { ActivityClient } from "@/app/activity/activity-client";
import { GuardianClient } from "@/app/guardian/guardian-client";
import { PayClient } from "@/app/pay/pay-client";
import { SessionsClient } from "@/app/sessions/sessions-client";
import { WorkspacesClient } from "@/app/workspaces/workspaces-client";
import { AgentsClient } from "@/app/agents/agents-client";
import DocsPage from "@/app/app/docs/page";
import { OverviewClient } from "@/app/overview-client";
import { PolicyClient } from "@/app/policy/policy-client";
import { VaultsClient } from "@/app/vaults/vaults-client";
import { AppShell } from "@/components/AppShell";
import { Landing } from "@/components/landing/Landing";
import { SdkPage } from "@/components/landing/SdkPage";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export function AppRoutes() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/sdks" element={<SdkPage />} />
        <Route path="/app" element={<AppShell />}>
          <Route index element={<OverviewClient />} />
          <Route path="vaults" element={<VaultsClient />} />
          <Route path="policies" element={<PolicyClient />} />
          <Route path="policy-lab" element={<Navigate to="/app/docs" replace />} />
          <Route path="agents" element={<AgentsClient />} />
          <Route path="activity" element={<ActivityClient />} />
          <Route path="pay" element={<PayClient />} />
          <Route path="workspaces" element={<WorkspacesClient />} />
          <Route path="sessions" element={<SessionsClient />} />
          <Route path="guardian" element={<GuardianClient />} />
          <Route path="docs" element={<DocsPage />} />
        </Route>
        <Route path="/vaults" element={<Navigate to="/app/vaults" replace />} />
        <Route path="/policy" element={<Navigate to="/app/policies" replace />} />
        <Route path="/agents" element={<Navigate to="/app/agents" replace />} />
        <Route path="/activity" element={<Navigate to="/app/activity" replace />} />
        <Route path="/docs" element={<Navigate to="/app/docs" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
