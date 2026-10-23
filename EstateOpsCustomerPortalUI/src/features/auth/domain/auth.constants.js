export const LOGIN_PATH = '/login';
export const HOME_PATH = '/';
const TENANT_KEY = 'estateops.tenant';

/** The developer this browser last used, so returning customers do not have to type it. */
export const rememberedTenant = () => {
  try {
    return globalThis.localStorage?.getItem(TENANT_KEY) ?? '';
  } catch {
    return '';
  }
};
export const rememberTenant = (slug) => {
  try {
    if (slug) globalThis.localStorage?.setItem(TENANT_KEY, slug);
  } catch {
    /* storage blocked: the field is simply empty next time */
  }
};
