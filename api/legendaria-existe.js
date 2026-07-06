export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const correo = searchParams.get('correo');

  if (!correo) {
    return new Response(JSON.stringify({ error: 'correo requerido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = process.env.LEGENDARIA_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key no configurada' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = `https://crm-legendar-ia.vercel.app/api/clientes/existe?correo=${encodeURIComponent(correo)}`;

  try {
    const res = await fetch(url, {
      headers: { 'x-api-key': apiKey },
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ existe: false, certificacion: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ existe: false, certificacion: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
