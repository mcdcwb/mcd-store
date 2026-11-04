export type Size = string;
export interface ProductColor {
  id: number; colorName: string; colorValue: string; imageUrl: string; images: string[];
  variants: { id: number; value: string; stock: number }[];
}
export interface Product {
  inCarousel: boolean;
  colors: ProductColor[];
  colorId: number;
  id: number;
  name: string;
  description: string;
  price: number;
  public: string;
  category: string;
  categoryId?: number;
  isPublished: boolean;
  imageUrl: string;
  images: string[];
  badge?: string;
  badgeBackgroundColor?: string;
  badgeTextColor?: string;
  color: { name: string; value: string };
  sizes: Size[];
  variants: { value: string; stock: number }[];
}

export const productImagePlaceholder = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#eeeae4"/><text x="400" y="500" text-anchor="middle" fill="#666" font-size="28">Imagem indisponível</text></svg>');

export function selectProductColor(product: Product, colorId: number): Product {
  const color = product.colors.find(c => c.id === colorId);
  if (!color) throw new Error("Cor indisponível.");
  return { ...product, colorId: color.id, color: { name: color.colorName, value: color.colorValue },
    images: color.images, imageUrl: color.imageUrl, variants: color.variants, sizes: color.variants.map(v => v.value) };
}
export function adaptProduct(value: unknown): Product {
  if (!value || typeof value !== "object") throw new Error("Produto inválido.");
  const p = value as Record<string, unknown>;
  const category = typeof p.category === "object" && p.category !== null ? p.category as { id: number; name: string } : null;
  const categoryName = category?.name ?? p.category;
  const categoryId = category?.id ?? p.categoryId;
  if (category && (!Number.isSafeInteger(categoryId) || Number(categoryId) <= 0 || typeof categoryName !== "string")) throw new Error("Categoria inválida.");
  const price = typeof p.price === "string" && p.price.trim() ? Number(p.price) : p.price;
  if (!Number.isSafeInteger(p.id) || Number(p.id) <= 0 || typeof p.name !== "string" ||
      typeof price !== "number" || !Number.isFinite(price) || price <= 0 ||
      typeof p.public !== "string" || typeof categoryName !== "string" || !Array.isArray(p.colors) || !p.colors.length)
    throw new Error("Produto inválido.");
  const colors: ProductColor[] = p.colors.map((raw: unknown) => {
    if (!raw || typeof raw !== "object") throw new Error("Cor inválida.");
    const c = raw as Record<string, unknown>;
    if (!Number.isSafeInteger(c.id) || Number(c.id) <= 0 || typeof c.colorName !== "string" || typeof c.colorValue !== "string" ||
        !Array.isArray(c.variants) || !Array.isArray(c.images) || !c.images.every(i => typeof i === "string")) throw new Error("Cor inválida.");
    const variants = c.variants.map((raw: unknown) => {
      if (!raw || typeof raw !== "object") throw new Error("Variante inválida.");
      const v = raw as Record<string, unknown>;
      if (!Number.isSafeInteger(v.id) || Number(v.id) <= 0 || typeof v.value !== "string" || !v.value.trim() || !Number.isSafeInteger(v.stock) || Number(v.stock) < 0) throw new Error("Variante inválida.");
      return { id: v.id as number, value: v.value, stock: v.stock as number };
    });
    if (new Set(variants.map(v => v.value)).size !== variants.length) throw new Error("Variante duplicada.");
    const images = [...new Set([...(typeof c.imageUrl === "string" && c.imageUrl.trim() ? [c.imageUrl] : []), ...c.images.filter(i => i.trim())])];
    if (!images.length) images.push(productImagePlaceholder);
    return { id: c.id as number, colorName: c.colorName, colorValue: c.colorValue, images, imageUrl: images[0], variants };
  });
  if (new Set(colors.map(c => c.id)).size !== colors.length) throw new Error("Cor duplicada.");
  const first = colors[0];
  return { id: p.id as number, name: p.name, price, public: p.public, category: categoryName, categoryId: categoryId as number | undefined, isPublished: p.isPublished !== false, inCarousel: p.inCarousel === true,
    description: typeof p.description === "string" ? p.description : "", badge: typeof p.badge === "string" ? p.badge : undefined,
    badgeBackgroundColor: typeof p.badgeBackgroundColor === "string" && /^#[0-9a-f]{6}$/i.test(p.badgeBackgroundColor) ? p.badgeBackgroundColor : "#2457A7",
    badgeTextColor: typeof p.badgeTextColor === "string" && /^#[0-9a-f]{6}$/i.test(p.badgeTextColor) ? p.badgeTextColor : "#FFFFFF",
    colors, colorId: first.id, color: { name: first.colorName, value: first.colorValue }, images: first.images, imageUrl: first.imageUrl,
    variants: first.variants, sizes: first.variants.map(v => v.value) };
}

