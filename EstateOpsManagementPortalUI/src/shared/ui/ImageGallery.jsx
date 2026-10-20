import { useState } from 'react';
import PropTypes from 'prop-types';

/** Main picture plus keyboard-operable thumbnails. images: [{ id, url, caption }]. */
export default function ImageGallery({ images, label }) {
  const [activeId, setActiveId] = useState(images[0]?.id);
  const active = images.find((i) => i.id === activeId) ?? images[0];
  if (!active) return null;
  return (
    <div role="group" aria-label={label}>
      <figure className="overflow-hidden rounded-2xl border border-border bg-surface-muted">
        <img src={active.url} alt={active.caption} className="aspect-[16/10] w-full object-cover" />
        <figcaption className="px-4 py-2 text-sm text-content-muted">{active.caption}</figcaption>
      </figure>
      <ul className="mt-3 grid grid-cols-4 gap-2">
        {images.map((image) => (
          <li key={image.id}>
            <button
              type="button"
              onClick={() => setActiveId(image.id)}
              aria-pressed={image.id === active.id}
              aria-label={image.caption}
              className={`block w-full overflow-hidden rounded-xl border-2 ${
                image.id === active.id ? 'border-primary' : 'border-transparent'
              }`}
            >
              <img src={image.url} alt="" className="aspect-[16/10] w-full object-cover" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

ImageGallery.propTypes = {
  label: PropTypes.string.isRequired,
  images: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      url: PropTypes.string.isRequired,
      caption: PropTypes.string.isRequired,
    }),
  ).isRequired,
};
