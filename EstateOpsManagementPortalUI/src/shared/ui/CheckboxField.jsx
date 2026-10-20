import { useId } from 'react';
import PropTypes from 'prop-types';

export default function CheckboxField({ label, className = '', ...inputProps }) {
  const id = useId();
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <input id={id} type="checkbox" className="size-4" {...inputProps} />
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
    </div>
  );
}

CheckboxField.propTypes = { label: PropTypes.string.isRequired, className: PropTypes.string };
