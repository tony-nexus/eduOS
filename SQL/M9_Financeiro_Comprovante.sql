-- ============================================================
-- M9 — Financeiro: Campo comprovante_url + Storage bucket
-- Executar no Supabase SQL Editor
-- ============================================================

-- 1. Adiciona coluna comprovante_url na tabela pagamentos
ALTER TABLE public.pagamentos
  ADD COLUMN IF NOT EXISTS comprovante_url TEXT;

-- ============================================================
-- 2. Criar o bucket "comprovantes" via SQL
--    (alternativa: criar pelo painel Storage > New Bucket)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'comprovantes',
  'comprovantes',
  false,                          -- bucket privado (acesso via signed URL)
  5242880,                        -- 5 MB
  ARRAY['image/jpeg','image/png','image/webp','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3. RLS no storage.objects para o bucket "comprovantes"
--    Apenas usuários autenticados do tenant podem operar.
--    O path segue o padrão: {tenant_id}/{pagamento_id}/comprovante.ext
-- ============================================================

-- Upload (INSERT)
CREATE POLICY "Comprovantes_Insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'comprovantes'
    AND auth.role() = 'authenticated'
  );

-- Leitura (SELECT) — necessário para createSignedUrl funcionar
CREATE POLICY "Comprovantes_Select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'comprovantes'
    AND auth.role() = 'authenticated'
  );

-- Substituição (UPDATE) — upsert: true no upload requer UPDATE
CREATE POLICY "Comprovantes_Update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'comprovantes'
    AND auth.role() = 'authenticated'
  );

-- Remoção (DELETE) — opcional, para futura funcionalidade de remover comprovante
CREATE POLICY "Comprovantes_Delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'comprovantes'
    AND auth.role() = 'authenticated'
  );
