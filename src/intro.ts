// Opening animation (#intro in index.html): plays on launch, and again when the app comes back after a long
// break (an installed app is often resumed rather than relaunched). Tap to skip. The app loads underneath.
const LENGTH = 1850; // ms, matches the keyframe timings in styles.css
const REPLAY_AFTER = 10 * 60_000;

export function startIntro() {
  const intro = document.getElementById('intro');
  if (!intro) return;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timer = 0;

  const finish = () => {
    clearTimeout(timer);
    if (intro.hidden || intro.classList.contains('leaving')) return;
    intro.classList.add('leaving');
    // animationend doesn't fire with Reduce Motion (animations are off), so hide on a timer instead.
    timer = window.setTimeout(() => { intro.hidden = true; intro.classList.remove('leaving'); }, still ? 0 : 340);
  };
  const play = () => {
    clearTimeout(timer);
    intro.hidden = false;
    intro.classList.remove('play', 'leaving');
    void intro.offsetWidth; // restart the CSS animations
    intro.classList.add('play');
    timer = window.setTimeout(finish, still ? 500 : LENGTH);
  };

  intro.addEventListener('click', finish);
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > REPLAY_AFTER) play();
  });
  play();
}
