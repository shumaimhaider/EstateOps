import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * List filters kept in the URL (shareable, survive reload).
 * `keys` maps filter names to URL params, e.g. { search: 'q', projectId: 'project' }.
 * `sortFields` is the allow-list of sortable model fields; sort lives in ?sort=&dir=.
 */
export function useUrlFilters({ keys, sortFields = [] }) {
  const [params, setParams] = useSearchParams();

  const filters = useMemo(() => {
    const values = Object.fromEntries(
      Object.entries(keys).map(([name, param]) => [name, params.get(param) ?? '']),
    );
    const sortField = params.get('sort');
    values.sort = sortFields.includes(sortField)
      ? { field: sortField, dir: params.get('dir') === 'desc' ? 'desc' : 'asc' }
      : undefined;
    return values;
  }, [params, keys, sortFields]);

  const setFilters = useCallback(
    (patch) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [name, value] of Object.entries(patch)) {
            if (name === 'sort') {
              if (value) {
                next.set('sort', value.field);
                next.set('dir', value.dir);
              } else {
                next.delete('sort');
                next.delete('dir');
              }
            } else if (value) next.set(keys[name], value);
            else next.delete(keys[name]);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams, keys],
  );

  return { filters, setFilters };
}
