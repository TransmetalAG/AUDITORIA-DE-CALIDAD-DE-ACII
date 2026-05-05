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

    // 🔥 PROMPT MEJORADO (más claro pero sin sobrecargar)
    const prompt = `
Eres auditor SISO en planta industrial.

Evalúa con criterio REAL.

PRIORIDAD:
- Si hay riesgo físico → relacionada = 30
- Si hay duda → asumir riesgo

CRITERIOS:
- grupo = 10 si afecta personas o área operativa
- corrige = 60 si corrige
- informa = 25 si solo comunica

REGLAS:
- Nunca corrige e informa juntos

RESPONDE SOLO JSON

REPORTES:
${JSON.stringify(reportes, null, 2)}
`;

    // 🔹 OpenAI
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Responde solo JSON válido." },
        { role: "user", content: prompt }
      ],
      temperature: 0,
    });

    let contenido = completion.choices[0].message.content.trim();

    console.log("RAW IA:", contenido);

    // 🔹 limpiar markdown
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

    // 🔹 fallback seguro
    if (!Array.isArray(evaluaciones)) {
      evaluaciones = registros.map(() => ({
        relacionada: 0,
        grupo: 0,
        corrige: 0,
        informa: 0,
        comentario: "Fallback IA"
      }));
    }

    // 🔥 PALABRAS CLAVE (flexibles)
    const palabrasInforma = ["report", "inform", "avis", "comunic", "traslad"];
    const palabrasCorrige = ["repar", "corrig", "ajust", "cambi", "deten", "solucion", "paro"];

    // 🔥 PALABRAS DE RIESGO (CLAVE)
    const palabrasRiesgo = [
      "herramienta",
      "rebaba",
      "cable",
      "fuga",
      "presion",
      "equipo",
      "defecto",
      "dañado",
      "golpe",
      "atrap",
      "filo",
      "corte",
      "electr",
      "caliente",
      "temperatura",
      "aceite",
      "aire",
      "manguera",
      "conector",
      "tuberia",
      "arnes",
      "altura"
    ];

    // 🔹 resultado final (HÍBRIDO)
    const resultados = registros.map((r, i) => {

      const ev = evaluaciones[i] || {};

      let relacionada = ev.relacionada === 30 ? 30 : 0;
      let grupo = ev.grupo === 10 ? 10 : 0;
      let corrige = ev.corrige === 60 ? 60 : 0;
      let informa = ev.informa === 25 ? 25 : 0;

      const texto = (r.descripcion || "").toLowerCase();
      const accion = (r.accion || "").toLowerCase();

      // 🔥 1. DETECCIÓN FORZADA DE RIESGO
      if (palabrasRiesgo.some(p => texto.includes(p))) {
        relacionada = 30;
      }

      // 🔥 2. CASOS CRÍTICOS (altura / arnés)
      if (
        texto.includes("arnes") ||
        texto.includes("altura") ||
        texto.includes("linea de vida")
      ) {
        relacionada = 30;
      }

      // 🔥 3. SI HAY RIESGO → HAY PERSONAS
      if (relacionada === 30) {
        grupo = 10;
      }

      // 🔥 4. DETECCIÓN DE INFORMAR
      if (palabrasInforma.some(p => accion.includes(p))) {
        informa = 25;
      }

      // 🔥 5. DETECCIÓN DE CORREGIR
      if (palabrasCorrige.some(p => accion.includes(p))) {
        corrige = 60;
        informa = 0;
      }

      // 🔥 6. REGLA DURA
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
