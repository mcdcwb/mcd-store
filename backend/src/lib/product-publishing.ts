// Regras para publicar um produto na loja. Produtos não publicados (ex.: banner do carrossel)
// podem ficar sem nome, sem preço (gravado como 0), sem variantes e sem cor informada:
// nesse caso o backend cria uma cor interna só para guardar as imagens (as imagens ficam na cor).
// Compartilhado com o painel (src/app/manager/products.ts).
// Sem imports: o painel e os testes unitários (Node) importam este arquivo diretamente.

// Nome do produto: obrigatório (mín. 3 caracteres) só para produtos publicados na loja.
// Não publicados (ex.: banner do carrossel com foto da loja) podem ficar sem nome, gravado como "".
export const publishedNameMinLength = 3;
export const publishedNameMessage = "Informe o nome do produto (mínimo de 3 caracteres) para publicá-lo na loja.";
export const hasPublishableName = (name: string) => name.trim().length >= publishedNameMinLength;

export const internalBannerColor = { colorName: "Banner", colorValue: "#000000" } as const;
export const isInternalBannerColor = (color: { colorName: string; colorValue: string }) =>
    color.colorName.trim() === internalBannerColor.colorName && color.colorValue.trim().toUpperCase() === internalBannerColor.colorValue;
export const isHexColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value.trim());

export const publishedPriceMessage = "Informe um preço maior que zero para publicar o produto na loja.";
export const publishedColorsMessage = "Adicione pelo menos uma cor para publicar o produto na loja.";
export const publishedColorFieldsMessage = "Informe o nome e o valor HEX (#RRGGBB) de cada cor para publicar o produto na loja.";
export const internalColorMessage = "Troque a cor interna do banner por uma cor real (nome e HEX) para publicar o produto na loja.";

// Primeiro motivo que impede a publicação, ou null se o produto pode ficar na loja.
export function publicationIssue(product: { name: string; price: number; colors: { colorName: string; colorValue: string }[] }): string | null {
    if (!hasPublishableName(product.name)) return publishedNameMessage;
    if (!Number.isFinite(product.price) || product.price <= 0) return publishedPriceMessage;
    if (!product.colors.length) return publishedColorsMessage;
    if (product.colors.some(color => !color.colorName.trim() || !isHexColor(color.colorValue))) return publishedColorFieldsMessage;
    if (product.colors.some(isInternalBannerColor)) return internalColorMessage;
    return null;
}

// Não publicado: cor sem nome/HEX vira a cor interna; sem nenhuma cor, cria uma só para as imagens.
// T só tem campos opcionais além destes (id, imageUrl), então a cor nova cabe em T.
export function withInternalColor<T extends { colorName: string; colorValue: string; images: string[]; variants: unknown[] }>(colors: T[]): T[] {
    if (!colors.length) return [{ ...internalBannerColor, images: [], variants: [] } as unknown as T];
    return colors.map(color => ({
        ...color,
        colorName: color.colorName.trim() || internalBannerColor.colorName,
        colorValue: isHexColor(color.colorValue) ? color.colorValue.trim().toUpperCase() : internalBannerColor.colorValue
    }));
}
