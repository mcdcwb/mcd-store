// Mascaramento de dados pessoais para o painel demonstrativo (role DEMO).
// Pedidos de clientes REAIS saem mascarados; pedidos fictícios (isDemo = true) saem completos.
type Address = { cep: string; street: string; number: string; complement: string; neighborhood: string; city: string; state: string };

export function maskName(name: string) {
    const [first, ...rest] = name.trim().split(/\s+/);
    const last = rest.at(-1);
    return last ? `${first} ${last[0]!.toUpperCase()}.` : first ?? "";
}
export function maskPhone(phone: string | null) {
    if (!phone) return phone;
    const digits = phone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
    if (digits.length < 10) return "*****";
    return `(${digits.slice(0, 2)}) *****-${digits.slice(-4)}`;
}
// Endereço reduzido a bairro/cidade/UF.
export function maskAddress(address: unknown) {
    if (!address || typeof address !== "object") return address;
    const { neighborhood = "", city = "", state = "" } = address as Partial<Address>;
    return { cep: "", street: "", number: "", complement: "", neighborhood, city, state };
}
export function maskOrderForDemo<T extends { isDemo: boolean; customerName: string; customerPhone?: string | null; deliveryAddress?: unknown }>(order: T): T & { privacyMasked: boolean } {
    if (order.isDemo) return { ...order, privacyMasked: false };
    return {
        ...order, privacyMasked: true, customerName: maskName(order.customerName),
        ...("customerPhone" in order ? { customerPhone: maskPhone(order.customerPhone ?? null) } : {}),
        ...("deliveryAddress" in order ? { deliveryAddress: maskAddress(order.deliveryAddress) } : {}),
    };
}
