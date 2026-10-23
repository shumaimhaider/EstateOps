import PropTypes from 'prop-types';

export const contractShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  status: PropTypes.string.isRequired,
  version: PropTypes.number.isRequired,
  canSign: PropTypes.bool.isRequired,
  canDownload: PropTypes.bool.isRequired,
});
