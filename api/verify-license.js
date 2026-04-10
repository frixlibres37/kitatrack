export default async function handler(req, res){
  if(req.method !== 'POST'){
    return res.status(405).json({ valid:false, error:'Method not allowed' });
  }

  try{
    const { key } = req.body;

    if(!key){
      return res.status(400).json({ valid:false, error:'Missing key' });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/licenses?license_key=eq.${encodeURIComponent(key)}&status=eq.active&select=*`,
      {
        headers:{
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );

    const data = await response.json();

    if(!data.length){
      return res.json({ valid:false, error:'Invalid license key' });
    }

    const lic = data[0];

    if(lic.expires_at && new Date(lic.expires_at) < new Date()){
      return res.json({ valid:false, error:'License expired' });
    }

    return res.json({
      valid:true,
      key,
      plan: lic.plan,
      name: lic.customer_name,
      expires: lic.expires_at || null
    });

  }catch(e){
    return res.status(500).json({ valid:false, error:'Server error' });
  }
}
