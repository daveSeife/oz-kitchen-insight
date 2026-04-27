import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Edit, Trash2, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MealDialog } from "@/components/meals/MealDialog";
import { motion } from "framer-motion";

interface Meal {
  id: string; name: string; description: string; base_price: number;
  is_available: boolean; is_chefs_choice: boolean; category_id: string;
  image_url: string; dietary_tags: string[];
}

interface Category { id: string; name: string; description: string; }

const Meals = () => {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null);

  useEffect(() => {
    fetchMeals();
    fetchCategories();
    const channel = supabase
      .channel('meals-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meals' }, () => { fetchMeals(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchMeals = async () => {
    try {
      const { data, error } = await supabase.from("meals").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      setMeals(data || []);
    } catch (error: any) {
      toast.error("Failed to fetch meals");
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase.from("meal_categories").select("*").eq("is_active", true).order("sort_order");
      if (error) throw error;
      setCategories(data || []);
    } catch (error: any) {
      console.error("Failed to fetch categories:", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this meal?")) return;
    try {
      const { error } = await supabase.from("meals").delete().eq("id", id);
      if (error) throw error;
      toast.success("Meal deleted successfully");
    } catch (error: any) {
      toast.error("Failed to delete meal");
    }
  };

  const filteredMeals = meals.filter((meal) => {
    const matchesSearch = meal.name.toLowerCase().includes(search.toLowerCase()) ||
      meal.description?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === "all" || meal.category_id === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const getCategoryName = (categoryId: string) => {
    return categories.find(c => c.id === categoryId)?.name || "Uncategorized";
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="page-header">
            <h1 className="font-heading">Meals</h1>
            <p className="text-muted-foreground mt-1">Manage your meal offerings</p>
          </div>
          <Button onClick={() => { setSelectedMeal(null); setDialogOpen(true); }} className="rounded-xl h-10 px-4 font-semibold bg-gradient-to-r from-primary to-teal-700 shadow-lg shadow-primary/15">
            <Plus className="w-4 h-4 mr-2" /> Add Meal
          </Button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search meals..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 search-input" />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <Button variant={selectedCategory === "all" ? "default" : "outline"} onClick={() => setSelectedCategory("all")} size="sm" className="rounded-full h-8 px-3.5 text-xs font-medium">
              All
            </Button>
            {categories.map((category) => (
              <Button key={category.id} variant={selectedCategory === category.id ? "default" : "outline"} onClick={() => setSelectedCategory(category.id)} size="sm" className="rounded-full h-8 px-3.5 text-xs font-medium">
                {category.name}
              </Button>
            ))}
          </div>
        </div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
          className="rounded-xl border border-border/50 bg-card shadow-card overflow-hidden"
        >
          <Table className="modern-table">
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border/50">
                <TableHead className="w-[72px]">Image</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="hidden md:table-cell">Description</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Tags</TableHead>
                <TableHead className="text-right w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      <p className="text-sm text-muted-foreground">Loading meals...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredMeals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12">
                    <div className="flex flex-col items-center gap-3">
                      <UtensilsCrossed className="w-10 h-10 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">No meals found</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredMeals.map((meal) => (
                  <TableRow key={meal.id} className="border-border/50">
                    <TableCell>
                      {meal.image_url ? (
                        <img src={meal.image_url} alt={meal.name} className="w-12 h-12 rounded-xl object-cover ring-1 ring-border/50" />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center ring-1 ring-border/50">
                          <UtensilsCrossed className="w-4 h-4 text-muted-foreground/50" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-semibold text-foreground">{meal.name}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-full bg-muted/70 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        {getCategoryName(meal.category_id)}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground hidden md:table-cell">{meal.description}</TableCell>
                    <TableCell className="font-semibold tabular-nums">ETB {meal.base_price}</TableCell>
                    <TableCell>
                      <div className="flex gap-1.5 flex-wrap">
                        <span className={`status-badge ${meal.is_available ? 'status-active' : 'status-cancelled'}`}>
                          {meal.is_available ? "Available" : "Unavailable"}
                        </span>
                        {meal.is_chefs_choice && (
                          <span className="status-badge bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
                            Chef's Choice
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex gap-1 flex-wrap">
                        {meal.dietary_tags?.slice(0, 2).map((tag) => (
                          <span key={tag} className="inline-flex items-center rounded-md bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-inset ring-border/50">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-primary" onClick={() => { setSelectedMeal(meal); setDialogOpen(true); }}>
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive" onClick={() => handleDelete(meal.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </motion.div>
      </div>

      <MealDialog open={dialogOpen} onOpenChange={setDialogOpen} meal={selectedMeal} onSuccess={() => { setDialogOpen(false); fetchMeals(); }} />
    </DashboardLayout>
  );
};

export default Meals;
