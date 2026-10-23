import PropTypes from 'prop-types';
import { config } from '@/shared/config/config.js';
import StandInCheckoutForm from './StandInCheckoutForm.jsx';
import RealEmbeddedCheckout from './RealEmbeddedCheckout.jsx';

/** Stripe's embedded form, or our stand-in form when VITE_STRIPE_UI=stand_in (a stand-in Stripe server). `onComplete` fires when paid. */
export default function EmbeddedCheckout({ clientSecret, publishableKey, onComplete }) {
  return config.standInStripe ? (
    <StandInCheckoutForm clientSecret={clientSecret} onComplete={onComplete} />
  ) : (
    <RealEmbeddedCheckout
      clientSecret={clientSecret}
      publishableKey={publishableKey}
      onComplete={onComplete}
    />
  );
}

EmbeddedCheckout.propTypes = {
  clientSecret: PropTypes.string.isRequired,
  publishableKey: PropTypes.string.isRequired,
  onComplete: PropTypes.func.isRequired,
};
