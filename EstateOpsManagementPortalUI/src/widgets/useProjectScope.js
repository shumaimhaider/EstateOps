import { useSearchParams } from 'react-router-dom';

/** The selected project scope ('' = all projects) kept in the URL as ?project=. */
export function useProjectScope() {
  const [params, setParams] = useSearchParams();
  const projectId = params.get('project') ?? '';
  const setProjectId = (id) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set('project', id);
        else next.delete('project');
        return next;
      },
      { replace: true },
    );
  return [projectId, setProjectId];
}
