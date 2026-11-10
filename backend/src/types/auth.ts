// DEMO: conta administrativa demonstrativa, somente leitura (ver middlewares/block-demo-writes.ts).
export type AccountRole = "USER" | "ADMIN" | "DEMO";

export interface Account {
    id: number;
    name: string;
    email: string;
    role: AccountRole;
}

export interface TokenIdentity {
    id: number;
    role: AccountRole;
}
