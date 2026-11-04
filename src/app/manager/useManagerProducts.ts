import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { notify } from "../lib/notifications";
import { createManagerApi, ManagerApiError } from "./api";
import type { ManagedProduct, ProductInput } from "./products";
import type { Category } from "../lib/categories";

export function useManagerProducts(token: string, onUnauthorized: (message: string) => void, onChanged: () => void) {
  const api = useMemo(() => createManagerApi(token, import.meta.env.VITE_API_URL || "/api"), [token]);
  const [products, setProducts] = useState<ManagedProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const pending = useRef(false);
  const mounted = useRef(true);
  const callbacks = useRef({ onUnauthorized, onChanged });
  callbacks.current = { onUnauthorized, onChanged };
  const fail = useCallback((reason: unknown) => {
    if (reason instanceof ManagerApiError && [401, 403].includes(reason.status)) {
      callbacks.current.onUnauthorized(reason.message);
    } else setError(reason instanceof Error ? reason.message : "Não foi possível concluir a operação.");
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    Promise.all([api.list(controller.signal), api.categories(controller.signal)]).then(([data, categories]) => { if (!controller.signal.aborted) { setProducts(data); setCategories(categories); setLoaded(true); } })
      .catch(reason => { if (!controller.signal.aborted) fail(reason); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, revision, fail]);

  async function mutate(action: () => Promise<void>, carousel = false, category = false) {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    if (!category) setError(null);
    try {
      await action();
      callbacks.current.onChanged();
      return mounted.current;
    } catch (reason) {
      if (mounted.current) {
        if (category) {
          toast.error(reason instanceof Error ? reason.message : "Não foi possível atualizar a categoria.");
          if (reason instanceof ManagerApiError && [401, 403].includes(reason.status)) callbacks.current.onUnauthorized(reason.message);
        } else if (carousel && !(reason instanceof ManagerApiError && [401, 403].includes(reason.status))) {
          toast.error(reason instanceof Error ? reason.message : "Não foi possível atualizar o carrossel.");
          setRevision(value => value + 1);
        } else fail(reason);
      }
      return false;
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const save = (input: ProductInput, id?: number) => mutate(async () => {
    const product = await api.save(input, id);
    if (!mounted.current) return;
    const previousCategoryId = products.find(p => p.id === id)?.categoryId;
    setCategories(previous => previous.map(category => ({ ...category, ...(category.productCount === undefined ? {} : {
      productCount: category.productCount + Number(product.categoryId === category.id) - Number(previousCategoryId === category.id)
    }) })));
    setProducts(previous => id === undefined ? [...previous, product] : previous.map(p => p.id === id ? product : p));
    notify.positive(id === undefined ? "Produto criado com sucesso!" : "Produto salvo com sucesso!");
  });
  const remove = (id: number) => mutate(async () => {
    await api.remove(id);
    if (!mounted.current) return;
    const categoryId = products.find(product => product.id === id)?.categoryId;
    setCategories(previous => previous.map(category => ({ ...category, ...(category.productCount === undefined ? {} : {
      productCount: category.productCount - Number(categoryId === category.id)
    }) })));
    setProducts(previous => previous.filter(product => product.id !== id));
    notify.removal("Produto excluído com sucesso!");
  });
  const upload = async (file: File, signal: AbortSignal) => {
    try { return await api.upload(file, signal); }
    catch (reason) {
      if (!signal.aborted && reason instanceof ManagerApiError && [401, 403].includes(reason.status)) callbacks.current.onUnauthorized(reason.message);
      throw reason;
    }
  };
  const setCarousel = (id: number, inCarousel: boolean) => mutate(async () => {
    const product = await api.setCarousel(id, inCarousel);
    if (!mounted.current) return;
    setProducts(previous => previous.map(p => p.id === id ? product : p));
    if (inCarousel) notify.change("Produto adicionado ao carrossel!");
    else notify.removal("Produto removido do carrossel!");
  }, true);
  const saveCategory = async (name: string, id?: number): Promise<Category | null> => {
    let saved: Category | null = null;
    await mutate(async () => {
      saved = await api.saveCategory(name, id);
      if (!mounted.current) return;
      const category = saved;
      setCategories(previous => [...previous.filter(c => c.id !== category.id), category].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
      setProducts(previous => previous.map(p => p.categoryId === category.id ? { ...p, category: category.name } : p));
      if (id === undefined) notify.positive("Categoria criada com sucesso!"); else notify.change("Categoria renomeada com sucesso!");
    }, false, true);
    return saved;
  };
  const removeCategory = (id: number) => mutate(async () => {
    await api.deleteCategory(id);
    if (!mounted.current) return;
    setCategories(previous => previous.filter(c => c.id !== id));
    notify.removal("Categoria excluída com sucesso!");
  }, false, true);
  return { upload, products, categories, saveCategory, removeCategory, loading, loaded, busy, error, save, remove, setCarousel, reload: () => setRevision(value => value + 1) };
}
