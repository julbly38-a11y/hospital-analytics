import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = new URL(req.url);
    const doctorId = url.searchParams.get('id');
    if (!doctorId) return new Response(JSON.stringify({ error: 'id required' }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: stats } = await supabase.from('doctor_stats').select('*').eq('doctor_id', doctorId).single();
    const { data: doctor } = await supabase.from('mv_doctor_full').select('*').eq('doctor_id', doctorId).single();
    const { data: diagnoses } = await supabase.from('doctor_diagnoses')
      .select('icd_code, diagnosis, cases, deaths').eq('doctor_id', doctorId)
      .order('cases', { ascending: false }).limit(10);
    return new Response(JSON.stringify({ doctor, stats, top_diagnoses: diagnoses }),
      { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
