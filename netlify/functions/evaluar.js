export async function handler(event) {
  const { registros } = JSON.parse(event.body);

  const resultados = [];

  for (const r of registros) {
    const prompt = `
Eres auditor de seguridad industrial.

Evalúa este reporte ACII con estos criterios:

- Relacionada SISO (0-30)
- Grupo específico (0-10)
- Corrige (0-60)
- Informa (0-25)

Devuelve SOLO JSON válido sin texto adicional:

{
  "relacionada": 0,
  "grupo": 0,
  "corrige": 0,
  "informa": 0,
  "total": 0,
  "comentario": ""
}

REPORTE:
Descripción: ${r.descripcion}
Acción: ${r.accion}
Área: ${r.area}
`;

    let evaluacion = {
      relacionada: 0,
      grupo: 0,
      corrige: 0,
      informa: 0,
      total: 0,
      comentario: "Error IA",
    };

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          input: prompt,
        }),
      });

      const data = await response.json();

      const texto = data.output?.[0]?.content?.[0]?.text || "";

      const jsonMatch = texto.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        evaluacion = JSON.parse(jsonMatch[0]);
      }

    } catch (error) {
      console.error("Error IA:", error);
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
