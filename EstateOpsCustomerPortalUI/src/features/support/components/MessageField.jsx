import { useId } from 'react';
import PropTypes from 'prop-types';
import { CONTROL, LABEL } from '@/shared/ui/fieldStyles.js';

/** Labelled multi-line text box. Takes Formik's field props plus `error`. */
export default function MessageField({ label, error, ...props }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <textarea
        id={id}
        rows={5}
        className={CONTROL}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
MessageField.propTypes = { label: PropTypes.string.isRequired, error: PropTypes.string };
