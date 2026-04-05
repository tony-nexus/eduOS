-- SQL/Insert_Demo_Tenant.sql
-- ==============================================================================================
-- O bypass de RLS funcionou! Agora o Supabase parou na última linha de defesa: a Chave Estrangeira (Foreign Key).
-- Como a tabela 'alunos' (e todas as outras) exige que o Tenant exista na tabela 'tenants',
-- precisamos fisicamente criar a "Escola de Demonstração" com o ID 00000000-0000-0000-0000-000000000000.
-- Copie e rode isso no SQL Editor do Supabase!
-- ==============================================================================================

INSERT INTO public.tenants (id, nome, cnpj, cor_primaria)
VALUES ('00000000-0000-0000-0000-000000000000', 'EduOS Demo (Acesso Único)', '00000000000000', '#cc785c')
ON CONFLICT (id) DO NOTHING;
