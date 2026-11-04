import React from "react";
import { createRoot } from "react-dom/client";
import { useShopping } from "../../src/app/hooks/useShopping";
import { adaptProduct, selectProductColor } from "../../src/app/lib/products";
import { Toaster } from "sonner";

export const raw = {
  id: 9001, name: "Cooldown", price: 30, public: "unissex", category: "camisetas", colors: [
    { id: 901, colorName: "Preto", colorValue: "#111111", images: [], variants: [{ id: 9011, value: "M", stock: 5 }, { id: 9012, value: "G", stock: 5 }] },
    { id: 902, colorName: "Branco", colorValue: "#ffffff", images: [], variants: [{ id: 9021, value: "M", stock: 5 }] }
  ]
};
const products = [adaptProduct(raw), adaptProduct({ ...raw, id: 9002 })];
const authenticated = location.search.includes("user");
const user = authenticated ? { id: 1, role: "USER", name: "Tester", email: "test@example.test" } as const : null;
if (authenticated) localStorage.setItem("mcd-store_auth_v1", JSON.stringify({ accessToken: "test-token" }));
function Harness() {
  const shopping = useShopping(products, authenticated ? "test-token" : undefined, false, user);
  const selection = (color = 901, product = 0) => selectProductColor(products[product], color);
  Object.assign(window, { shopping, selection });
  return <><output data-ready>{String(shopping.ready)}</output><output data-items>{JSON.stringify(shopping.items.map(i => [i.product.id, i.colorId, i.size, i.quantity]))}</output>
    {["M", "G"].map(size => <button key={size} disabled={shopping.addState(products[0], size) !== "idle"} onClick={() => shopping.add(products[0], size)}>{size}: {shopping.addState(products[0], size)}</button>)}
    <Toaster /></>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
