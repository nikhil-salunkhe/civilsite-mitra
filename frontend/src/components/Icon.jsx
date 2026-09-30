import React from 'react';
import {
  Home, Building2, Users, User, UserPlus, Plus, Check, CheckCircle2, X,
  PauseCircle, Ban, PlayCircle, Flag, BarChart3, TrendingUp, ClipboardList,
  FileText, Settings, AlertTriangle, Search, Bell, LogOut, Menu, IndianRupee,
  Wallet, CalendarDays, MapPin, Crosshair, ExternalLink, LocateFixed, Loader2,
} from 'lucide-react';

/**
 * ---------------------------------------------------------------------------
 * Icon - single source of truth for UI iconography.
 * ---------------------------------------------------------------------------
 * Thin wrapper around lucide-react (the same library the dashboards already
 * import directly) so pages may also pass a semantic icon NAME as a string -
 * e.g. nav items and stat cards keep declarative config like { icon: 'users' }.
 *
 *   <Icon name="building" />                 20px, inherits currentColor
 *   <Icon name="x" size={16} className="text-danger-600" />
 *
 * Rules enforced by tools/design-audit.mjs:
 *  - no emoji as icons (they render differently per OS, cannot be colored);
 *  - new icon names must be registered here, not hand-rolled SVG paths.
 * Icons are aria-hidden unless a `title` is passed.
 */
const ICONS = {
  home: Home,
  building: Building2,
  users: Users,
  user: User,
  userPlus: UserPlus,
  plus: Plus,
  check: Check,
  checkCircle: CheckCircle2,
  x: X,
  pause: PauseCircle,
  ban: Ban,
  play: PlayCircle,
  flag: Flag,
  chartBar: BarChart3,
  trendingUp: TrendingUp,
  clipboard: ClipboardList,
  document: FileText,
  cog: Settings,
  alertTriangle: AlertTriangle,
  search: Search,
  bell: Bell,
  logout: LogOut,
  menu: Menu,
  rupee: IndianRupee,
  wallet: Wallet,
  calendar: CalendarDays,
  mapPin: MapPin,
  crosshair: Crosshair,
  externalLink: ExternalLink,
  locate: LocateFixed,
  loader: Loader2,
};

export const ICON_NAMES = Object.keys(ICONS);

export function Icon({ name, size = 20, strokeWidth = 1.8, className = '', title }) {
  const Cmp = ICONS[name];
  if (!Cmp) return null;
  return <Cmp size={size} strokeWidth={strokeWidth} className={className} title={title} />;
}

export default Icon;
