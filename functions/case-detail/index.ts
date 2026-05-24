import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = new URL(req.url);
    const caseId = url.searchParams.get('id');
    if (!caseId) return new Response(JSON.stringify({ error: 'id required' }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: caseData } = await supabase.from('lsmd')
      .select('*, patients_best(full_name, gender, birth_date_d, city_name)')
      .eq('id_case', caseId).single();
    return new Response(JSON.stringify({ case: caseData }),
      { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
