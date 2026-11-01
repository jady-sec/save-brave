/** Launch screen while the app checks the sign-in and loads your numbers. index.html carries the same markup,
 *  animated, so it appears before this code loads; this copy stays still so the animation doesn't replay. */
export function Splash() {
  return (
    <div className="splash" role="status" aria-label="Loading Save Brave">
      <Coins />
      <p className="splash-name">Save Brave</p>
      <p className="splash-tag">Spend together. Save together.</p>
    </div>
  );
}

/** The app's mark (also public/*.png): two coins, the two of you, with the shared middle in white. */
export function Coins() {
  return (
    <svg viewBox="0 0 96 96" aria-hidden="true">
      <circle className="coin-l" cx="39" cy="52" r="22" fill="#111" />
      <circle className="coin-r" cx="63" cy="52" r="22" fill="#111" />
      <circle className="coin-l" cx="36" cy="48" r="22" fill="#2fd2b9" stroke="#111" strokeWidth="4" />
      <circle className="coin-r" cx="60" cy="48" r="22" fill="#b98cff" stroke="#111" strokeWidth="4" />
      <path className="lens" d="M48 29.6a22 22 0 0 1 0 36.8a22 22 0 0 1 0-36.8z" fill="#fff" stroke="#111" strokeWidth="4" />
    </svg>
  );
}
