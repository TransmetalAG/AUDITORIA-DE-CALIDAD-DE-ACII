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

    if (!registros || registros.length === 0) {
      throw new Error("No hay registros");
    }

    const reportes = registros.map((r, i) => ({
      id: i,
      descripcion: r.descripcion || "",
      accion: r.accion || "",
    }));

    // 🔥 NUEVO PROMPT BASADO EN PRINCIPIOS
    const prompt = `
Eres un auditor corporativo SISO experto en seguridad industrial.

Tu trabajo es analizar reportes ACII de diferentes plantas industriales.

Debes evaluar usando CRITERIO PROFESIONAL REAL.

IMPORTANTE:
No dependas de palabras exactas.
Debes interpretar el CONTEXTO y el RIESGO IMPLÍCITO.

=========================
CRITERIOS

1. relacionada = 30
Asignar 30 si existe:
- acto inseguro
- condición insegura
- riesgo potencial de lesión
- posibilidad de:
  - caída
  - golpe
  - corte
  - atrapamiento
  - incendio
  - explosión
  - descarga eléctrica
  - exposición química
  - daño respiratorio
  - daño ergonómico
  - quemaduras
  - proyección de partículas
  - falla de equipo
  - falla de protección
  - riesgo operativo

NO limitarse a palabras específicas.

Ejemplos:
- escalones dañados → riesgo de caída
- arnés mal usado → riesgo de caída
- herramienta inadecuada → riesgo de golpe/corte
- rebaba → riesgo de corte
- fuga → riesgo potencial
- cable atravesado → riesgo de tropiezo/electrocución

=========================

2. grupo = 10

Asignar 10 si:
- afecta personas
- afecta área operativa
- afecta tránsito
- afecta operación
- afecta colaboradores

Si relacionada = 30 normalmente grupo también debe ser 10.

=========================

3. corrige = 60

Asignar 60 SOLO si la acción YA ELIMINÓ o CONTROLÓ el riesgo físicamente.

Ejemplos:
- reparar
- reemplazar
- instalar
- cambiar
- limpiar
- retirar
- bloquear
- separar
- apagar
- detener
- corregir

=========================

4. informa = 25

Asignar 25 si:
- solo se reporta
- solo se comunica
- se avisa
- se solicita seguimiento
- se escala
- se traslada
- queda pendiente de corrección

=========================

REGLAS IMPORTANTES

- Nunca usar corrige=60 e informa=25 juntos.
- Si el riesgo sigue existiendo → NO usar corrige.
- Si la acción solo comunica → usar informa.
- No todo es SISO:
  - café
  - agua
  - comodidad
  - oficina sin riesgo
NO deben marcarse como relacionadas.

=========================

RESPONDE SOLO JSON VÁLIDO

FORMATO:
[
  {
    "relacionada": 30,
    "grupo": 10,
    "corrige": 0,
    "informa": 25
  }
]

REPORTES:
${JSON.stringify(reportes, null, 2)}
`;

    // 🔥 GPT-4o
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "Eres un auditor corporativo SISO. Responde SOLO JSON válido."
        },
        {
          role: "user",
          content: prompt
        }
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

      if (match) {
        evaluaciones = JSON.parse(match[0]);
      }
    }

    // 🔥 FALLBACK
    if (!Array.isArray(evaluaciones)) {

      evaluaciones = registros.map(() => ({
        relacionada: 0,
        grupo: 0,
        corrige: 0,
        informa: 0
      }));
    }

    // 🔥 SOLO VALIDACIONES DE CONSISTENCIA
    const resultados = registros.map((r, i) => {

      const ev = evaluaciones[i] || {};

      let relacionada = ev.relacionada === 30 ? 30 : 0;
      let grupo = ev.grupo === 10 ? 10 : 0;
      let corrige = ev.corrige === 60 ? 60 : 0;
      let informa = ev.informa === 25 ? 25 : 0;

      // 🔥 CONSISTENCIA
      if (corrige === 60) {
        informa = 0;
      }

      // 🔥 si hay riesgo normalmente hay grupo
      if (relacionada === 30 && grupo === 0) {
        grupo = 10;
      }

      // 🔥 evitar administrativos absurdos
      const texto = (
        (r.descripcion || "") + " " + (r.accion || "")
      ).toLowerCase();

      const noSiso = [
        "café",
        "cafe",
        "dispensador",
        "agua pura",
        "oficina sin novedad"
      ];

      if (
        noSiso.some(p => texto.includes(p)) &&
        !texto.includes("golpe de calor")
      ) {
        relacionada = 0;
        grupo = 0;

        if (corrige === 60) {
          corrige = 0;
        }
      }

      const total =
        relacionada + grupo + corrige + informa;

      return {
        "No. ACII": r.numero || "",
        "Descripción": r.descripcion || "",
        "Acción Inmediata": r.accion || "",
        "Relacionada SISO (30)": relacionada,
        "Grupo específico (10)": grupo,
        "Corrige (60)": corrige,
        "Informa (25)": informa,
        "Total": total,
        "Área": r.area || ""
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

    console.error("❌ Error:", error);

    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        error: error.message
      }),
    };
  }
};
