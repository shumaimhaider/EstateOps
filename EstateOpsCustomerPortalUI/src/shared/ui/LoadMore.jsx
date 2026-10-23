import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import Button from './Button.jsx';

/** Cursor-pagination footer: renders only while another page exists. */
export default function LoadMore({ hasNextPage, loading, onClick }) {
  const { t } = useTranslation();
  if (!hasNextPage) return null;
  return (
    <div className="mt-4 text-center">
      <Button variant="secondary" loading={loading} onClick={onClick}>
        {t('actions.loadMore')}
      </Button>
    </div>
  );
}

LoadMore.propTypes = {
  hasNextPage: PropTypes.bool,
  loading: PropTypes.bool,
  onClick: PropTypes.func.isRequired,
};
