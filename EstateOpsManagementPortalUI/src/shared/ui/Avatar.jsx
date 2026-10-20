import PropTypes from 'prop-types';

const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

export default function Avatar({ name, size = 'md' }) {
  const dims = size === 'sm' ? 'size-8 text-xs' : 'size-10 text-sm';
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full bg-primary-soft font-bold text-primary ${dims}`}
    >
      {initials(name)}
    </span>
  );
}

Avatar.propTypes = { name: PropTypes.string.isRequired, size: PropTypes.oneOf(['sm', 'md']) };
