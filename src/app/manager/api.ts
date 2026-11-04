import { adaptCategories, type Category } from "../lib/categories.ts";
import { adaptProduct } from "../lib/products.ts";
import type { ManagedProduct, ProductInput } from "./products.ts";
import { orderQueryString, type CancellableOrderStatus, type OrderQuery, type OrderPage, type OrderDetails, type StockConflict, type OrderSummary } from "./orders.ts";

export class ManagerApiError extends Error {
  status: number;
  conflicts?: StockConflict[];
  constructor(status: number, message: string, conflicts?: StockConflict[]) { super(message); this.status = status; this.conflicts = conflicts; }
}
function normalize(value: unknown): ManagedProduct {
  const product = adaptProduct(value);
  const raw = value as Record<string, unknown>;
  return { id: product.id, name: product.name, description: product.description, price: product.price, public: product.public,
    category: product.category, categoryId: product.categoryId!, isPublished: product.isPublished, badge: product.badge ?? null, badgeBackgroundColor: product.badgeBackgroundColor, badgeTextColor: product.badgeTextColor, inCarousel: product.inCarousel,
    colors: (raw.colors as Array<Record<string, unknown>>).map((color, i) => ({
      ...product.colors[i], imageUrl: typeof color.imageUrl === "string" ? color.imageUrl : "", images: color.images as string[]
    }))
  };
}
export function createManagerApi(token: string, baseUrl = "/api", fetcher: typeof fetch = fetch) {
  async function request(path: string, method = "GET", body?: unknown, signal?: AbortSignal, resource = "/produtos") {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, 15000);
    try {
      const response = await fetcher(baseUrl.replace(/\/$/, "") + resource + path, {
        method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal, cache: "no-store"
      });
      if (response.status === 401) throw new ManagerApiError(401, "Sua sessão expirou. Entre novamente.");
      if (response.status === 403) throw new ManagerApiError(403, "Acesso administrativo não autorizado.");
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const issues = Array.isArray(data?.errors) ? data.errors.map((issue: { message: string }) => issue.message).join(" ") : "";
        throw new ManagerApiError(response.status, issues || data?.error || "Não foi possível concluir a operação.", Array.isArray(data?.conflicts) ? data.conflicts : undefined);
      }
      return data;
    } catch (error) {
      if (error instanceof ManagerApiError) throw error;
      throw new ManagerApiError(0, "Falha de conexão. Verifique a lista antes de tentar novamente.");
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }
  return {
    async archiveOrder(id: number, signal?: AbortSignal) { return request(`/${id}/archive`, "POST", {}, signal, "/orders"); },
    async reports(signal?: AbortSignal) { return request("/reports", "GET", undefined, signal, "/orders"); },
    async statusCounts(signal?: AbortSignal): Promise<Record<import("./orders.ts").OrderStatus, number>> { return request("/status-counts", "GET", undefined, signal, "/orders"); },
    async cancelOrder(id: number, expectedStatus: CancellableOrderStatus, signal?: AbortSignal): Promise<Pick<OrderDetails, "id" | "number" | "status" | "updatedAt">> { return request(`/${id}/cancel`, "POST", { expectedStatus }, signal, "/orders"); },
    async advanceOrder(id: number, expectedStatus: "PREPARING" | "READY_OR_SHIPPED", signal?: AbortSignal): Promise<Pick<OrderDetails, "id" | "number" | "status" | "updatedAt">> { return request(`/${id}/advance`, "POST", { expectedStatus }, signal, "/orders"); },
    async orders(query: OrderQuery, signal?: AbortSignal): Promise<OrderPage> { return request(`?${orderQueryString(query)}`, "GET", undefined, signal, "/orders"); },
    async order(id: number, signal?: AbortSignal): Promise<OrderDetails> { return request(`/${id}`, "GET", undefined, signal, "/orders"); },
    async confirmOrder(id: number, signal?: AbortSignal): Promise<Pick<OrderSummary, "id" | "number" | "status">> { return request(`/${id}/confirm`, "POST", {}, signal, "/orders"); },
    async categories(signal?: AbortSignal): Promise<Category[]> { return adaptCategories(await request("", "GET", undefined, signal, "/categorias")); },
    async saveCategory(name: string, id?: number): Promise<Category> { return request(id === undefined ? "" : `/${id}`, id === undefined ? "POST" : "PUT", { name }, undefined, "/categorias"); },
    async deleteCategory(id: number) { await request(`/${id}`, "DELETE", undefined, undefined, "/categorias"); },
    async upload(file: File, signal?: AbortSignal): Promise<string> {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new ManagerApiError(400, "Selecione uma imagem JPEG, PNG ou WebP.");
      if (file.size > 5 * 1024 * 1024) throw new ManagerApiError(413, "A imagem deve ter no máximo 5 MiB.");
      const controller = new AbortController();
      const abort = () => controller.abort();
      if (signal?.aborted) abort();
      signal?.addEventListener("abort", abort, { once: true });
      const timeout = setTimeout(abort, 75000);
      try {
        const body = new FormData();
        body.append("file", file);
        const response = await fetcher(baseUrl.replace(/\/$/, "") + "/uploads/produtos", {
          method: "POST", headers: { Authorization: `Bearer ${token}` }, body, signal: controller.signal
        });
        if (response.status === 401) throw new ManagerApiError(401, "Sua sessão expirou. Entre novamente.");
        if (response.status === 403) throw new ManagerApiError(403, "Acesso administrativo não autorizado.");
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new ManagerApiError(response.status, data?.error || "Não foi possível enviar a imagem. Tente novamente.");
        const url = typeof data?.url === "string" ? new URL(data.url) : null;
        if (!url || url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" || url.username || url.password || url.port || url.search || url.hash || !/^\/[^/]+\/image\/upload\//.test(url.pathname)) {
          throw new ManagerApiError(0, "Resposta inválida do upload.");
        }
        return data.url;
      } catch (error) {
        if (error instanceof ManagerApiError) throw error;
        throw new ManagerApiError(0, "Não foi possível enviar a imagem. Verifique a conexão e tente novamente.");
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
      }
    },
    async list(signal?: AbortSignal) {
      const data = await request("/admin", "GET", undefined, signal);
      if (!Array.isArray(data)) throw new ManagerApiError(0, "Resposta inválida do catálogo.");
      return data.map(normalize);
    },
    async save(input: ProductInput, id?: number) { return normalize(await request(id === undefined ? "" : `/${id}`, id === undefined ? "POST" : "PUT", input)); },
    async remove(id: number) { await request(`/${id}`, "DELETE"); },
    async setCarousel(id: number, inCarousel: boolean) { return normalize(await request(`/${id}/carrossel`, "PATCH", { inCarousel })); }
  };
}
