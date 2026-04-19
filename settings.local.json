/**
 * Edge Function: verificar-certificado
 * Endpoint público para validação externa de certificados via código.
 *
 * GET /functions/v1/verificar-certificado?codigo=CRT-XXXXXX-YYYYYYY
 *
 * Resposta 200 (encontrado):
 *   { valido, status, codigo, aluno, curso, carga_horaria, data_emissao, data_validade }
 *
 * Resposta 404 (não encontrado):
 *   { valido: false, erro: "Certificado não encontrado." }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type':                 'application/json',
};

Deno.serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  const url    = new URL(req.url);
  const codigo = url.searchParams.get('codigo')?.trim().toUpperCase();

  if (!codigo) {
    return new Response(
      JSON.stringify({ valido: false, erro: 'Parâmetro "codigo" obrigatório.' }),
      { status: 400, headers: CORS },
    );
  }

  // Service role: sem RLS — acesso público de leitura controlado aqui
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data, error } = await supabase
    .from('certificados')
    .select(`
      codigo_verificacao,
      status,
      data_emissao,
      data_validade,
      aluno:aluno_id ( nome ),
      curso:curso_id ( nome, carga_horaria )
    `)
    .eq('codigo_verificacao', codigo)
    .single();

  if (error || !data) {
    return new Response(
      JSON.stringify({ valido: false, erro: 'Certificado não encontrado.' }),
      { status: 404, headers: CORS },
    );
  }

  const valido = data.status === 'valido' || data.status === 'a_vencer';

  return new Response(
    JSON.stringify({
      valido,
      status:        data.status,
      codigo:        data.codigo_verificacao,
      aluno:         (data.aluno as any)?.nome  ?? null,
      curso:         (data.curso as any)?.nome  ?? null,
      carga_horaria: (data.curso as any)?.carga_horaria ?? null,
      data_emissao:  data.data_emissao,
      data_validade: data.data_validade ?? null,
    }),
    { status: 200, headers: CORS },
  );
});
