// manifest icon names -> lucide icons. a manifest can only use names from this list,
// anything else falls back to a plain activity line
import {
  Activity, Factory, Globe, HeartPulse, PlugZap, Snowflake, Sun, type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  activity: Activity,
  globe: Globe,
  heart: HeartPulse,
  factory: Factory,
  plug: PlugZap,
  sun: Sun,
  snowflake: Snowflake,
};

export const iconFor = (name?: string): LucideIcon => (name && ICONS[name]) || Activity;
