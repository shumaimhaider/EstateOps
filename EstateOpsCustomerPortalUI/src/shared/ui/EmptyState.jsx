import PropTypes from 'prop-types';

export default function EmptyState({ title, body, action }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
      <h2 className="text-base font-semibold">{title}</h2>
      {body && <p className="mt-1 text-sm text-content-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

EmptyState.propTypes = {
  title: PropTypes.string.isRequired,
  body: PropTypes.string,
  action: PropTypes.node,
};
