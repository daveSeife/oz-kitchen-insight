import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";

interface RevenueData { name: string; revenue: number; }
interface RevenueChartProps { data: RevenueData[]; loading?: boolean; }

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card/95 backdrop-blur-md border border-border/50 rounded-xl px-4 py-3 shadow-elevated">
        <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
        <p className="text-sm font-heading font-bold text-foreground">
          ETB {payload[0].value.toLocaleString()}
        </p>
      </div>
    );
  }
  return null;
};

export const RevenueChart = ({ data, loading }: RevenueChartProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
    >
      <Card className="border-border/50 shadow-card overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-heading text-lg">Revenue Trend</CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">Last 6 months</p>
            </div>
            <div className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
              <TrendingUp className="w-3.5 h-3.5" />
              <span className="text-xs font-semibold">Growth</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          {loading ? (
            <div className="h-[280px] flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(174, 62%, 22%)" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="hsl(174, 62%, 22%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} vertical={false} />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} dy={8} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} cursor={false} />
                <Area type="monotone" dataKey="revenue" stroke="hsl(174, 62%, 22%)" strokeWidth={2.5} fill="url(#revenueGradient)" dot={false} activeDot={{ r: 5, fill: "hsl(var(--primary))", stroke: "white", strokeWidth: 2.5 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};
