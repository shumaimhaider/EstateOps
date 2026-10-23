import { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import Button from '@/shared/ui/Button.jsx';
import Card from '@/shared/ui/Card.jsx';
import { CONTROL, LABEL } from '@/shared/ui/fieldStyles.js';
import { useToast } from '@/shared/ui/toast/toastContext.js';
import { getErrorInfo } from '@/shared/lib/errors.js';
import { useUploadProjectMapMutation } from '../hooks/useUploadProjectMapMutation.js';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/svg+xml,application/pdf';

/** Upload the developer's site plan image; it shows behind the unit shapes on the map. */
export default function ProjectMapUpload({ projectId, currentName }) {
  const { t } = useTranslation('inventory');
  const toast = useToast();
  const upload = useUploadProjectMapMutation(projectId);
  const fileRef = useRef(null);
  const [problem, setProblem] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setProblem(t('map.upload.chooseFile'));
      return;
    }
    setProblem('');
    try {
      await upload.mutateAsync({ file });
      toast.show({ message: t('map.upload.done'), tone: 'success' });
      fileRef.current.value = '';
    } catch (error) {
      const info = getErrorInfo(error);
      setProblem(info.fieldErrors.file ?? info.message);
    }
  };

  return (
    <Card as="section" aria-labelledby="map-upload-title">
      <h2 id="map-upload-title" className="text-base font-semibold">
        {t('map.upload.title')}
      </h2>
      <p className="mb-3 text-sm text-content-muted">{t('map.upload.hint')}</p>
      {currentName && (
        <p className="mb-3 text-sm">{t('map.upload.current', { name: currentName })}</p>
      )}
      <form onSubmit={submit} noValidate className="flex flex-wrap items-end gap-3">
        <div className="min-w-60 flex-1">
          <label htmlFor="map-file" className={LABEL}>
            {t('map.upload.file')}
          </label>
          <input
            id="map-file"
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            aria-invalid={problem ? true : undefined}
            className={CONTROL}
          />
        </div>
        <Button type="submit" loading={upload.isPending}>
          {upload.isPending ? t('map.upload.uploading') : t('map.upload.button')}
        </Button>
      </form>
      {problem && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {problem}
        </p>
      )}
    </Card>
  );
}

ProjectMapUpload.propTypes = {
  projectId: PropTypes.string.isRequired,
  currentName: PropTypes.string,
};
