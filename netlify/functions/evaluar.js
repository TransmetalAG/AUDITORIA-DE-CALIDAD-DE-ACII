exports.handler = async function (event) {
  const { registros } = JSON.parse(event.body);

  const prompt = `
Eres auditor experto en seguridad industrial (SISO).

Evalúa estos reportes ACII.

REGLAS ESTRICTAS:
- Relacionada SISO: SOLO 0 o 30
- Grupo específico: SOLO 0 o 10
- Corrige: SOLO 0 o 60
- Informa: SOLO 0 o 25

IMPORTANTE:
- Corrige e Informa NO pueden estar ambos activos
- Si corrige = 60 → informa = 0
- Si informa = 25 → corrige = 0

Devuelve SOLO JSON válido:

[
  {
    "relacionada": 0,
    "grupo": 0,
    "corrige": 0,
    "informa": 0,
    "comentario": ""
  }
]

REPORTES:
${JSON.stringify(registros)}
`;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: prompt,
      }),
    });

    const data = await response.json();

    // Extraer texto generado por la IA
    const texto = data.output?.[0]?.content?.[0]?.text || "";

    // Extraer solo el JSON
    const jsonMatch = texto.match(/\[[\s\S]*\]/);

    let evaluaciones = [];

    if (jsonMatch) {
      evaluaciones = JSON.parse(jsonMatch[0]);
    }

    // Construir resultado final validando valores
    const resultados = registros.map((r, i) => {
      const e = evaluaciones[i] || {};

      const relacionada = e.relacionada === 30 ? 30 : 0;
      const grupo = e.grupo === 10 ? 10 : 0;
      const corrige = e.corrige === 60 ? 60 : 0;
      const informa = e.informa === 25 ? 25 : 0;

      const total = relacionada + grupo + corrige + informa;

      return {
        "No. ACII": r.numero,
        "Descripción": r.descripcion,
        "Acción Inmediata": r.accion,
        "Relacionada SISO (30)": relacionada,
        "Grupo específico (10)": grupo,
        "Corrige (60)": corrige,
        "Informa (25)": informa,
        "Total": total,
        "Área": r.area,
        "Comentario IA": e.comentario || "",
      };
    });

    return {
      statusCode: 200,
      body: JSON.stringify(resultados),
    };

  } catch (error) {
    console.error("Error IA:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error IA" }),
    };
  }
};
