import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = new URL(req.url);
    const date = url.searchParams.get('date') ?? new Date().toISOString().slice(0,10);
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: summary } = await supabase.from('mv_daily_stats').select('*').eq('date', date).single();
    const { data: admissions } = await supabase.from('lsmd')
      .select('id_case, patient_name, admission_time, admission_department, icd_primary')
      .eq('admission_date_d', date).order('admission_time');
    return new Response(JSON.stringify({ date, summary, total: admissions?.length ?? 0, admissions }),
      { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
