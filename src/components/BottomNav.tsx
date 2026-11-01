import { NavLink } from 'react-router-dom';
import { Icon, type IconName } from './Icon';

const tabs: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Month', icon: 'overview' },
  { to: '/tx', label: 'Entries', icon: 'list' },
  { to: '/balance', label: 'Balance', icon: 'balance' },
  { to: '/more', label: 'More', icon: 'more' },
];

/** Floating pill: the current tab grows into an orange pill with its label; the others show only their icon. */
export function BottomNav({ onAdd }: { onAdd: () => void }) {
  return (
    <nav className="nav" aria-label="Main">
      <div className="nav-pill">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end>
            <Icon name={t.icon} />
            <span className="nav-label">{t.label}</span>
          </NavLink>
        ))}
      </div>
      <button type="button" className="add" onClick={onAdd} aria-label="Add entry">
        <Icon name="plus" size={28} />
      </button>
    </nav>
  );
}
