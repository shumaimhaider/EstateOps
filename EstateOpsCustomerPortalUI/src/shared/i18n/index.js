import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// One JSON file per namespace (src/locales/<lng>/<ns>.json): common, inventory, ...
const modules = import.meta.glob('../../locales/en/*.json', { eager: true, import: 'default' });
const en = Object.fromEntries(
  Object.entries(modules).map(([path, json]) => [path.split('/').pop().replace('.json', ''), json]),
);

i18n.use(initReactI18next).init({
  resources: { en },
  lng: 'en',
  fallbackLng: 'en',
  ns: Object.keys(en),
  defaultNS: 'common',
  interpolation: { escapeValue: false },
});

export default i18n;
