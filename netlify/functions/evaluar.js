import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const handler = async (event) => {

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

    const reportes = registros.map((r, i) => ({
      id: i,
      descripcion: r.descripcion || "",
      accion: r.accion || "",
    }));

    const prompt = `
Eres auditor SISO en planta.

Evalúa con criterio real.

- Si hay riesgo → relacionada = 30
- grupo = 10 si afecta personas o área
- corrige = 60 si corrige
- informa = 25 si comunica

Nunca corrige e informa juntos.

RESPONDE SOLO JSON.

${JSON.stringify(reportes, null, 2)}
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Responde solo JSON." },
        { role: "user", content: prompt }
      ],
      temperature: 0,
    });

    let contenido = completion.choices[0].message.content
      .replace(/```json|```/g, "")
      .trim();

    let evaluaciones = [];

    try {
      evaluaciones = JSON.parse(contenido);
    } catch {
      const match = contenido.match(/\[[\s\S]*\]/);
      if (match) evaluaciones = JSON.parse(match[0]);
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

    // 🔥 PALABRAS CLAVE
    const palabrasInforma = ["report", "inform", "avis", "comunic", "traslad"];
    const palabrasCorrige = ["repar", "corrig", "ajust", "cambi", "deten", "paro"];

    // 🔥 NUEVO → DETECTOR DE RIESGO
    const palabrasRiesgo = [
      "herramienta", "rebaba", "cable", "fuga", "presion",
      "equipo", "defecto", "dañado", "golpe", "atrap",
      "corte", "electr", "caliente", "aceite",
      "manguera", "conector", "tuberia", "arnes",
      "altura", "eslinga", "troquel", "ruido",
      "vibracion", "freno", "prensa", "esmeril",
      "extintor", "lentes", "epp", "guante", "botas"
    ];

    const resultados = registros.map((r, i) => {

      const ev = evaluaciones[i] || {};

      let relacionada = ev.relacionada === 30 ? 30 : 0;
      let grupo = ev.grupo === 10 ? 10 : 0;
      let corrige = ev.corrige === 60 ? 60 : 0;
      let informa = ev.informa === 25 ? 25 : 0;

      const texto = (r.descripcion || "").toLowerCase();
      const accion = (r.accion || "").toLowerCase();

      // 🔥 NUEVO: CORRECCIÓN DE IA
      if (palabrasRiesgo.some(p => texto.includes(p))) {
        relacionada = 30;
      }

      // 🔥 CASO CRÍTICO (tu ejemplo real)
      if (texto.includes("arnes") || texto.includes("altura")) {
        relacionada = 30;
      }

      // 🔥 SI HAY RIESGO → FORZAR GRUPO
      if (relacionada === 30) {
        grupo = 10;
      }

      // 🔥 INFORMAR
      if (palabrasInforma.some(p => accion.includes(p))) {
        informa = 25;
      }

      // 🔥 CORREGIR
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
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
