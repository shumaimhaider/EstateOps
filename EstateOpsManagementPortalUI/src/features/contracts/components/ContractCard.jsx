import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { ExternalLink, FileText } from 'lucide-react';
import { config } from '@/shared/config/config.js';
import Button from '@/shared/ui/Button.jsx';
import Card from '@/shared/ui/Card.jsx';
import DateTime from '@/shared/ui/DateTime.jsx';
import StatusPill from '@/shared/ui/StatusPill.jsx';
import { CONTRACT_STATUS_META, MOCK_SIGNER_EVENTS } from '../domain/contract.constants.js';
import { contractShape } from '../domain/contract.model.js';
import { formatFileSize } from '../domain/contract.rules.js';

/** One contract version: status, source, and the actions the server allows for this role. */
export default function ContractCard({ contract, busy, onAction, onSimulate }) {
  const { t } = useTranslation('contracts');
  const meta = CONTRACT_STATUS_META[contract.status];
  const can = (action) => contract.allowedActions.includes(action);
  const upload = contract.kind === 'signed_upload';
  const events = config.isMock && !upload ? (MOCK_SIGNER_EVENTS[contract.status] ?? []) : [];

  return (
    <Card as="li" className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <FileText aria-hidden="true" className="mt-0.5 size-5 text-content-muted" />
          <div>
            <h3 className="text-sm font-semibold">
              {contract.title} · {t('version', { number: contract.version })}
            </h3>
            <p className="text-xs text-content-muted">
              {upload
                ? t('source.upload', {
                    file: contract.fileName,
                    size: formatFileSize(contract.fileSize),
                  })
                : t('source.pandadoc', { email: contract.signerEmail })}
            </p>
          </div>
        </div>
        <StatusPill label={t(meta.labelKey)} tone={meta.tone} />
      </div>
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-content-muted">
        {contract.sentAt && (
          <div className="flex gap-1">
            <dt>{t('sentAt')}</dt>
            <dd>
              <DateTime iso={contract.sentAt} />
            </dd>
          </div>
        )}
        {contract.signedAt && (
          <div className="flex gap-1">
            <dt>{t('signedAt')}</dt>
            <dd>
              <DateTime iso={contract.signedAt} />
            </dd>
          </div>
        )}
        {contract.revisionNote && (
          <div className="flex gap-1">
            <dt>{t('revisionNote')}</dt>
            <dd>{contract.revisionNote}</dd>
          </div>
        )}
      </dl>
      <div className="flex flex-wrap gap-2">
        {contract.pandaDocUrl && contract.status !== 'voided' && (
          <a
            href={contract.pandaDocUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold shadow-sm hover:bg-surface-muted"
          >
            <ExternalLink aria-hidden="true" className="size-3.5" />
            {t('actions.openPandaDoc')}
            <span className="sr-only"> {contract.title}</span>
          </a>
        )}
        {can('send') && (
          <Button size="sm" disabled={busy} onClick={() => onAction('send', contract)}>
            {t('actions.send')}
          </Button>
        )}
        {can('revise') && (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => onAction('revise', contract)}
          >
            {t('actions.revise')}
          </Button>
        )}
        {can('void') && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => onAction('void', contract)}
          >
            {t('actions.void')}
          </Button>
        )}
        {events.map((event) => (
          <Button
            key={event}
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => onSimulate(contract, event)}
          >
            {t(`actions.mock.${event}`)}
          </Button>
        ))}
      </div>
    </Card>
  );
}

ContractCard.propTypes = {
  contract: contractShape.isRequired,
  busy: PropTypes.bool,
  onAction: PropTypes.func.isRequired,
  onSimulate: PropTypes.func.isRequired,
};
