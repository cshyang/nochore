/**
 * Composio OAuth callback route.
 *
 * After a user completes OAuth on Composio's side, they're redirected here.
 * This page polls Composio to verify the connection is active, updates the
 * DB, and shows a success message before redirecting back.
 */

import { useEffect, useState } from "react";
import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { COLORS } from "~/lib/colors";
import { Card } from "~/components/Card";
import { Button } from "~/components/Button";
import { pollComposioConnection, activateConnection } from "~/server/connections";

export const Route = createFileRoute("/$projectId/callback/composio")({
  validateSearch: (search: Record<string, unknown>) => ({
    provider: (search.provider as string) || "googleads",
    returnTo: (search.returnTo as string) || "",
    popup: (search.popup as string) === "true",
  }),
  component: ComposioCallbackPage,
});

function ComposioCallbackPage() {
  const navigate = useNavigate();
  const { projectId } = Route.useParams();
  const { provider, returnTo, popup: popupParam } = useSearch({ from: Route.id });
  // Detect popup mode: either from query param OR by checking if this window was opened as a popup
  const isPopup = popupParam || (typeof window !== "undefined" && window.opener !== null);

  const [status, setStatus] = useState<"verifying" | "success" | "error">(
    "verifying",
  );
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 15; // ~30 seconds of polling

    async function verify() {
      while (!cancelled && attempts < maxAttempts) {
        attempts++;
        try {
          const result = (await pollComposioConnection({
            data: { projectId, provider },
          })) as { connected: boolean; status: string };

          if (result.connected) {
            if (!cancelled) setStatus("success");
            setTimeout(() => {
              if (!cancelled) {
                if (isPopup) {
                  window.close();
                  return;
                }
                if (returnTo) {
                  navigate({ to: returnTo });
                } else {
                  navigate({
                    to: "/$projectId",
                    params: { projectId },
                  });
                }
              }
            }, 1000);
            return;
          }
        } catch {
          // Keep polling on transient errors
        }

        // Wait 2 seconds before next poll
        await new Promise((r) => setTimeout(r, 2000));
      }

      // If we get here, we timed out — try activating anyway (Composio
      // may have a race condition where the webhook arrived but our
      // poll missed it).
      if (!cancelled) {
        try {
          const activation = (await activateConnection({
            data: { projectId, provider },
          })) as { success: boolean; error?: string };

          if (activation.success) {
            setStatus("success");
            setTimeout(() => {
              if (!cancelled) {
                if (isPopup) {
                  window.close();
                  return;
                }
                if (returnTo) {
                  navigate({ to: returnTo });
                } else {
                  navigate({
                    to: "/$projectId",
                    params: { projectId },
                  });
                }
              }
            }, 1000);
            return;
          }
        } catch {
          // Fall through to error
        }

        setStatus("error");
        setErrorMsg("Connection verification timed out. Please try again.");
      }
    }

    verify();
    return () => {
      cancelled = true;
    };
  }, [projectId, provider, returnTo, isPopup, navigate]);

  const providerLabel =
    provider === "googleads"
      ? "Google Ads"
      : provider === "slack"
        ? "Slack"
        : provider;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: COLORS.bg,
        padding: 32,
      }}
    >
      <Card style={{ maxWidth: 440, width: "100%", textAlign: "center" }}>
        {status === "verifying" && (
          <>
            <div
              style={{
                fontSize: 32,
                marginBottom: 16,
                animation: "spin 2s linear infinite",
              }}
            >
              ✦
            </div>
            <h2
              style={{
                color: COLORS.text,
                fontSize: 18,
                fontWeight: 600,
                margin: "0 0 8px",
              }}
            >
              Connecting {providerLabel}...
            </h2>
            <p
              style={{
                color: COLORS.textSecondary,
                fontSize: 14,
                margin: 0,
              }}
            >
              Verifying your connection. This may take a moment.
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <div style={{ fontSize: 32, marginBottom: 16 }}>✓</div>
            <h2
              style={{
                color: COLORS.text,
                fontSize: 18,
                fontWeight: 600,
                margin: "0 0 8px",
              }}
            >
              {providerLabel} connected
            </h2>
            <p
              style={{
                color: COLORS.textSecondary,
                fontSize: 14,
                margin: 0,
              }}
            >
              {isPopup ? "You can close this window." : "Redirecting you back..."}
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
            <h2
              style={{
                color: COLORS.text,
                fontSize: 18,
                fontWeight: 600,
                margin: "0 0 8px",
              }}
            >
              Connection issue
            </h2>
            <p
              style={{
                color: COLORS.textSecondary,
                fontSize: 14,
                margin: "0 0 20px",
              }}
            >
              {errorMsg}
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              {isPopup ? (
                <Button onClick={() => window.close()}>Close</Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() =>
                    navigate({
                      to: "/$projectId",
                      params: { projectId },
                    })
                  }
                >
                  Back to project
                </Button>
              )}
              <Button onClick={() => window.location.reload()}>
                Try again
              </Button>
            </div>
          </>
        )}
      </Card>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
