import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { celebrate } from '../components/Celebration';
import { Jar } from '../components/Splash';
import { friendlyError, listContributions, listPlans, listTransactionsRange } from '../lib/api';
import { cached } from '../lib/cache';
import { formatCents } from '../lib/money';
import { addMonths, monthKey, todayLocal } from '../lib/month';
import { monthRecap, type Recap } from '../lib/recap';
import { useMe } from '../me';
import { monthLabel } from './Transactions';

export const recapSeenKey = (userId: string, month: string) => `saveBrave:recapSeen:${userId}:${month}`;
export const lastMonth = () => addMonths(monthKey(todayLocal()), -1);

/** Month in review, story style: tap the right side for the next card, the left side to go back. */
export function RecapScreen() {
  const { me, categories } = useMe();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const asked = params.get('m');
  const month = asked && /^\d{4}-(0[1-9]|1[0-2])$/.test(asked) ? asked : lastMonth();
  const [recap, setRecap] = useState<Recap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const cheered = useRef(false);

  useEffect(() => {
    if (!me) return;
    try { localStorage.setItem(recapSeenKey(me.userId, month), '1'); } catch { /* private mode */ }
    Promise.all([
      cached(`${me.userId}:recap:${month}`, () => listTransactionsRange(addMonths(month, -3), month)),
      cached(`${me.userId}:plans:me`, () => listPlans('me')),
      cached(`${me.userId}:goal-contributions`, listContributions),
    ]).then(([t, p, c]) => {
      const r = monthRecap(me.userId, t.data, p.data, c.data, month);
      setRecap(r);
      if (r.target !== null && r.target > 0 && r.saved >= r.target && !cheered.current) { cheered.current = true; celebrate('Savings target hit!'); }
    }).catch((e) => setError(friendlyError(e.message)));
  }, [me?.userId, month]); // eslint-disable-line react-hooks/exhaustive-deps -- not `me`: it changes on every refresh

  const close = () => navigate('/', { replace: true });
  const name = (id: string) => categories.find((c) => c.id === id)?.name ?? 'One category';
  const label = monthLabel(month).split(' ')[0];

  const cards: { tone: string; body: React.ReactNode }[] = !recap ? [] : [
    { tone: 'c-orange', body: <>
      <Jar />
      <p className="story-kicker">Your {label}</p>
      <p className="story-big num">{recap.saved >= 0 ? `You saved ${formatCents(recap.saved)}` : `You spent ${formatCents(-recap.saved)} more than you earned`}</p>
      {recap.target !== null && <p className="story-sub">{recap.saved >= recap.target ? `Target of ${formatCents(recap.target)}: hit it` : `Target was ${formatCents(recap.target)}. Next month!`}</p>}
    </> },
    { tone: 'c-teal', body: recap.top ? <>
      <p className="story-kicker">Where most of it went</p>
      <p className="story-big">{name(recap.top.category_id)}</p>
      <p className="story-sub num">{formatCents(recap.top.cents)} of your {formatCents(recap.spent)}</p>
    </> : <><p className="story-kicker">Spending</p><p className="story-big">A quiet month</p><p className="story-sub">No spending recorded.</p></> },
    { tone: 'c-purple', body: recap.jump ? <>
      <p className="story-kicker">Biggest jump</p>
      <p className="story-big">{name(recap.jump.category_id)}</p>
      <p className="story-sub">up {recap.jump.change}% on your usual</p>
    </> : <><p className="story-kicker">Steady</p><p className="story-big">No big jumps</p><p className="story-sub">Every category stayed near its usual.</p></> },
    ...(recap.goals > 0 ? [{ tone: 'c-yellow', body: <>
      <p className="story-kicker">Saving toward goals</p>
      <p className="story-big num">{formatCents(recap.goals)}</p>
      <p className="story-sub">went into your goals in {label}</p>
    </> }] : []),
    { tone: 'c-blue', body: <>
      <p className="story-kicker">{recap.entries} {recap.entries === 1 ? 'entry' : 'entries'} logged</p>
      <p className="story-big">See you in {monthLabel(addMonths(month, 1)).split(' ')[0]}</p>
      <button type="button" className="btn primary" onClick={close}>Let’s go</button>
    </> },
  ];
  const card = cards[Math.min(i, cards.length - 1)];

  return (
    <div className={`story ${card?.tone ?? 'c-orange'}`} role="dialog" aria-modal="true" aria-label={`${monthLabel(month)} in review`}>
      <div className="story-bar" aria-hidden="true">{cards.map((_, k) => <span key={k} className={k <= i ? 'on' : ''} />)}</div>
      <button type="button" className="btn icon story-close" onClick={close} aria-label="Close recap">✕</button>
      {error ? <p className="story-sub">{error}</p> : !card ? <p className="story-sub">Loading…</p> : (
        <div className="story-card" key={i}>{card.body}</div>
      )}
      {card && i > 0 && <button type="button" className="story-tap left" aria-label="Previous" onClick={() => setI(i - 1)} />}
      {card && i < cards.length - 1 && <button type="button" className="story-tap right" aria-label="Next" onClick={() => setI(i + 1)} />}
    </div>
  );
}
