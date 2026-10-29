import { NavLink } from 'react-router-dom';
import { Icon, type IconName } from './Icon';

const tabs: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Month', icon: 'overview' },
  { to: '/tx', label: 'Entries', icon: 'list' },
  { to: '/balance', label: 'Balance', icon: 'balance' },
  { to: '/more', label: 'More', icon: 'more' },
];

export function BottomNav({ onAdd }: { onAdd: () => void }) {
  const link = (t: (typeof tabs)[number]) => (
    <NavLink key={t.to} to={t.to} end>
      <Icon name={t.icon} />
      {t.label}
    </NavLink>
  );
  return (
    <nav className="nav" aria-label="Main">
      {tabs.slice(0, 2).map(link)}
      <button type="button" className="add" onClick={onAdd} aria-label="Add entry">
        <Icon name="plus" size={28} />
      </button>
      {tabs.slice(2).map(link)}
    </nav>
  );
}
