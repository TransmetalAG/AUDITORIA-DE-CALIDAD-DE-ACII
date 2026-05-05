export async function handler(event) {
  const { registros } = JSON.parse(event.body);

  const resultados = [];

  for (const r of registros) {
    const prompt = `
Eres auditor de seguridad industrial.

Evalúa este reporte ACII con estos criterios:

1. Relacionada SISO (30%)
2. Grupo específico (10%)
3. Corrige (60%) o Informa (25%)

Devuelve SOLO JSON así:
{
  "relacionada": 0-30,
  "grupo": 0-10,
  "corrige": 0-60,
  "informa": 0-25,
  "total": suma,
  "comentario": "breve análisis"
}

REPORTE:
Descripción: ${r.descripcion}
Acción: ${r.accion}
Área: ${r.area}
`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      }),
    });

    const data = await response.json();

    let evaluacion = {
      relacionada: 0,
      grupo: 0,
      corrige: 0,
      informa: 0,
      total: 0,
      comentario: "Error IA",
    };

    try {
      const texto = data.choices[0].message.content;
      evaluacion = JSON.parse(texto);
    } catch (e) {
      console.error("Error parsing IA", e);
    }

    resultados.push({
      "No. ACII": r.numero,
      "Descripción": r.descripcion,
      "Acción Inmediata": r.accion,
      "Relacionada SISO (30)": evaluacion.relacionada,
      "Grupo específico (10)": evaluacion.grupo,
      "Corrige (60)": evaluacion.corrige,
      "Informa (25)": evaluacion.informa,
      "Total": evaluacion.total,
      "Área": r.area,
      "Comentario IA": evaluacion.comentario,
    });
  }

  return {
    statusCode: 200,
    body: JSON.stringify(resultados),
  };
}
