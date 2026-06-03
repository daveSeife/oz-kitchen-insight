import React, { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import Meals from "./pages/Meals";
import Orders, { ORDERS_QUERY_KEY } from "./pages/Orders";
import Users from "./pages/Users";
import Referrals from "./pages/Referrals";
import Partners from "./pages/Partners";
import Payments from "./pages/Payments";
import PartnerDashboard from "./pages/PartnerDashboard";
import NotFound from "./pages/NotFound";
import { supabase } from "@/integrations/supabase/client";

const queryClient = new QueryClient();

const OrdersCacheSync = () => {
  const appQueryClient = useQueryClient();

  useEffect(() => {
    const invalidateOrders = () => {
      void appQueryClient.invalidateQueries({ queryKey: ORDERS_QUERY_KEY });
    };

    const channel = supabase
      .channel("app-orders-cache-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => invalidateOrders())
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => invalidateOrders())
      .on("postgres_changes", { event: "*", schema: "public", table: "order_meals" }, () => invalidateOrders())
      .subscribe();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        void appQueryClient.removeQueries({ queryKey: ORDERS_QUERY_KEY });
      }
    });

    return () => {
      void supabase.removeChannel(channel);
      subscription.unsubscribe();
    };
  }, [appQueryClient]);

  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <OrdersCacheSync />
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/meals" element={<Meals />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/users" element={<Users />} />
          <Route path="/referrals" element={<Referrals />} />
          <Route path="/partners" element={<Partners />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/partner-dashboard" element={<PartnerDashboard />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
