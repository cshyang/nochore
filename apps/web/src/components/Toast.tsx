/**
 * Toast — minimal notification component.
 * Auto-dismisses after a timeout. Slides in from top-right.
 */

import { useEffect, useState } from "react";
import { COLORS, RADIUS, MOTION } from "~/lib/colors";

export interface ToastData {
  id: string;
  message: string;
  type?: "error" | "success" | "info";
  duration?: number;
}

export function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastData;
  onDismiss: (id: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Slide in
    requestAnimationFrame(() => setVisible(true));

    // Auto-dismiss
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(toast.id), 200);
    }, toast.duration ?? 4000);

    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);

  const colors = {
    error: { bg: COLORS.redDim, border: COLORS.red, text: COLORS.red },
    success: { bg: COLORS.greenDim, border: COLORS.green, text: COLORS.text },
    info: { bg: COLORS.accentDim, border: COLORS.accent, text: COLORS.accentBright },
  };

  const c = colors[toast.type ?? "info"];

  return (
    <div
      style={{
        padding: "12px 16px",
        borderRadius: RADIUS.lg,
        background: COLORS.surface,
        border: `1px solid ${c.border}`,
        fontSize: 13,
        color: c.text,
        display: "flex",
        alignItems: "center",
        gap: 10,
        maxWidth: 380,
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        transform: visible ? "translateX(0)" : "translateX(120%)",
        opacity: visible ? 1 : 0,
        transition: `all ${MOTION.durationSlow} ${MOTION.ease}`,
      }}
    >
      <span style={{ flex: 1, lineHeight: 1.4 }}>{toast.message}</span>
      <button
        onClick={() => {
          setVisible(false);
          setTimeout(() => onDismiss(toast.id), 200);
        }}
        style={{
          background: "transparent",
          border: "none",
          color: COLORS.textDim,
          cursor: "pointer",
          fontSize: 16,
          padding: "0 2px",
          lineHeight: 1,
          fontFamily: "inherit",
        }}
      >
        ×
      </button>
    </div>
  );
}

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
