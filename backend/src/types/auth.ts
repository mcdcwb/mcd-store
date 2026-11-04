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
}
