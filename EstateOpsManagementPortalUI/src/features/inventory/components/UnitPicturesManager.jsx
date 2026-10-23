import { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import Button from '@/shared/ui/Button.jsx';
import Card from '@/shared/ui/Card.jsx';
import ConfirmDialog from '@/shared/ui/ConfirmDialog.jsx';
import { CONTROL, LABEL } from '@/shared/ui/fieldStyles.js';
import { useToast } from '@/shared/ui/toast/toastContext.js';
import { getErrorInfo } from '@/shared/lib/errors.js';
import {
  useAddUnitPictureMutation,
  useRemoveUnitPictureMutation,
} from '../hooks/useUnitPictureMutations.js';

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

/** Add and remove a unit's pictures (flats, shops, villas). The file goes straight to storage. */
export default function UnitPicturesManager({ unit }) {
  const { t } = useTranslation('inventory');
  const toast = useToast();
  const add = useAddUnitPictureMutation(unit.id);
  const remove = useRemoveUnitPictureMutation(unit.id);
  const fileRef = useRef(null);
  const [kind, setKind] = useState('image');
  const [caption, setCaption] = useState('');
  const [problem, setProblem] = useState('');
  const [toRemove, setToRemove] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setProblem(t('detail.media.chooseFile'));
      return;
    }
    setProblem('');
    try {
      await add.mutateAsync({ file, kind, caption: caption.trim() });
      toast.show({ message: t('detail.media.uploaded'), tone: 'success' });
      fileRef.current.value = '';
      setCaption('');
    } catch (error) {
      const info = getErrorInfo(error);
      setProblem(info.fieldErrors.file ?? info.message);
    }
  };

  const confirmRemove = async () => {
    try {
      await remove.mutateAsync(toRemove.id);
      toast.show({ message: t('detail.media.removed'), tone: 'success' });
    } catch (error) {
      toast.show({ message: getErrorInfo(error).message, tone: 'danger' });
    } finally {
      setToRemove(null);
    }
  };

  return (
    <Card as="section" aria-labelledby="unit-media-manage">
      <h2 id="unit-media-manage" className="mb-3 text-base font-semibold">
        {t('detail.media.title')}
      </h2>
      <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="unit-media-file" className={LABEL}>
            {t('detail.media.file')}
          </label>
          <input
            id="unit-media-file"
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            aria-describedby="unit-media-hint"
            aria-invalid={problem ? true : undefined}
            className={CONTROL}
          />
          <p id="unit-media-hint" className="mt-1 text-xs text-content-muted">
            {t('detail.media.fileHint')}
          </p>
          {problem && (
            <p role="alert" className="mt-1 text-sm text-danger">
              {problem}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="unit-media-kind" className={LABEL}>
            {t('detail.media.kind')}
          </label>
          <select
            id="unit-media-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className={CONTROL}
          >
            <option value="image">{t('detail.media.kinds.image')}</option>
            <option value="floor_plan">{t('detail.media.kinds.floor_plan')}</option>
          </select>
        </div>
        <div>
          <label htmlFor="unit-media-caption" className={LABEL}>
            {t('detail.media.caption')}
          </label>
          <input
            id="unit-media-caption"
            value={caption}
            maxLength={120}
            onChange={(e) => setCaption(e.target.value)}
            className={CONTROL}
          />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" loading={add.isPending}>
            {add.isPending ? t('detail.media.uploading') : t('detail.media.upload')}
          </Button>
        </div>
      </form>
      {unit.media.length > 0 && (
        <ul className="mt-5 divide-y divide-border">
          {unit.media.map((m) => {
            const name = m.caption || m.fileName || m.id;
            return (
              <li key={m.id} className="flex items-center gap-3 py-2">
                <img src={m.url} alt="" className="h-12 w-20 rounded-lg object-cover" />
                <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('detail.media.remove', { name })}
                  onClick={() => setToRemove(m)}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={Boolean(toRemove)}
        danger
        title={t('detail.media.removeTitle')}
        message={t('detail.media.removeMessage')}
        pending={remove.isPending}
        onConfirm={confirmRemove}
        onCancel={() => setToRemove(null)}
      />
    </Card>
  );
}

UnitPicturesManager.propTypes = {
  unit: PropTypes.shape({
    id: PropTypes.string.isRequired,
    media: PropTypes.arrayOf(PropTypes.object).isRequired,
  }).isRequired,
};
