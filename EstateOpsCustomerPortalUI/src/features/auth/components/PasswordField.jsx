import PropTypes from 'prop-types';
import TextField from '@/shared/ui/TextField.jsx';

/** A password input with the browser's password-manager hints set for new or current passwords. */
export default function PasswordField({ current = false, ...props }) {
  return (
    <TextField
      type="password"
      autoComplete={current ? 'current-password' : 'new-password'}
      {...props}
    />
  );
}
PasswordField.propTypes = { current: PropTypes.bool };
