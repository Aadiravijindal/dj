import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { useApp } from '../state/store';

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.kind === 'success' ? <CheckCircle2 size={17} /> : t.kind === 'error' ? <AlertTriangle size={17} /> : <Info size={17} />}
          <span>{t.message}</span>
          {t.action && (
            <button
              className="btn xs"
              onClick={() => {
                t.action!.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button className="btn ghost icon-btn xs" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
