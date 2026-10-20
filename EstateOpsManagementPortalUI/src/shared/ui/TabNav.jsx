import PropTypes from 'prop-types';
import { NavLink } from 'react-router-dom';

const hasBadge = (item) => item.badge !== undefined && item.badge !== null;

/** Route-based tabs (each tab is a URL). `end` makes the index tab match exactly. */
export default function TabNav({ items, label }) {
  return (
    <nav aria-label={label} className="mb-6 flex gap-1 border-b border-border">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          aria-label={hasBadge(item) ? `${item.label}, ${item.badge}` : undefined}
          className={({ isActive }) =>
            `-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-content-muted hover:text-content'
            }`
          }
        >
          {item.label}
          {hasBadge(item) && (
            <span className="rounded-full bg-tone-danger-bg px-2 py-0.5 text-xs text-tone-danger-fg">
              {item.badge}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

TabNav.propTypes = {
  label: PropTypes.string.isRequired,
  items: PropTypes.arrayOf(
    PropTypes.shape({
      to: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      end: PropTypes.bool,
      badge: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    }),
  ).isRequired,
};
