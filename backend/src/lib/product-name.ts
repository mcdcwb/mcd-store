// Nome do produto: obrigatório (mín. 3 caracteres) só para produtos publicados na loja.
// Não publicados (ex.: banner do carrossel com foto da loja) podem ficar sem nome, gravado como "".
// Compartilhado com o painel (src/app/manager/products.ts).
export const publishedNameMinLength = 3;
export const publishedNameMessage = "Informe o nome do produto (mínimo de 3 caracteres) para publicá-lo na loja.";
export const hasPublishableName = (name: string) => name.trim().length >= publishedNameMinLength;
