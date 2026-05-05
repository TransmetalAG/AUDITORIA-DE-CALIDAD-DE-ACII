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
    const { registros } = JSON.parse(event.body || "{}");

    if (!registros || registros.length === 0) {
      throw new Error("No hay registros");
    }

    console.log(`Procesando ${registros.length}`);

    // 🔥 FUNCIONES AUXILIARES
    const normalizar = (t) =>
      (t || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    const contiene = (texto, lista) =>
      lista.some((p) => texto.includes(p));

    // 🔥 PALABRAS CLAVE INDUSTRIALES
    const palabrasRiesgo = [
      "rebaba","filo","corte","golpe","caer","caida","atrap",
      "cable","electrico","fuga","presion","hidraul",
      "herramienta","inadecuada","defecto","mal estado",
      "sello","empaque","guia","prensa","embutido",
      "temperatura","calor"
    ];

    const palabrasInformar = [
      "report","inform","avis","comunic","traslad"
    ];

    const palabrasCorregir = [
      "repar","cambi","ajust","corrig","deten","arregl","solucion"
    ];

    // 🔥 PRE-EVALUACIÓN INTELIGENTE
    const preEvaluados = registros.map((r) => {

      const desc = normalizar(r.descripcion);
      const acc = normalizar(r.accion);

      let relacionada = contiene(desc, palabrasRiesgo) ? 30 : 0;
      let informa = contiene(acc, palabrasInformar) ? 25 : 0;
      let corrige = contiene(acc, palabrasCorregir) ? 60 : 0;

      // 🔥 regla fuerte
      if (corrige === 60) informa = 0;

      return {
        relacionada,
        informa,
        corrige
      };
    });

    // 🔥 SOLO IA PARA AJUSTES FINOS
    const prompt = `Eres auditor SISO.

Ajusta SOLO si es necesario estos valores.

REGLAS:
- Si hay riesgo implícito → relacionada = 30
- Si solo comunica → informa = 25
- Si corrige → corrige = 60
- Nunca corrige + informa juntos

RESPONDE SOLO JSON.

DATOS:
${JSON.stringify(registros.map((r,i)=>({
  descripcion: r.descripcion,
  accion: r.accion,
  base: preEvaluados[i]
})), null, 2)}
`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Responde SOLO JSON" },
          { role: "user", content: prompt }
        ],
        temperature: 0,
      }),
    });

    const data = await response.json();
    let contenido = data.choices?.[0]?.message?.content || "[]";

    contenido = contenido.replace(/```json|```/g, "");

    let evaluaciones = [];

    try {
      evaluaciones = JSON.parse(contenido);
    } catch {
      evaluaciones = [];
    }

    // 🔥 RESULTADO FINAL (combina IA + reglas)
    const resultados = registros.map((r, i) => {

      const base = preEvaluados[i];
      const ia = evaluaciones[i] || {};

      let relacionada = ia.relacionada ?? base.relacionada;
      let grupo = ia.grupo === 10 ? 10 : 0;
      let corrige = ia.corrige ?? base.corrige;
      let informa = ia.informa ?? base.informa;

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
        "Comentario IA": ia.comentario || "Evaluado automáticamente",
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
