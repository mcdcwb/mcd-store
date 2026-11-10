-- Fim do modelo antigo do modo demonstração (conta Admin isDemo + login DEMO).
-- O modo demonstração agora é o próprio cliente (USER) com leitura do painel.
-- 1) Apaga a(s) conta(s) demo ANTES de remover a coluna: sem a coluna, o login deixaria de
--    distinguir essa conta e ela viraria um ADMIN comum. Os favoritos dela saem em cascata.
DELETE FROM "Admin" WHERE "isDemo" = true;

-- 2) AlterTable
ALTER TABLE "Admin" DROP COLUMN "isDemo";
