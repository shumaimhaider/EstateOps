import { Building2, LifeBuoy, UserRound } from 'lucide-react';

export const NAV_ITEMS = [
  { to: '/', end: true, labelKey: 'nav.properties', icon: Building2 },
  { to: '/support', end: false, labelKey: 'nav.support', icon: LifeBuoy },
  { to: '/account', end: false, labelKey: 'nav.account', icon: UserRound },
];
