import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";

interface MealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meal: any | null;
  onSuccess: () => void;
}

export const MealDialog = ({ open, onOpenChange, meal, onSuccess }: MealDialogProps) => {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    base_price: "",
    category_id: "",
    is_available: true,
    is_chefs_choice: false,
    image_url: "",
    dietary_tags: "",
    ingredients: "",
  });
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    if (meal) {
      setFormData({
        name: meal.name || "",
        description: meal.description || "",
        base_price: meal.base_price?.toString() || "",
        category_id: meal.category_id || "",
        is_available: meal.is_available ?? true,
        is_chefs_choice: meal.is_chefs_choice ?? false,
        image_url: meal.image_url || "",
        dietary_tags: meal.dietary_tags?.join(", ") || "",
        ingredients: meal.ingredients?.join(", ") || "",
      });
      setImagePreview(meal.image_url || null);
    } else {
      setFormData({
        name: "",
        description: "",
        base_price: "",
        category_id: "",
        is_available: true,
        is_chefs_choice: false,
        image_url: "",
        dietary_tags: "",
        ingredients: "",
      });
      setImagePreview(null);
    }
    setImageFile(null);
  }, [meal, open]);

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from("meal_categories")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      setCategories(data || []);
    } catch (error: any) {
      console.error("Failed to fetch categories:", error);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!imageFile) return formData.image_url || null;

    try {
      const fileExt = imageFile.name.split(".").pop();
      const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("meal-images")
        .upload(filePath, imageFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("meal-images")
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error: any) {
      console.error("Image upload error:", error);
      toast.error("Failed to upload image");
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const imageUrl = await uploadImage();

      const mealData = {
        name: formData.name,
        description: formData.description,
        base_price: parseFloat(formData.base_price),
        category_id: formData.category_id || null,
        is_available: formData.is_available,
        is_chefs_choice: formData.is_chefs_choice,
        image_url: imageUrl,
        dietary_tags: formData.dietary_tags
          ? formData.dietary_tags.split(",").map((tag) => tag.trim())
          : null,
        ingredients: formData.ingredients
          ? formData.ingredients.split(",").map((ing) => ing.trim())
          : null,
      };

      if (meal) {
        const { error } = await supabase
          .from("meals")
          .update(mealData)
          .eq("id", meal.id);
        if (error) throw error;
        toast.success("Meal updated successfully");
      } else {
        const { error } = await supabase.from("meals").insert(mealData);
        if (error) throw error;
        toast.success("Meal created successfully");
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to save meal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{meal ? "Edit Meal" : "Add New Meal"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category_id">Category</Label>
            <Select
              value={formData.category_id}
              onValueChange={(value) => setFormData({ ...formData, category_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="base_price">Price (ETB) *</Label>
              <Input
                id="base_price"
                type="number"
                step="0.01"
                value={formData.base_price}
                onChange={(e) => setFormData({ ...formData, base_price: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="is_available">Available</Label>
              <div className="flex items-center h-10">
                <Switch
                  id="is_available"
                  checked={formData.is_available}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_available: checked })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="is_chefs_choice">Chef's Choice</Label>
              <div className="flex items-center h-10">
                <Switch
                  id="is_chefs_choice"
                  checked={formData.is_chefs_choice}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_chefs_choice: checked })
                  }
                />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Meal Image</Label>
            <div className="flex items-center gap-4">
              {imagePreview && (
                <div className="relative w-32 h-32 rounded-lg overflow-hidden border">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setImageFile(null);
                      setImagePreview(null);
                      setFormData({ ...formData, image_url: "" });
                    }}
                    className="absolute top-1 right-1 p-1 bg-destructive text-destructive-foreground rounded-full hover:bg-destructive/90"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              <div className="flex-1">
                <Input
                  id="image"
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => document.getElementById("image")?.click()}
                  className="w-full"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {imagePreview ? "Change Image" : "Upload Image"}
                </Button>
                <p className="text-xs text-muted-foreground mt-1">
                  JPG, PNG or WEBP (max 5MB)
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dietary_tags">Dietary Tags (comma-separated)</Label>
            <Input
              id="dietary_tags"
              placeholder="vegetarian, gluten-free"
              value={formData.dietary_tags}
              onChange={(e) => setFormData({ ...formData, dietary_tags: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ingredients">Ingredients (comma-separated)</Label>
            <Textarea
              id="ingredients"
              placeholder="chicken, rice, vegetables"
              value={formData.ingredients}
              onChange={(e) => setFormData({ ...formData, ingredients: e.target.value })}
              rows={2}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : meal ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
