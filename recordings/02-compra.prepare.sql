-- Preparação do vídeo 02-compra (rodar ANTES de cada gravação, só no banco LOCAL mcd_store_demo):
-- remove o usuário do roteiro para o cadastro funcionar de novo. Pedidos não caem em cascata
-- (RESTRICT), então saem primeiro (itens e histórico de status caem junto); depois o usuário
-- (carrinho, endereço e favoritos caem em cascata). Nunca toca em clientes fictícios (isDemo).
--
--   U=$(docker exec postgres-mcd-store printenv POSTGRES_USER)
--   docker exec -i postgres-mcd-store psql -U $U -d mcd_store_demo -v ON_ERROR_STOP=1 < recordings/02-compra.prepare.sql
BEGIN;
DELETE FROM "Order" WHERE "userId" IN (SELECT id FROM "User" WHERE lower(email) = 'joaodasilva@demonstrativo.com' AND "isDemo" = false);
DELETE FROM "User" WHERE lower(email) = 'joaodasilva@demonstrativo.com' AND "isDemo" = false;
COMMIT;
