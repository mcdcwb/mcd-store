export interface Address { cep: string; street: string; number: string; complement: string; neighborhood: string; city: string; state: string }
export const emptyAddress: Address = { cep: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "" };
export const formatCep = (value: string) => value.replace(/\D/g, "").slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");
export async function lookupCep(cep: string, signal: AbortSignal): Promise<Pick<Address, "street" | "neighborhood" | "city" | "state">> {
  const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal });
  if (!response.ok) throw new Error("Consulta de CEP indisponível. Preencha o endereço manualmente.");
  const data = await response.json();
  if (data.erro) throw new Error("CEP não encontrado. Confira o CEP ou preencha o endereço manualmente.");
  if (![data.logradouro, data.bairro, data.localidade, data.uf].every(value => typeof value === "string")) throw new Error("Resposta de CEP inválida. Preencha o endereço manualmente.");
  return { street: data.logradouro, neighborhood: data.bairro, city: data.localidade, state: data.uf };
}
