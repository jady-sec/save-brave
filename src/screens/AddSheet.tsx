import { useEffect, useRef } from 'react';

// Native modal <dialog>: traps focus and makes the page inert. Unmounting closes it;
// Escape arrives as 'cancel', which we route to onClose instead of relying on the 'close' event.
export function AddSheet({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    const onCancel = (e: Event) => { e.preventDefault(); onClose(); };
    d.addEventListener('cancel', onCancel);
    d.showModal();
    return () => { d.removeEventListener('cancel', onCancel); d.close(); };
  }, [onClose]);
  return (
    <dialog className="sheet" aria-labelledby="add-title" ref={ref}
      onClick={(e) => e.target === ref.current && onClose()}>
      <h2 id="add-title">Add entry</h2>
      <p className="muted">Quick add arrives in milestone 4.</p>
      <button type="button" className="btn" onClick={onClose}>Close</button>
    </dialog>
  );
}
