/** Launch screen while the app checks the sign-in and loads your numbers. index.html carries the same markup,
 *  animated, so it appears before this code loads; this copy stays still so the animation doesn't replay. */
export function Splash() {
  return (
    <div className="splash" role="status" aria-label="Loading Save Brave">
      <Jar />
      <p className="splash-name">Save Brave</p>
      <p className="splash-tag">Spend together. Save together.</p>
    </div>
  );
}

/** The app's mark (also public/*.png): a shared savings jar with a coin each and one saved together. */
export function Jar() {
  return (
    <svg viewBox="0 0 96 96" aria-hidden="true">
      <rect x="30" y="27" width="42" height="52" rx="12" fill="#111" />
      <rect x="27" y="24" width="42" height="52" rx="12" fill="#fff" stroke="#111" strokeWidth="4" />
      <circle className="coin c1" cx="40" cy="64" r="8" fill="#2fd2b9" stroke="#111" strokeWidth="3" />
      <circle className="coin c2" cx="56" cy="64" r="8" fill="#b98cff" stroke="#111" strokeWidth="3" />
      <circle className="coin c3" cx="48" cy="50" r="8" fill="#ffd23f" stroke="#111" strokeWidth="3" />
      <rect x="31" y="16" width="34" height="10" rx="4" fill="#b98cff" stroke="#111" strokeWidth="3.5" />
    </svg>
  );
}
