import PropTypes from 'prop-types';

/** Surface container used across pages. `padded={false}` for tables that bleed to the edge. */
export default function Card({
  as: Tag = 'div',
  padded = true,
  className = '',
  children,
  ...rest
}) {
  return (
    <Tag
      className={`rounded-2xl border border-border bg-surface shadow-token ${padded ? 'p-5' : ''} ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}

Card.propTypes = {
  as: PropTypes.elementType,
  padded: PropTypes.bool,
  className: PropTypes.string,
  children: PropTypes.node,
};
