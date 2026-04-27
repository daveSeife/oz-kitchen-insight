import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  loading?: boolean;
  gradient?: "primary" | "secondary" | "emerald" | "violet";
}

const gradientClasses: Record<string, { bg: string; icon: string; iconBg: string }> = {
  primary: {
    bg: "stat-gradient-primary",
    icon: "text-primary",
    iconBg: "bg-primary/10 ring-1 ring-primary/20",
  },
  secondary: {
    bg: "stat-gradient-secondary",
    icon: "text-secondary",
    iconBg: "bg-secondary/10 ring-1 ring-secondary/20",
  },
  emerald: {
    bg: "stat-gradient-emerald",
    icon: "text-emerald-600",
    iconBg: "bg-emerald-500/10 ring-1 ring-emerald-500/20",
  },
  violet: {
    bg: "stat-gradient-violet",
    icon: "text-violet-600",
    iconBg: "bg-violet-500/10 ring-1 ring-violet-500/20",
  },
};

export const StatsCard = ({ title, value, icon: Icon, trend, loading, gradient = "primary" }: StatsCardProps) => {
  const colors = gradientClasses[gradient] || gradientClasses.primary;

  if (loading) {
    return (
      <Card className="overflow-hidden border-border/50 shadow-card">
        <CardContent className="p-6">
          <div className="space-y-3">
            <div className="h-4 w-24 rounded-md animate-shimmer" />
            <div className="h-8 w-32 rounded-md animate-shimmer" />
            <div className="h-3 w-20 rounded-md animate-shimmer" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.33, 1, 0.68, 1] }}
    >
      <Card className={`overflow-hidden border-border/50 shadow-card card-hover ${colors.bg}`}>
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">{title}</p>
              <p className="text-2xl lg:text-3xl font-heading font-bold tracking-tight text-foreground">
                {value}
              </p>
              {trend && (
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-0.5 text-emerald-600">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span className="text-xs font-semibold">{trend}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">vs last month</span>
                </div>
              )}
            </div>
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${colors.iconBg}`}>
              <Icon className={`w-5 h-5 ${colors.icon}`} />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};
