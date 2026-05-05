const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

exports.handler = async function (event) {

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    };
  }

  try {
    const { registros } = JSON.parse(event.body);

    if (!registros || registros.length === 0) {
      throw new Error("No hay registros");
    }

    const reportes = registros.map((r, i) => ({
      id: i,
      descripcion: r.descripcion,
      accion: r.accion,
    }));

    const prompt = `Eres auditor SISO experto...

Evalúa con criterio REAL (riesgo implícito incluido).

Reglas:
- relacionada: 30 si hay riesgo (aunque sea potencial)
- grupo: 10 si menciona persona
- corrige: 60 si corrige
- informa: 25 si solo reporta
- nunca corrige + informa juntos

Responde SOLO JSON válido.

REPORTES:
${JSON.stringify(reportes, null, 2)}
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Responde solo JSON válido." },
        { role: "user", content: prompt }
      ],
      temperature: 0,
    });

    let contenido = completion.choices[0].message.content.trim();

    // limpiar markdown
    contenido = contenido.replace(/```json|```/g, "").trim();

    let evaluaciones = JSON.parse(contenido);

    const resultados = registros.map((r, i) => {
      const ev = evaluaciones[i] || {};

      let relacionada = ev.relacionada === 30 ? 30 : 0;
      let grupo = ev.grupo === 10 ? 10 : 0;
      let corrige = ev.corrige === 60 ? 60 : 0;
      let informa = ev.informa === 25 ? 25 : 0;

      if (corrige === 60 && informa === 25) {
        informa = 0;
      }

      return {
        "No. ACII": r.numero,
        "Descripción": r.descripcion,
        "Acción Inmediata": r.accion,
        "Relacionada SISO (30)": relacionada,
        "Grupo específico (10)": grupo,
        "Corrige (60)": corrige,
        "Informa (25)": informa,
        "Total": relacionada + grupo + corrige + informa,
        "Área": r.area,
        "Comentario IA": ev.comentario || "",
      };
    });

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(resultados),
    };

  } catch (err) {
    console.error(err);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message,
      }),
    };
  }
};
