exports.handler = async function (event) {
  try {
    const { registros } = JSON.parse(event.body);

    const prompt = `
Eres auditor experto en seguridad industrial (SISO).

Evalúa estos reportes ACII con estas reglas ESTRICTAS:

- Relacionada SISO: SOLO 0 o 30
- Grupo específico: SOLO 0 o 10
- Corrige: SOLO 0 o 60
- Informa: SOLO 0 o 25

IMPORTANTE:
- Corrige e Informa NO pueden estar ambos activos
- Si corrige = 60 → informa = 0
- Si informa = 25 → corrige = 0

Devuelve ÚNICAMENTE un JSON válido (sin texto adicional):

[
  {
    "relacionada": 0,
    "grupo": 0,
    "corrige": 0,
    "informa": 0,
    "comentario": ""
  }
]

REPORTES:
${JSON.stringify(registros)}
`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: prompt,
      }),
    });

    const data = await response.json();

    // 🔍 DEBUG (clave)
    console.log("RESPUESTA OPENAI:", JSON.stringify(data));

    // 🔥 EXTRAER TEXTO
    let texto = "";

    if (data.output) {
      data.output.forEach((item) => {
        item.content?.forEach((c) => {
          if (c.text) texto += c.text;
        });
      });
    }

    console.log("TEXTO IA:", texto);

    // 🔥 EXTRAER JSON
    let evaluaciones = [];

    try {
      const match = texto.match(/\[[\s\S]*\]/);
      if (match) {
        evaluaciones = JSON.parse(match[0]);
      }
    } catch (e) {
      console.log("Error parseando JSON:", e);
    }

    // 🔥 SI IA FALLA → FALLBACK INTELIGENTE
    if (evaluaciones.length === 0) {
      console.log("Usando fallback manual");

      evaluaciones = registros.map((r) => {
        const desc = (r.descripcion || "").toLowerCase();
        const acc = (r.accion || "").toLowerCase();

        let relacionada =
          desc.includes("fuga") ||
          desc.includes("riesgo") ||
          desc.includes("seguridad")
            ? 30
            : 0;

        let grupo =
          desc.includes("colaborador") ||
          desc.includes("operador")
            ? 10
            : 0;

        let corrige = acc.includes("se corrige") || acc.includes("se ajusta") ? 60 : 0;
        let informa = acc.includes("reporta") || acc.includes("informa") ? 25 : 0;

        if (corrige === 60) informa = 0;

        return {
          relacionada,
          grupo,
          corrige,
          informa,
          comentario: "Evaluación fallback",
        };
      });
    }

    // 🔥 ARMAR RESULTADO FINAL
    const resultados = registros.map((r, i) => {
      const e = evaluaciones[i] || {};

      const relacionada = e.relacionada === 30 ? 30 : 0;
      const grupo = e.grupo === 10 ? 10 : 0;
      const corrige = e.corrige === 60 ? 60 : 0;
      const informa = e.informa === 25 ? 25 : 0;

      const total = relacionada + grupo + corrige + informa;

      return {
        "No. ACII": r.numero,
        "Descripción": r.descripcion,
        "Acción Inmediata": r.accion,
        "Relacionada SISO (30)": relacionada,
        "Grupo específico (10)": grupo,
        "Corrige (60)": corrige,
        "Informa (25)": informa,
        "Total": total,
        "Área": r.area,
        "Comentario IA": e.comentario || "",
      };
    });

    return {
      statusCode: 200,
      body: JSON.stringify(resultados),
    };
  } catch (error) {
    console.error("ERROR GENERAL:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error IA" }),
    };
  }
};