export const stockFor = (product: Product, size: string) => product.variants.find(v => v.value === size)?.stock ?? 0;

export const isNumericSize = (size: string) => /^\d+$/.test(size);

export function catalogSizes(products: Product[]) {
  const clothing = ["PP", "P", "M", "G", "GG", "XG", "XGG"];
  return [...new Set(products.filter(p => p.isPublished !== false).flatMap(p => p.colors.flatMap(c => c.variants.filter(v => v.stock > 0).map(v => v.value))))].sort((a, b) => {
    if (isNumericSize(a) !== isNumericSize(b)) return isNumericSize(a) ? 1 : -1;
    const ai = clothing.indexOf(a), bi = clothing.indexOf(b);
    if (ai >= 0 || bi >= 0) return ai < 0 ? 1 : bi < 0 ? -1 : ai - bi;
    return a.localeCompare(b, "pt-BR", { numeric: true });
  });
}

// Only the unfiltered public catalog belongs here. Availability follows the
// same positive-stock rule across all colors as the catalog's size options.
export const categoryValue = (product: Pick<Product, "category" | "categoryId">) => product.categoryId === undefined ? product.category : String(product.categoryId);
const categoryLabel = (value: string) => value.length ? value[0].toLocaleUpperCase("pt-BR") + value.slice(1) : value;
export function catalogCategories(products: Product[], options?: readonly { value: string; label: string }[]) {
  const available = products.filter(product => product.isPublished !== false && product.colors.some(color => color.variants.some(variant => variant.stock > 0)));
  if (options) return options.filter(option => available.some(product => categoryValue(product) === option.value)).map(option => ({ ...option, label: categoryLabel(option.label) }));
  return [...new Map(available.map(product => [categoryValue(product), { value: categoryValue(product), label: categoryLabel(product.category) }])).values()]
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

export async function fetchProducts(baseUrl = "/api", signal?: AbortSignal): Promise<Product[]> {
  const response = await fetch(baseUrl.replace(/\/$/, "") + "/produtos", { signal, cache: "no-store" });
  if (!response.ok) throw new Error("Não foi possível carregar os produtos. Tente novamente.");
  const body: unknown = await response.json();
  if (!Array.isArray(body)) throw new Error("Resposta inválida do catálogo.");
  return body.map(adaptProduct).filter(product => product.isPublished);
}

export async function fetchCarouselProducts(baseUrl = "/api", signal?: AbortSignal): Promise<Product[]> {
  const response = await fetch(baseUrl.replace(/\/$/, "") + "/produtos/carrossel", { signal, cache: "no-store" });
  if (!response.ok) throw new Error("Não foi possível carregar o carrossel. Tente novamente.");
  const body: unknown = await response.json();
  if (!Array.isArray(body)) throw new Error("Resposta inválida do carrossel.");
  return body.map(adaptProduct).filter(product => product.inCarousel).sort((a, b) => a.id - b.id).slice(0, 5);
}
