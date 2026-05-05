exports.handler = async function (event) {

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

    const reportesParaIA = registros.map((r, idx) => ({
      id: idx,
      descripcion: r.descripcion,
      accion: r.accion,
    }));

    // 🔥 PROMPT MEJORADO (ESTRICTO)
    const prompt = `Eres un auditor SISO experto en seguridad industrial.

Evalúa cada reporte con criterio profesional.

CRITERIOS:

1. relacionada:
- 30 SOLO si hay riesgo real de seguridad
- 0 si es leve (orden, limpieza, mejora menor)

2. grupo:
- 10 si menciona colaborador u operador
- 0 si es general

3. corrige:
- 60 si corrige directamente
- 0 si no

4. informa:
- 25 si solo reporta
- 0 si no

REGLAS:
- Nunca corrige=60 e informa=25 juntos
- No todos los reportes son SISO

RESPONDE SOLO JSON válido.

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
${JSON.stringify(reportesParaIA, null, 2)}`;

    // 🔹 Llamada OpenAI
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Responde solo JSON válido.",
          },
          {
            role: "user",
            content: prompt,
          }
        ],
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error OpenAI:", response.status, errorText);
      throw new Error(`OpenAI error: ${response.status}`);
    }

    const data = await response.json();
    const contenido = data.choices?.[0]?.message?.content;

    if (!contenido) {
      throw new Error("OpenAI no devolvió contenido");
    }

    console.log("Respuesta IA:", contenido);

    let evaluaciones = [];
    let cleaned = contenido.trim();

    // 🔹 Limpiar markdown
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.replace(/```json\n?/, "").replace(/\n?```$/, "");
    }
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/```\n?/, "").replace(/\n?```$/, "");
    }

    // 🔹 Parse seguro
    try {
      const parsed = JSON.parse(cleaned);
      evaluaciones = Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
      console.error("Error parseando JSON:", e);

      const match = contenido.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          evaluaciones = JSON.parse(match[0]);
        } catch {
          evaluaciones = [];
        }
      }
    }

    // 🔹 Fallback
    if (evaluaciones.length === 0) {
      evaluaciones = registros.map(() => ({
        relacionada: 0,
        grupo: 0,
        corrige: 0,
        informa: 0,
        comentario: "No evaluado",
      }));
    }

    // 🔹 Construcción final
    const resultados = registros.map((registro, index) => {
      const ev = evaluaciones[index] || {};

      let relacionada = ev.relacionada === 30 ? 30 : 0;
      let grupo = ev.grupo === 10 ? 10 : 0;
      let corrige = ev.corrige === 60 ? 60 : 0;
      let informa = ev.informa === 25 ? 25 : 0;

      if (corrige === 60 && informa === 25) {
        informa = 0;
      }

      const total = relacionada + grupo + corrige + informa;

      return {
        "No. ACII": registro.numero || "",
        "Descripción": registro.descripcion || "",
        "Acción Inmediata": registro.accion || "",
        "Relacionada SISO (30)": relacionada,
        "Grupo específico (10)": grupo,
        "Corrige (60)": corrige,
        "Informa (25)": informa,
        "Total": total,
        "Área": registro.area || "",
        "Comentario IA": ev.comentario || "Sin comentario",
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
    console.error("ERROR:", error.message);

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
