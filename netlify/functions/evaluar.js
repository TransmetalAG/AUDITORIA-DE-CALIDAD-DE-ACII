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
    const { registros } = JSON.parse(event.body || "{}");

    if (!registros || registros.length === 0) {
      throw new Error("No hay registros");
    }

    console.log(`Procesando ${registros.length}`);

    // 🔥 NORMALIZADOR
    const normalizar = (t) =>
      (t || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    // 🔥 CATEGORÍAS DE RIESGO
    const categorias = [
      ["arnes","altura","linea de vida","enganchar"],
      ["cable","electrico","voltaje"],
      ["prensa","atrap","golpe","movimiento"],
      ["rebaba","filo","corte"],
      ["fuga","presion","hidraul","sello"],
      ["caliente","horno","temperatura"],
      ["herramienta","inadecuada"]
    ];

    const palabrasInforma = ["report","inform","avis","comunic","traslad"];
    const palabrasCorrige = ["repar","corrig","ajust","cambi","deten","solucion"];

    // 🔥 PRE-EVALUACIÓN (REGLAS)
    const base = registros.map((r) => {

      const desc = normalizar(r.descripcion);
      const acc = normalizar(r.accion);

      let relacionada = 0;
      let grupo = 0;
      let corrige = 0;
      let informa = 0;

      // 🔴 RIESGO
      for (let cat of categorias) {
        if (cat.some(p => desc.includes(p))) {
          relacionada = 30;
          grupo = 10;
          break;
        }
      }

      // 🟡 INFORMAR
      if (palabrasInforma.some(p => acc.includes(p))) {
        informa = 25;
      }

      // 🟢 CORREGIR
      if (palabrasCorrige.some(p => acc.includes(p))) {
        corrige = 60;
        informa = 0;
      }

      return { relacionada, grupo, corrige, informa };
    });

    // 🔥 IA SOLO PARA COMPLEMENTAR
    const prompt = `
Eres auditor SISO.

Ajusta SOLO si es necesario.

REGLAS:
- Si hay riesgo → relacionada = 30
- Si hay riesgo → grupo = 10
- Si corrige → corrige = 60
- Si solo comunica → informa = 25
- Nunca corrige + informa juntos

RESPONDE SOLO JSON.

DATOS:
${JSON.stringify(registros.map((r,i)=>({
  descripcion: r.descripcion,
  accion: r.accion,
  base: base[i]
})), null, 2)}
`;

    let evaluaciones = [];

    try {
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Responde SOLO JSON" },
          { role: "user", content: prompt }
        ],
        temperature: 0,
      });

      let contenido = completion.choices[0].message.content;

      contenido = contenido.replace(/```json|```/g, "");

      try {
        evaluaciones = JSON.parse(contenido);
      } catch {
        const match = contenido.match(/\[[\s\S]*\]/);
        if (match) evaluaciones = JSON.parse(match[0]);
      }

    } catch (e) {
      console.log("IA falló, usando solo reglas");
    }

    // 🔥 RESULTADO FINAL
    const resultados = registros.map((r, i) => {

      const b = base[i];
      const ia = evaluaciones[i] || {};

      let relacionada = ia.relacionada ?? b.relacionada;
      let grupo = ia.grupo ?? b.grupo;
      let corrige = ia.corrige ?? b.corrige;
      let informa = ia.informa ?? b.informa;

      // 🔥 REGLAS FINALES (ANTI-ERROR IA)
      if (relacionada === 30) grupo = 10;
      if (corrige === 60) informa = 0;

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
        "Comentario IA": ia.comentario || "Evaluado con reglas + IA",
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
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
