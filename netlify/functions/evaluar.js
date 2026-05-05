import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const handler = async (event) => {

  // 🔹 CORS
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
    if (!event.body) {
      throw new Error("No se recibieron datos");
    }

    const { registros } = JSON.parse(event.body);

    if (!registros || registros.length === 0) {
      throw new Error("No hay registros para evaluar");
    }

    console.log(`Procesando ${registros.length} registros`);

    const reportes = registros.map((r, i) => ({
      id: i,
      descripcion: r.descripcion || "",
      accion: r.accion || "",
    }));

    // 🔥 PROMPT INTELIGENTE (NO TAN ESTRICTO)
    const prompt = `
Eres un auditor SISO experto en seguridad industrial en planta.

Evalúa cada reporte con criterio REAL (no seas demasiado estricto).

CRITERIOS:

1. relacionada:
- 30 si hay riesgo REAL o POTENCIAL
- Incluye riesgos implícitos (herramientas malas, presión, golpes, cables, etc)
- 0 solo si es administrativo sin impacto en seguridad

2. grupo:
- 10 si menciona operador, colaborador o persona
- 0 si es general

3. corrige:
- 60 si la acción corrige directamente el riesgo
- Ej: reparar, ajustar, detener, cambiar

4. informa:
- 25 si solo comunica o reporta
- Ej: "se reporta", "se avisa", "se informa"

REGLAS:
- Nunca corrige=60 e informa=25 juntos
- Si hay duda → asumir riesgo (30)
- Si dice "se reporta" → informa = 25

RESPONDE SOLO JSON válido

FORMATO:
[
  {
    "relacionada": 30,
    "grupo": 10,
    "corrige": 0,
    "informa": 25,
    "comentario": "Justificación clara"
  }
]

REPORTES:
${JSON.stringify(reportes, null, 2)}
`;

    // 🔹 OpenAI
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Responde únicamente JSON válido. Sin texto adicional."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.2,
    });

    let contenido = completion.choices[0].message.content.trim();

    // 🔹 limpiar markdown
    contenido = contenido.replace(/```json|```/g, "").trim();

    let evaluaciones = [];

    try {
      evaluaciones = JSON.parse(contenido);
    } catch (e) {
      console.error("Error parseando JSON:", e);

      const match = contenido.match(/\[[\s\S]*\]/);
      if (match) {
        evaluaciones = JSON.parse(match[0]);
      }
    }

    // 🔹 fallback
    if (!Array.isArray(evaluaciones)) {
      evaluaciones = registros.map(() => ({
        relacionada: 0,
        grupo: 0,
        corrige: 0,
        informa: 0,
        comentario: "No evaluado",
      }));
    }

    // 🔹 resultado final
    const resultados = registros.map((r, i) => {
      const ev = evaluaciones[i] || {};

      let relacionada = ev.relacionada === 30 ? 30 : 0;
      let grupo = ev.grupo === 10 ? 10 : 0;
      let corrige = ev.corrige === 60 ? 60 : 0;
      let informa = ev.informa === 25 ? 25 : 0;

      // regla dura
      if (corrige === 60 && informa === 25) {
        informa = 0;
      }

      return {
        "No. ACII": r.numero || "",
        "Descripción": r.descripcion || "",
        "Acción Inmediata": r.accion || "",
        "Relacionada SISO (30)": relacionada,
        "Grupo específico (10)": grupo,
        "Corrige (60)": corrige,
        "Informa (25)": informa,
        "Total": relacionada + grupo + corrige + informa,
        "Área": r.area || "",
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

  } catch (error) {
    console.error("ERROR:", error);

    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        error: error.message,
      }),
    };
  }
};
