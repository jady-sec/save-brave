// Opening animation (#intro in index.html): plays once when the app starts. A reload in the same session
// (pull-to-refresh, an app update applying itself) skips it; sessionStorage is cleared when the app is closed.
// Tap to skip.
const LENGTH = 1850; // ms, matches the keyframe timings in styles.css
const PLAYED = 'introPlayed';

export function startIntro() {
  const intro = document.getElementById('intro');
  if (!intro) return;
  let played = false;
  try { played = sessionStorage.getItem(PLAYED) === '1'; sessionStorage.setItem(PLAYED, '1'); } catch { /* private mode: just play */ }
  if (played) { intro.hidden = true; return; }

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  intro.classList.add('play');
  let timer = 0;
  const finish = () => {
    clearTimeout(timer);
    if (intro.hidden || intro.classList.contains('leaving')) return;
    intro.classList.add('leaving');
    // animationend doesn't fire with Reduce Motion (animations are off), so hide on a timer instead.
    timer = window.setTimeout(() => { intro.hidden = true; intro.classList.remove('leaving'); }, still ? 0 : 340);
  };
  intro.addEventListener('click', finish);
  timer = window.setTimeout(finish, still ? 500 : LENGTH);
}
