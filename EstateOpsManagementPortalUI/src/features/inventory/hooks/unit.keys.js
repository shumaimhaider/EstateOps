/** Query key factory for units and projects. */
export const unitKeys = {
  all: ['units'],
  lists: () => [...unitKeys.all, 'list'],
  list: (filters) => [...unitKeys.lists(), filters],
  details: () => [...unitKeys.all, 'detail'],
  detail: (id) => [...unitKeys.details(), id],
};

export const projectKeys = {
  all: ['projects'],
  list: () => [...projectKeys.all, 'list'],
};
