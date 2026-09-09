interface Env {
  TURSO_URL: string;
  TURSO_AUTH_TOKEN: string;
}

interface TursoResult {
  rows: Array<Array<{ value: string } | string>>;
}

interface TursoResponse {
  results: Array<{
    response?: {
      result: TursoResult;
    };
  }>;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = context.env.TURSO_URL?.replace('libsql://', 'https://');
  const token = context.env.TURSO_AUTH_TOKEN;

  if (!url || !token) {
    return new Response(JSON.stringify({ error: 'Turso env missing' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const response = await fetch(`${url}/v2/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            type: 'execute',
            stmt: {
              sql: 'SELECT value FROM configs WHERE key = "BACKEND_URL" LIMIT 1',
            },
          },
          { type: 'close' },
        ],
      }),
    });

    const data = (await response.json()) as TursoResponse;
    const result = data.results?.[0]?.response?.result;

    // parse turso rows
    let backendUrl: string | null = null;
    if (result?.rows?.[0]) {
      const row = result.rows[0];
      const firstCol = row[0];
      if (
        typeof firstCol === 'object' &&
        firstCol !== null &&
        'value' in firstCol
      ) {
        backendUrl = firstCol.value;
      } else if (typeof firstCol === 'string') {
        backendUrl = firstCol;
      }
    }

    if (!backendUrl) {
      return new Response(
        JSON.stringify({ error: 'URL not found in DB', details: data }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(JSON.stringify({ url: backendUrl }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=0, stale-while-revalidate=0',
      },
    });
  } catch (err: unknown) {
    console.error('[get-url]', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
