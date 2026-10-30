import { formatCents } from '../lib/money';
import type { SplitMode } from '../lib/split';

export function SplitEditor({ mode, mine, onMode, onMine, myShare, partnerShare, partnerName, error }: {
  mode: SplitMode; mine: string; onMode: (m: SplitMode) => void; onMine: (v: string) => void;
  myShare: number | null; partnerShare: number | null; partnerName: string; error: string | null;
}) {
  return (
    <fieldset className="split">
      <legend>Split</legend>
      <div className="segmented" role="radiogroup" aria-label="How to split">
        {([['equal', '50/50'], ['amounts', 'Amounts'], ['percent', 'Percent']] as const).map(([m, label]) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => onMode(m)}>{label}</button>
        ))}
      </div>
      {mode !== 'equal' && (
        <label className="field">
          <span>Your share {mode === 'percent' ? '(%)' : '($)'}</span>
          <input className="num" inputMode={mode === 'percent' ? 'numeric' : 'decimal'} autoComplete="off"
            value={mine} onChange={(e) => onMine(e.target.value)} aria-invalid={!!error} />
        </label>
      )}
      {error ? <p className="hint error" role="alert">{error}</p> : myShare !== null && partnerShare !== null && (
        <p className="split-preview num" aria-live="polite">
          <span className="you">You {formatCents(myShare)}</span> · <span>{partnerName} {formatCents(partnerShare)}</span>
        </p>
      )}
    </fieldset>
  );
}
