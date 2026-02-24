import type { ComponentType, SVGProps } from "react";
import {
  Briefcase as BriefcaseRaw,
  ChevronLeft as ChevronLeftRaw,
  ChevronRight as ChevronRightRaw,
  Clock as ClockRaw,
  Coins as CoinsRaw,
  Flame as FlameRaw,
  Home as HomeRaw,
  Moon as MoonRaw,
  Plus as PlusRaw,
  RefreshCw as RefreshCwRaw,
  Search as SearchRaw,
  Settings as SettingsRaw,
  ShieldCheck as ShieldCheckRaw,
  Sun as SunRaw,
  TrendingUp as TrendingUpRaw,
} from "lucide-react";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const asIcon = (icon: unknown) => icon as IconComponent;

export const Briefcase = asIcon(BriefcaseRaw);
export const ChevronLeft = asIcon(ChevronLeftRaw);
export const ChevronRight = asIcon(ChevronRightRaw);
export const Clock = asIcon(ClockRaw);
export const Coins = asIcon(CoinsRaw);
export const Flame = asIcon(FlameRaw);
export const Home = asIcon(HomeRaw);
export const Moon = asIcon(MoonRaw);
export const Plus = asIcon(PlusRaw);
export const RefreshCw = asIcon(RefreshCwRaw);
export const Search = asIcon(SearchRaw);
export const Settings = asIcon(SettingsRaw);
export const ShieldCheck = asIcon(ShieldCheckRaw);
export const Sun = asIcon(SunRaw);
export const TrendingUp = asIcon(TrendingUpRaw);
