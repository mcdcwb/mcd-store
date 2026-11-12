import { relatedProducts } from "./lib/related-products";
import { useStoreDetails } from "./hooks/useStoreDetails";
import { whatsappUrl } from "./lib/store-settings";
import { CheckoutPage } from "./components/CheckoutPage";
import { clearCheckoutDraft } from "./lib/checkout";
import { sortCatalog, toggleCatalogSort, type CatalogSort } from "./lib/catalog-sort";
import { Fragment, useState, useEffect, useRef, useMemo } from "react";
import { useProducts } from "./hooks/useProducts";
import { ProductImage } from "./components/ProductImage";
import { AuthModal } from "./components/AuthModal";
import { CartDrawer } from "./components/CartDrawer";
import { StoreFooter } from "./components/StoreFooter";
import { ProductCard, ProductDetailPage, type FavoriteControls } from "./components/ProductViews";
import { FavoriteCard } from "./components/FavoriteCard";
import { favoriteKey } from "./hooks/useShopping";
import { sizeButtonClass } from "./lib/presentation";
import { Manager } from "./manager/Manager";
import { fetchCarouselProducts, categoryValue, catalogCategories, catalogSizes, isNumericSize, stockFor, type Product, type Size } from "./lib/products";
import { useShopping } from "./hooks/useShopping";
import { useAuth } from "./hooks/useAuth";
import { notify } from "./lib/notifications";
import { useLocation, useNavigate } from "react-router";
import { AccountMenu } from "./components/AccountMenu";
import { panelAccessOf } from "./lib/auth";
import { FilterSection, FilterOptions } from "./components/CatalogFilters";
import { AccountPage } from "./components/AccountPage";
import { MyOrdersPage } from "./components/MyOrdersPage";
import { ServiceStrip } from "./components/ServiceStrip";
import {
  ShoppingCart, X, ChevronDown, ChevronLeft, ChevronRight, User, Menu,
  ArrowUp, ArrowDown, ArrowUpDown, MessageCircle
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Public = "masculino" | "feminino" | "unissex" | "infantil";
type Category = string;

// ─── Constants ────────────────────────────────────────────────────────────────



const PUBLICS: { value: Public; label: string }[] = [
  { value: "masculino", label: "Masculino" },
  { value: "feminino", label: "Feminino" },
  { value: "unissex", label: "Unissex" },
  { value: "infantil", label: "Infantil" },
];
const mobileNavItemClass = "rounded-lg px-3 py-3 !text-lg font-medium";


export default function App() {
  const store = useStoreDetails();
  const demoMode = import.meta.env.VITE_DEMO_MODE === "true";
  const contactUrl = demoMode ? null : whatsappUrl(store.whatsapp);
  const { products, loading: productsLoading, error: productsError, retry: retryProducts } = useProducts();
  const { products: carouselProducts, retry: retryCarousel } = useProducts(fetchCarouselProducts);
  const allSizes = catalogSizes(products);
  const mobileSizesRef = useRef<HTMLDivElement>(null);
  const [sizeScroll, setSizeScroll] = useState({ left: false, right: false });
  const availableCategories = useMemo(() => catalogCategories(products), [products]);
  useEffect(() => {
    const element = mobileSizesRef.current;
    if (!element) return;
    const update = () => {
      setSizeScroll({ left: element.scrollLeft > 0, right: element.scrollLeft + element.clientWidth < element.scrollWidth - 1 });
    };
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => { element.removeEventListener("scroll", update); observer.disconnect(); };
  }, [allSizes.length]);
  const location = useLocation();
  const navigate = useNavigate();
  const accountPath = location.pathname.replace(/\/$/, "");
  const isAccountPage = accountPath === "/minha-conta" || accountPath === "/favoritos" || accountPath === "/meus-pedidos";
  const isCheckoutPage = accountPath === "/checkout";
  const [activePublic, setActivePublic] = useState<Public | "todos">("todos");
  const [selectedCategory, setActiveCategory] = useState<Category | null>(null);
  const activeCategory = availableCategories.some(option => option.value === selectedCategory) ? selectedCategory : null;
  useEffect(() => {
    if (selectedCategory !== null && activeCategory === null) setActiveCategory(null);
  }, [selectedCategory, activeCategory]);
  const [selectedSizes, setSelectedSizes] = useState<Size[]>([]);
  const [catalogSort, setCatalogSort] = useState<CatalogSort>(null);
  const { user, accessToken, validating, sessionError, login, register, logout, clearError: clearAuthError, invalidate, updateAccount } = useAuth();
  const [cartOpen, setCartOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [checkoutIntent, setCheckoutIntent] = useState(false);
  const checkoutOwner = useRef<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const mobileMenuToggleRef = useRef<HTMLButtonElement>(null);
  const [catDropdownOpen, setCatDropdownOpen] = useState(false);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [isFeaturedHovering, setIsFeaturedHovering] = useState(false);
  const featuredPointer = useRef<{ id: number; startX: number; startY: number; moved: boolean } | null>(null);
  const suppressFeaturedClickUntil = useRef(0);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [publicDropdownOpen, setPublicDropdownOpen] = useState(false);
  const publicDropdownRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const productsSectionRef = useRef<HTMLElement>(null);
  const filterScrollPending = useRef(false);
  // Marca que a próxima mudança de filtro veio de uma ação do usuário.
  function markFilterScroll() {
    filterScrollPending.current = true;
    requestAnimationFrame(() => requestAnimationFrame(() => { filterScrollPending.current = false; }));
  }

  useEffect(() => {
    if (accessToken) setAuthOpen(false);
  }, [accessToken]);

  const shopping = useShopping(products, accessToken, validating, user,
    isCheckoutPage || (accountPath === "/minha-conta" && new URLSearchParams(location.search).get("returnTo") === "/checkout"), () => setCartOpen(true));
  const { items: cartItems, add: addToCart, remove: removeFromCart, clear: clearCart, changeQty } = shopping;
  useEffect(() => {
    if (validating) return;
    const owner = user ? `${user.role}:${user.id}` : null;
    if (!owner || (checkoutOwner.current && owner !== checkoutOwner.current)) clearCheckoutDraft();
    checkoutOwner.current = owner;
    if (user && user.role !== "USER") setCheckoutIntent(false);
  }, [user?.id, user?.role, validating]);
  useEffect(() => {
    if (checkoutIntent && user?.role === "USER" && !validating && shopping.ready && !shopping.busy && !shopping.error) {
      setCheckoutIntent(false); setCartOpen(false); setDetailProduct(null); navigate("/checkout");
    }
  }, [checkoutIntent, user?.role, validating, shopping.ready, shopping.busy, shopping.error, navigate]);
  function startCheckout() {
    if (validating || shopping.busy) return;
    if (user && user.role !== "USER") { setCartOpen(false); navigate("/checkout"); return; }
    setCheckoutIntent(true); setCartOpen(false);
    if (!user) { setAuthMode("login"); setAuthOpen(true); }
  }
  function closeAuth() {
    setAuthOpen(false); setCheckoutIntent(false);
    if (isCheckoutPage && !user) navigate("/");
  }
  const shoppingStatus = (shopping.busy || shopping.error || shopping.notice) && (
    <div className="store-scroll-lock-center fixed bottom-4 left-4 right-4 z-[100] mx-auto max-w-xl rounded-lg border bg-card p-3 shadow-lg" role={shopping.error ? "alert" : "status"}>
      {shopping.busy ? "Sincronizando favoritos e carrinho..." : shopping.error || shopping.notice}
      {shopping.notice && !shopping.busy && !shopping.error && <button className="ml-3 underline" onClick={shopping.dismissNotice}>Fechar aviso</button>}
      {shopping.error && <button className="ml-3 underline" onClick={shopping.retry}>Tentar novamente</button>}
    </div>
  );
  function toggleFavorite(productId: number, colorId: number | null, size: string | null) {
    if (!user) { setAuthMode("login"); setAuthOpen(true); return; }
    void shopping.toggleFavorite(productId, colorId, size);
  }
  // Coração = combinação produto + cor + tamanho (null = não escolhido).
  const favoriteControls: FavoriteControls = {
    isFavorite: shopping.isFavorite,
    onFavorite: toggleFavorite,
    favoritePending: (productId, colorId, size) => shopping.favoriteState(favoriteKey(productId, colorId, size)) === "pending",
    favoriteBusy: (productId, colorId, size) => validating || (!!user && !shopping.favoriteReady) || shopping.favoriteBlocked(favoriteKey(productId, colorId, size)),
  };

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!publicDropdownRef.current?.contains(e.target as Node)) setPublicDropdownOpen(false);
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setCatDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (mobileMenuRef.current?.contains(target) || mobileMenuToggleRef.current?.contains(target)) return;
      setMobileMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [mobileMenuOpen]);

  // Filtered products
  const filteredProducts = products.filter((p) => {
    const publicMatch = activePublic === "todos" || p.public === activePublic ||
      ((activePublic === "masculino" || activePublic === "feminino") && p.public === "unissex");
    const sizeMatch = selectedSizes.length === 0 || p.colors.some(c => c.variants.some(v => v.stock > 0 && selectedSizes.includes(v.value)));
    return publicMatch && sizeMatch && (!activeCategory || categoryValue(p) === activeCategory);
  });

  const totalItems = cartItems.reduce((s, i) => s + i.quantity, 0);
  const sortedProducts = sortCatalog(filteredProducts, catalogSort);
  const totalPrice = cartItems.reduce((s, i) => s + i.product.price * i.quantity, 0);

  function toggleSize(size: Size) {
    markFilterScroll();
    setSelectedSizes((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]
    );
  }

  function availableStock(product: Product, size: Size) {
    if (productsLoading || productsError || !shopping.ready || shopping.busy) return 0;
    return Math.max(0, stockFor(product, size) - cartItems.filter(item => item.product.id === product.id && item.colorId === product.colorId && item.size === size).reduce((sum, item) => sum + item.quantity, 0));
  }

  async function handleLogin(email: string, password: string, signal: AbortSignal) {
    const success = await login(email, password, signal);
    if (success) {
      setAuthOpen(false);
      if (success.role === "ADMIN") navigate("/manager");
    }
  }

  async function handleRegister(name: string, email: string, password: string, confirmPassword: string, signal: AbortSignal) {
    await register({ name, email, password, confirmPassword }, signal);
    setAuthMode("login");
  }

  function handleLogout() {
    clearCheckoutDraft(); setCheckoutIntent(false);
    logout();
    if (location.pathname.startsWith("/manager") || isCheckoutPage) navigate("/");
  }

  function selectPublic(publicValue: Public | "todos") {
    markFilterScroll();
    if (detailProduct || isAccountPage || isCheckoutPage) navigate("/");
    setActivePublic(publicValue);
    setCatDropdownOpen(false);
    setMobileMenuOpen(false);
    setPublicDropdownOpen(false);
  }

  function selectCategory(category: Category | null) {
    markFilterScroll();
    if (detailProduct || isAccountPage || isCheckoutPage) navigate("/");
    setActiveCategory(category);
    setCatDropdownOpen(false);
    setMobileMenuOpen(false);
    setPublicDropdownOpen(false);
  }

  function clearFilters() {
    setActivePublic("todos");
    setActiveCategory(null);
    setSelectedSizes([]);
  }
  const hasActiveFilters = activePublic !== "todos" || activeCategory !== null || selectedSizes.length > 0;

  useEffect(() => {
    if (!filterScrollPending.current) return;
    filterScrollPending.current = false;
    const section = productsSectionRef.current;
    if (!section) return;
    const headerHeight = document.querySelector("header")?.getBoundingClientRect().height ?? 0;
    const offset = section.getBoundingClientRect().top - headerHeight - 16;
    if (offset >= 0 && offset <= 100) return; // título já visível no topo, logo abaixo do Header
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: window.scrollY + offset, behavior: reduceMotion ? "instant" : "smooth" });
  }, [activePublic, activeCategory, selectedSizes]);

  const catalogTitle = activeCategory
    ? availableCategories.find(piece => piece.value === activeCategory)?.label
    :
    activePublic === "todos"
      ? "Todas as Peças"
      : PUBLICS.find((c) => c.value === activePublic)?.label ?? "";

  const featuredProducts = carouselProducts;
  const activeFeaturedIndex = Math.min(featuredIndex, Math.max(0, featuredProducts.length - 1));
  useEffect(() => {
    setFeaturedIndex(index => Math.min(index, Math.max(0, featuredProducts.length - 1)));
  }, [featuredProducts.length]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const productId = params.get("productId");

    if (!productId) {
      setDetailProduct(null);
      return;
    }

    const found = products.find((item) => item.id === Number(productId));
    setDetailProduct(found ?? null);
  }, [location.search, products]);

  useEffect(() => {
    document.title = detailProduct?.name || "MCD Store";
  }, [detailProduct?.name]);

  useEffect(() => {
    if (!isCheckoutPage) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [isCheckoutPage]);

  useEffect(() => {
    if (location.hash !== "#contato") return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("contato")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (isFeaturedHovering || featuredProducts.length < 2) return;

    const interval = window.setInterval(() => {
      setFeaturedIndex((prev) => (prev + 1) % featuredProducts.length);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [featuredProducts.length, isFeaturedHovering]);

  const goToFeaturedSlide = (direction: "prev" | "next") => {
    if (featuredProducts.length < 2) return;
    setFeaturedIndex((prev) => {
      if (direction === "next") {
        return (prev + 1) % featuredProducts.length;
      }
      return (prev - 1 + featuredProducts.length) % featuredProducts.length;
    });
  };

  const openProductDetail = (product: Product) => {
    if (!product.isPublished) return;
    setDetailProduct(product);
    navigate(`/?productId=${product.id}`);
  };

  useEffect(() => {
    if (detailProduct) window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [detailProduct?.id]);

  if (accountPath === "/manager" || accountPath.startsWith("/manager/")) {
    return <>
      <Manager user={user} token={accessToken} validating={validating} sessionError={authOpen ? null : sessionError}
        onLogin={() => { setAuthMode("login"); setAuthOpen(true); }} onLogout={handleLogout}
        onUnauthorized={message => invalidate(accessToken, message)} onChanged={() => { retryProducts(); retryCarousel(); }} onAccountUpdated={updateAccount} />
      {authOpen && <AuthModal mode={authMode} onClose={() => setAuthOpen(false)} onLogin={handleLogin}
        onRegister={handleRegister} onSwitchMode={() => { clearAuthError(); setAuthMode(mode => mode === "login" ? "register" : "login"); }}
        sessionError={sessionError} />}
    </>;
  }

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      {shoppingStatus}
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 relative bg-card/95 [&_button]:text-[15px] backdrop-blur border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">

            {/* Logo */}
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                navigate("/");
                window.scrollTo({ top: 0 });
              }}
              aria-label="MCD Store — página inicial"
              className="flex items-center shrink-0 group"
            >
              <img
                src="/mark-512-transparent.png"
                alt="MCD Store"
                className="h-10 w-auto object-contain transition-opacity group-hover:opacity-60"
              />
            </button>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-3 lg:gap-7">
              <button
                type="button"
                onClick={() => {
                  navigate("/");
                  window.scrollTo({
                    top: 0,
                  });
                }}
                className="text-[17px] font-light cursor-pointer transition-colors hover:text-primary"
              >
                Início
              </button>

              <div className="relative hidden" ref={publicDropdownRef}>
                <button type="button" aria-expanded={publicDropdownOpen}
                  onClick={() => { setPublicDropdownOpen(value => !value); setCatDropdownOpen(false); }}
                  className="flex items-center gap-1 text-[15px] font-medium hover:text-primary">
                  Público<ChevronDown className={`w-4 h-4 ${publicDropdownOpen ? "rotate-180" : ""}`} />
                </button>
                {publicDropdownOpen && <div className="absolute top-full left-0 mt-2 w-56 bg-card border border-border rounded-sm shadow-1 overflow-hidden z-50">
                  <FilterOptions options={availableCategories} value={activeCategory} allValue={null} onChange={selectCategory} />
                </div>}
              </div>
              {/* Categorias dropdown */}
              <div className="relative" ref={dropdownRef}>
                <button
                  aria-expanded={catDropdownOpen}
                  onClick={() => { setCatDropdownOpen((v) => !v); setPublicDropdownOpen(false); }}
                  className="flex items-center gap-x-1.5 text-[15px] font-light cursor-pointer hover:text-primary transition-colors"
                >
                  Categorias
                  <ChevronDown
                    className={`w-5 h-5 transition-transform duration-200 ${catDropdownOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {catDropdownOpen && (
                  <div className="absolute top-full left-0 mt-2 w-56 bg-card border border-border rounded-sm shadow-1 overflow-hidden z-50">
                    <FilterOptions options={availableCategories} value={activeCategory} allValue={null} onChange={selectCategory} />
                  </div>
                )}
              </div>

              <a
                href="/#contato"
                className="text-[15px] font-light hover:text-primary transition-colors"
              >
                Contato
              </a>
            </nav>




            {/* Right actions */}
            <div className="flex items-center gap-3 md:gap-2">
              {user ? <AccountMenu name={user.name} role={user.role} panelAccess={panelAccessOf(user)} onLogout={handleLogout} /> : (<button
                onClick={() => { setAuthOpen(true); }}
                className="hidden md:flex items-center gap-1.5 text-[15px] font-medium px-3 py-1.5 rounded-sm border border-t-gray-400 border-r-gray-400 border-b-gray-300 border-l-gray-300 bg-muted text-muted-foreground cursor-pointer transition-all duration-150 hover:translate-y-px hover:text-primary hover:border-t-gray-600 hover:border-r-gray-600 hover:border-b-gray-500 hover:border-l-gray-500 hover:shadow-[inset_0_2px_4px_rgba(0,0,0,0.45)] active:translate-y-0.5 active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)] focus-visible:outline-2 focus-visible:outline-primary"
              >
                <User aria-hidden="true" className="w-4 h-4" />
                Entrar
              </button>
              )}

              {/* Cart button */}
              <button
                onClick={() => setCartOpen(true)}
                className="relative p-2 rounded-sm hover:bg-muted transition-colors hover:text-primary ml-2 cursor-pointer"
                aria-label="Abrir carrinho"
              >
                <ShoppingCart className="w-5 h-5" />
                {totalItems > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                    {totalItems > 99 ? "99+" : totalItems}
                  </span>
                )}
              </button>

              {/* Mobile hamburger */}
              <button ref={mobileMenuToggleRef}
                aria-label="Abrir menu de navegação"
                onClick={() => setMobileMenuOpen((v) => !v)}
                className="md:hidden p-2 rounded-sm hover:bg-muted transition-colors hover:text-primary"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Mobile nav */}
          {mobileMenuOpen && (
            <div ref={mobileMenuRef} className="absolute inset-x-0 top-full z-50 border-y border-border bg-card py-4 shadow-xl md:hidden space-y-1">
              <button
                onClick={() => { clearFilters(); setMobileMenuOpen(false); navigate("/"); window.scrollTo({ top: 0, left: 0, behavior: "instant" }); }}
                className={`w-full text-left ${mobileNavItemClass} hover:bg-muted`}
              >
                Início
              </button>
              <a href="/#contato" onClick={event => { event.preventDefault(); setMobileMenuOpen(false); navigate("/#contato"); }} className={`block ${mobileNavItemClass} text-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-primary`}>Contato</a>
              <div className="mx-3 my-2 border-t border-border" />
              <div className={availableCategories.length < 2 ? "hidden" : ""}>
                <div className="px-3 pt-2 pb-1 text-[15px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Categorias
                </div>
                <FilterOptions options={availableCategories} value={activeCategory} allValue={null} onChange={selectCategory} optionLabelClassName="pl-2" />
              </div>
              <div className="hidden"><div className="px-3 pt-2 pb-1 text-[15px] font-semibold uppercase tracking-widest text-muted-foreground">Público</div>
                <FilterOptions options={PUBLICS} value={activePublic} allValue="todos" onChange={value => selectPublic(value ?? "todos")} />
              </div>
              {!user && (
                <button
                  onClick={() => { setAuthOpen(true); setMobileMenuOpen(false); }}
                  className="mt-4 w-full rounded-lg px-3 py-2.5 text-center text-[15px] font-medium text-primary hover:bg-primary/10"
                >
                  Entrar
                </button>
              )}
              {user?.role === "ADMIN" && (
                <button
                  onClick={() => { handleLogout(); setMobileMenuOpen(false); }}
                  className="w-full text-left px-3 py-2.5 text-[15px] font-medium text-muted-foreground rounded-lg hover:bg-muted"
                >
                  Sair da conta
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {detailProduct && !isAccountPage && !isCheckoutPage ? <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <ProductDetailPage
          key={detailProduct.id}
          product={detailProduct}
          stockSettings={store.stockBadges ?? null}
          recommendations={relatedProducts(detailProduct, products)}
          onOpenProduct={openProductDetail}
          favorite={favoriteControls}
          availableStock={availableStock}
          onBack={() => {
            setDetailProduct(null);
            navigate("/", { replace: true });
          }}
          onAddToCart={addToCart} addState={shopping.addState}
        />
      </div> : accountPath === "/meus-pedidos" ? <MyOrdersPage token={user?.role === "USER" ? accessToken : undefined} onLogin={() => setAuthOpen(true)} /> : isCheckoutPage ? <CheckoutPage user={user} token={accessToken} validating={validating} shopping={shopping} store={store} cartOpen={cartOpen}
        onOpenCart={() => { setCartOpen(true); shopping.retry(); }} onLogin={startCheckout} onUnauthorized={message => invalidate(accessToken, message)} /> : isAccountPage ? <AccountPage accessToken={accessToken} onUpdated={updateAccount} user={user} favorites={accountPath === "/favoritos"} onLogin={() => setAuthOpen(true)}>
          {shopping.ready && !shopping.favorites.length && <p className="mt-4">Nenhum favorito salvo.</p>}
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            {shopping.favorites.map(item => <FavoriteCard key={item.id} item={item} catalog={products.find(current => current.id === item.product.id)} favorite={favoriteControls}
              onOpen={href => navigate(href)} availableStock={availableStock} onAddToCart={addToCart} addState={shopping.addState} />)}
          </div>
        </AccountPage> : <>
        {featuredProducts.length > 0 && <section aria-label="Carrossel de produtos" className="w-full pt-0">
          <div className="p-0 sm:p-0">
            <div
              className="relative overflow-hidden rounded-none"
              onMouseEnter={() => setIsFeaturedHovering(true)}
              onMouseLeave={() => setIsFeaturedHovering(false)}
              style={{ touchAction: "pan-y" }}
              onPointerDown={event => {
                featuredPointer.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
              }}
              onPointerMove={event => {
                const pointer = featuredPointer.current;
                if (!pointer || pointer.id !== event.pointerId) return;
                const dx = event.clientX - pointer.startX;
                const dy = event.clientY - pointer.startY;
                if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) pointer.moved = true;
              }}
              onPointerUp={event => {
                const pointer = featuredPointer.current;
                if (!pointer || pointer.id !== event.pointerId) return;
                const dx = event.clientX - pointer.startX;
                const dy = event.clientY - pointer.startY;
                if (pointer.moved) {
                  if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy)) goToFeaturedSlide(dx < 0 ? "next" : "prev");
                  suppressFeaturedClickUntil.current = Date.now() + 500;
                }
                featuredPointer.current = null;
              }}
              onPointerCancel={() => { featuredPointer.current = null; }}
              onClickCapture={event => {
                if (Date.now() < suppressFeaturedClickUntil.current) {
                  event.preventDefault();
                  event.stopPropagation();
                  suppressFeaturedClickUntil.current = 0;
                }
              }}
            >
              <div
                className="flex transition-transform duration-300 ease-out"
                style={{ transform: `translateX(-${activeFeaturedIndex * 100}%)` }}
              >
                {featuredProducts.map((product) => (
                  <article key={product.id} aria-hidden={featuredProducts[activeFeaturedIndex]?.id !== product.id} ref={node => { node?.toggleAttribute("inert", featuredProducts[activeFeaturedIndex]?.id !== product.id); }} className="w-full shrink-0 p-0">
                    <div className="group relative h-72 overflow-hidden rounded-none bg-black sm:h-[420px]">
                      <ProductImage
                        src={product.imageUrl}
                        alt=""
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover blur-xl brightness-75"
                      />
                      <ProductImage
                        src={product.imageUrl}
                        alt={product.name}
                        className="store-carousel-image relative h-full w-full object-contain"
                      />

                      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                      <div className="absolute inset-0 bg-black/0 transition-colors duration-200 group-hover:bg-black/20" />

                      {featuredProducts.length > 1 && <><button
                        type="button"
                        onClick={() => goToFeaturedSlide("prev")}
                        aria-label="Produto anterior"
                        className="absolute left-3 top-1/2 z-30 flex h-9 w-9 -translate-y-1/2 items-center justify-center store-slider-control rounded-full border border-white/30 bg-black/30 text-white opacity-0 backdrop-blur-sm transition-all duration-200 hover:scale-105 hover:bg-black/50 group-hover:opacity-100"
                      >
                        <ChevronDown className="h-4 w-4 rotate-90" />
                      </button>

                        <button
                          type="button"
                          onClick={() => goToFeaturedSlide("next")}
                          aria-label="Próximo produto"
                          className="absolute right-3 top-1/2 z-30 flex h-9 w-9 -translate-y-1/2 items-center justify-center store-slider-control rounded-full border border-white/30 bg-black/30 text-white opacity-0 backdrop-blur-sm transition-all duration-200 hover:scale-105 hover:bg-black/50 group-hover:opacity-100"
                        >
                          <ChevronDown className="h-4 w-4 -rotate-90" />
                        </button></>}

                      {product.isPublished && <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-4 sm:p-6">
                        <button
                          type="button"
                          onClick={() => openProductDetail(product)}
                          className="pointer-events-auto translate-y-3 store-slider-control rounded-full border border-white/30 bg-black/30 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white opacity-0 backdrop-blur-sm transition-all duration-200 hover:scale-105 hover:bg-black/50 group-hover:translate-y-0 group-hover:opacity-100"
                        >
                          VER MAIS
                        </button>
                      </div>}

                      <div className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-3 p-4 sm:p-6">
                        <div>
                          <h3 className="max-w-[85%] text-base font-semibold text-white sm:text-2xl">
                            {product.name}
                          </h3>
                        </div>
                      </div>

                    </div>
                  </article>
                ))}
              </div>
              <div className="absolute inset-x-0 bottom-4 z-10 flex items-center justify-center gap-1.5 sm:bottom-5">
                {featuredProducts.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={`Ir para o produto ${index + 1}`}
                    aria-current={activeFeaturedIndex === index ? "true" : undefined}
                    onClick={() => setFeaturedIndex(index)}
                    className={`h-1.5 rounded-full transition-all ${activeFeaturedIndex === index ? "w-6 bg-primary" : "w-1.5 bg-white/45 hover:bg-white/75"}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>}

        <ServiceStrip />

        {/* ── Main layout ────────────────────────────────────────────────────── */}
        <main className="max-w-7xl mx-auto px-2 sm:px-4 py-8">
          <div className="flex gap-8">

            {/* ── Sidebar ──────────────────────────────────────────────────── */}
            <aside className="hidden lg:block w-52 shrink-0">
              <div className="sticky top-24 space-y-7">
                <FilterSection title="Tamanhos">
                  <div className="grid grid-cols-3 gap-1.5">
                    {allSizes.map((size, index) => <Fragment key={size}>
                      {index > 0 && isNumericSize(size) && !isNumericSize(allSizes[index - 1]) && <hr className="col-span-3 border-border my-2" />}
                      <button aria-pressed={selectedSizes.includes(size)}
                        onClick={() => toggleSize(size)}
                        className={`store-catalog-control ${sizeButtonClass} text-sm font-medium border transition-colors ${selectedSizes.includes(size) ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-muted"}`}>
                        {size}
                      </button></Fragment>)}
                  </div>
                </FilterSection>
                <FilterSection title="Público">
                  <FilterOptions options={PUBLICS} value={activePublic} allValue="todos" onChange={value => selectPublic(value ?? "todos")} />
                </FilterSection>
                <div className={availableCategories.length < 2 ? "hidden" : ""}><FilterSection title="Categoria">
                  <FilterOptions options={availableCategories} value={activeCategory} allValue={null} onChange={selectCategory} />
                </FilterSection></div>
              </div>
            </aside>

            {/* ── Products section ─────────────────────────────────────────── */}
            <section ref={productsSectionRef} className="flex-1 min-w-0">
              {/* Section header */}
              <div className="flex flex-wrap items-end justify-between mb-6 gap-4">
                <div className="flex w-full flex-col gap-2">
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <div className="min-w-0 flex-1 lg:flex-none">
                      <h2 className="pl-2 md:pl-0 font-serif text-2xl font-bold text-foreground leading-tight">
                        {catalogTitle}
                      </h2>
                      <p className="pl-2 md:pl-0 mt-1 text-sm text-muted-foreground">
                        {productsLoading ? "Carregando..." : productsError ? "Catálogo indisponível" : `${filteredProducts.length} ${filteredProducts.length === 1 ? "peça encontrada" : "peças encontradas"}`}
                      </p>
                    </div>
                    <div className="flex min-w-0 max-w-full items-center gap-1 self-center lg:ml-auto">
                      <div role="group" aria-label="Ordenar produtos" className="ml-auto flex shrink-0 gap-0.5 lg:ml-0">
                        {(["name", "price"] as const).map(field => {
                          const active = catalogSort?.field === field;
                          const label = field === "name" ? "Nome" : "Preço";
                          const Arrow = !active ? ArrowUpDown : catalogSort.direction === "desc" ? ArrowDown : ArrowUp;
                          return <button key={field} type="button" aria-pressed={active}
                            aria-label={`Ordenar por ${label.toLocaleLowerCase("pt-BR")}${active ? `, ${catalogSort.direction === "asc" ? "crescente" : "decrescente"}` : ""}`}
                            onClick={() => setCatalogSort(current => toggleCatalogSort(current, field))}
                            className={`store-catalog-control inline-flex min-h-10 w-[74px] sm:w-[88px] items-center justify-center gap-1 rounded-md border px-1 sm:px-3 text-sm transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${active ? "border-primary/20 bg-primary/10 font-semibold text-primary" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                            {label}<Arrow aria-hidden="true" className="size-3.5 shrink-0" />
                          </button>;
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="flex min-h-11 justify-end lg:justify-center">
                    {hasActiveFilters && <button type="button" onClick={() => { markFilterScroll(); clearFilters(); }}
                      className="min-h-11 rounded-md border border-border px-3 text-right text-sm text-primary transition-colors duration-200 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                      Limpar filtros
                    </button>}
                  </div>
                </div>

                {/* Mobile size filter */}
                <div role="group" aria-label="Filtrar por tamanho" className="lg:hidden flex min-w-0 w-full items-center gap-1">
                  <button type="button" aria-label="Rolar tamanhos para a esquerda" disabled={!sizeScroll.left} onClick={() => mobileSizesRef.current?.scrollBy({ left: -140, behavior: "smooth" })}
                    className="shrink-0 rounded-md border border-border p-1.5 text-muted-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-30"><ChevronLeft className="size-4" /></button>
                  <div ref={mobileSizesRef} onScroll={event => {
                    const element = event.currentTarget;
                    setSizeScroll({ left: element.scrollLeft > 0, right: element.scrollLeft + element.clientWidth < element.scrollWidth - 1 });
                  }} className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain scroll-smooth" style={{ scrollbarWidth: "none", touchAction: "pan-x" }}>
                    {allSizes.map((size) => (
                      <button
                        key={size}
                        onClick={() => toggleSize(size)}
                        aria-pressed={selectedSizes.includes(size)}
                        className={`store-catalog-control ${sizeButtonClass} text-xs font-medium border transition-all ${selectedSizes.includes(size)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border hover:border-primary/50"
                          }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                  <button type="button" aria-label="Rolar tamanhos para a direita" disabled={!sizeScroll.right} onClick={() => mobileSizesRef.current?.scrollBy({ left: 140, behavior: "smooth" })}
                    className="shrink-0 rounded-md border border-border p-1.5 text-muted-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-30"><ChevronRight className="size-4" /></button>
                </div>
              </div>

              {productsLoading ? (
                <div role="status" className="py-24 text-center text-muted-foreground">Carregando produtos...</div>
              ) : productsError ? (
                <div role="alert" className="py-24 text-center text-muted-foreground space-y-3">
                  <p>{productsError}</p>
                  <button onClick={retryProducts} className="text-primary underline underline-offset-2">Tentar novamente</button>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground gap-3">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                    <ShoppingCart className="w-7 h-7 text-muted-foreground/50" />
                  </div>
                  <p className="text-base font-medium">Nenhuma peça encontrada</p>
                  <p className="text-sm">Tente ajustar os filtros de tamanho, público ou categoria</p>
                  {hasActiveFilters && <button
                    onClick={() => { markFilterScroll(); clearFilters(); }}
                    className="mt-1 min-h-10 rounded-md border border-border px-3 text-sm text-primary hover:opacity-80"
                  >
                    Limpar filtros
                  </button>}
                </div>
              ) : (
                <div className="store-catalog-grid grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-1 md:gap-2">
                  {sortedProducts.map((product) => (
                    <ProductCard stockSettings={store.stockBadges ?? null} key={product.id} favorite={favoriteControls} product={product} availableStock={availableStock} onAddToCart={addToCart} addState={shopping.addState} />
                  ))}
                </div>
              )}
            </section>
          </div>
        </main>
      </>}

      {/* ── Contact section ────────────────────────────────────────────────── */}
      <StoreFooter store={store} />

      {/* ── Cart Drawer ────────────────────────────────────────────────────── */}
      <CartDrawer
          open={cartOpen}
          busy={shopping.busy || !shopping.ready}
          items={cartItems}
          totalPrice={totalPrice}
          user={user}
          onClose={() => setCartOpen(false)}
          onRemove={removeFromCart}
          onChangeQty={changeQty}
          onClearCart={clearCart}
          onCheckout={startCheckout}
          onExplore={() => { setCartOpen(false); navigate("/"); window.scrollTo({ top: 0, left: 0, behavior: "instant" }); }}
          onOpenAuth={() => { setCartOpen(false); setAuthOpen(true); }}
        />

      {!cartOpen && contactUrl && (
        <a
          href={contactUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Falar conosco pelo WhatsApp"
          className="store-scroll-lock-right fixed bottom-5 right-5 z-50 flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-whatsapp text-whatsapp-foreground shadow-lg hover:scale-105 hover:shadow-x1 active:scale-95 transition-all"
        >
          <MessageCircle className="w-7 h-7 sm:w-8 sm:h-8" />
        </a>
      )}

      {/* ── Auth Modal ─────────────────────────────────────────────────────── */}
      {authOpen && (
        <AuthModal
          mode={authMode}
          onClose={closeAuth}
          onLogin={handleLogin}
          onRegister={handleRegister}
          onSwitchMode={() => { clearAuthError(); setAuthMode(mode => mode === "login" ? "register" : "login"); }}
          sessionError={sessionError}
        />
      )}
    </div>
  );
}
