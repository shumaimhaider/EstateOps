import { useId } from 'react';
import PropTypes from 'prop-types';
import { CONTROL, LABEL } from './fieldStyles.js';

/** Labelled input. Pass Formik's `getFieldProps(name)` plus `error` (only when touched). */
export default function TextField({ label, error, hint, className = '', ...inputProps }) {
  const id = useId();
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ');
  return (
    <div className={className}>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <input
        id={id}
        className={CONTROL}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy || undefined}
        {...inputProps}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-content-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

TextField.propTypes = {
  label: PropTypes.string.isRequired,
  error: PropTypes.string,
  hint: PropTypes.string,
  className: PropTypes.string,
};
