import { X } from 'lucide-react';

interface DemoModeToastProps {
  onDismiss: () => void;
}

/**
 * role="status" rather than role="alert": this is standing information about
 * where the data comes from, not an error, and it should never interrupt a
 * screen reader mid-sentence.
 *
 * It appears whenever the gateway returned no runs or could not be reached. An
 * operator must never mistake sample runs for real recon results.
 */
export function DemoModeToast({ onDismiss }: DemoModeToastProps) {
  return (
    <div className="rt-toast" role="status">
      <div className="rt-toast-body">
        <p className="rt-toast-title">Demo Mode</p>
        <p className="rt-toast-text">
          No runs returned by the gateway — showing sample data. Dispatch a workflow to
          see real results.
        </p>
      </div>
      <button
        type="button"
        className="rt-icon-button"
        aria-label="Dismiss Demo Mode notice"
        onClick={onDismiss}
      >
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
