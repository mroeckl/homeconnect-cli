const okJson = (data: unknown = {}) =>
  new Response(JSON.stringify({ data }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
    },
  });

const dishProgram = {
  key: 'Dishcare.Dishwasher.Program.Eco50',
  name: 'Eco 50',
  options: [
    {
      key: 'Dishcare.Dishwasher.Option.ExtraDry',
      name: 'Extra Dry',
      constraints: {
        allowedvalues: [true, false],
      },
    },
    {
      key: 'Dishcare.Dishwasher.Option.SilenceOnDemand',
      name: 'Silence on Demand',
      constraints: {
        allowedvalues: [true, false],
      },
    },
  ],
};

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  const method = init?.method ?? 'GET';

  if (method === 'PUT' || method === 'DELETE') {
    return new Response(null, { status: 204 });
  }

  if (url.includes('/programs/selected')) {
    return okJson(dishProgram);
  }

  if (url.includes('/programs/active')) {
    return okJson(dishProgram);
  }

  if (url.includes('/programs/available/')) {
    return okJson(dishProgram);
  }

  if (url.endsWith('/programs/available')) {
    return okJson({
      programs: [
        {
          key: 'Dishcare.Dishwasher.Program.Eco50',
          name: 'Eco 50',
        },
      ],
    });
  }

  if (url.includes('/homeappliances')) {
    return okJson({ homeappliances: [] });
  }

  return okJson();
};
