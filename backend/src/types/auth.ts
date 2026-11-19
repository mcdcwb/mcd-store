export type AccountRole = "USER" | "ADMIN";

export interface Account {
    id: number;
    name: string;
    email: string;
    role: AccountRole;
}

export interface TokenIdentity {
    id: number;
    role: AccountRole;
    // "iat" do JWT, em segundos: o cliente recusa token emitido antes da última troca de senha.
    issuedAt?: number;
}
