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

    const reportes = registros.map((r, i) => ({
      id: i,
      descripcion: r.descripcion || "",
      accion: r.accion || "",
    }));

    const prompt = `
Eres auditor SISO.

PRIORIDAD MÁXIMA:
- Trabajo en altura sin arnés = riesgo crítico
- Equipos defectuosos = riesgo
- Fugas, presión, electricidad = riesgo

CRITERIOS:
- relacionada: 30 si hay riesgo real o potencial
- grupo: 10 si afecta personas o área
- corrige: 60 si corrige
- informa: 25 si solo comunica

REGLAS:
- Nunca corrige e informa juntos
- Si hay duda → relacionada = 30

RESPONDE SOLO JSON

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

    contenido = contenido.replace(/```json|```/g, "").trim();

    let evaluaciones = [];

    try {
      evaluaciones = JSON.parse(contenido);
    } catch {
      const match = contenido.match(/\[[\s\S]*\]/);
      if (match) {
        evaluaciones = JSON.parse(match[0]);
      }
    }

    if (!Array.isArray(evaluaciones)) {
      evaluaciones = registros.map(() => ({
        relacionada: 0,
        grupo: 0,
        corrige: 0,
        informa: 0,
        comentario: "Fallback IA"
      }));
    }

    const palabrasInforma = ["report", "inform", "avis", "comunic", "traslad"];
    const palabrasCorrige = ["repar", "corrig", "ajust", "cambi", "deten", "solucion"];

    const resultados = registros.map((r, i) => {

      const ev = evaluaciones[i] || {};

      let relacionada = ev.relacionada === 30 ? 30 : 0;
      let grupo = ev.grupo === 10 ? 10 : 0;
      let corrige = ev.corrige === 60 ? 60 : 0;
      let informa = ev.informa === 25 ? 25 : 0;

      const texto = (r.descripcion || "").toLowerCase();
      const accion = (r.accion || "").toLowerCase();

      // 🔥 REGLA CRÍTICA (NO FALLA NUNCA)
      if (
        texto.includes("arnes") ||
        texto.includes("altura") ||
        texto.includes("linea de vida")
      ) {
        relacionada = 30;
        grupo = 10;
      }

      // 🔥 REGLA GENERAL
      if (relacionada === 30) {
        grupo = 10;
      }

      if (palabrasInforma.some(p => accion.includes(p))) {
        informa = 25;
      }

      if (palabrasCorrige.some(p => accion.includes(p))) {
        corrige = 60;
        informa = 0;
      }

      if (corrige === 60) {
        informa = 0;
      }

      const total = relacionada + grupo + corrige + informa;

      return {
        "No. ACII": r.numero || "",
        "Descripción": r.descripcion || "",
        "Acción Inmediata": r.accion || "",
        "Relacionada SISO (30)": relacionada,
        "Grupo específico (10)": grupo,
        "Corrige (60)": corrige,
        "Informa (25)": informa,
        "Total": total,
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
