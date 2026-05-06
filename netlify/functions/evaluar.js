import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const handler = async (event) => {

  // 🔥 CORS
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

    // 🔥 PROMPT MEJORADO
    const prompt = `
Eres un auditor corporativo SISO experto en seguridad industrial.

Analiza reportes ACII de plantas industriales reales.

Debes evaluar usando criterio PROFESIONAL REAL.

=================================================
CRITERIOS

1. relacionada = 30

Asignar 30 si existe:
- acto inseguro
- condición insegura
- riesgo potencial de lesión
- riesgo operativo
- riesgo mecánico
- riesgo eléctrico
- riesgo químico
- riesgo ergonómico
- riesgo de caída
- riesgo de tropiezo
- riesgo de golpe
- riesgo de atrapamiento
- riesgo de incendio
- riesgo de explosión
- riesgo respiratorio
- riesgo por presión
- falla de equipo
- falla de protección

IMPORTANTE:
La falta de uso correcto de EPP SIEMPRE es acto inseguro.

Incluye:
- mascarilla
- lentes
- guantes
- casco
- arnés
- tapones auditivos
- botas
- chaleco
- careta
- polainas
- gabacha
- protección facial

También considerar riesgo:
- fugas
- derrames
- ruedas dañadas
- escalones dañados
- cables
- tableros eléctricos
- troqueladoras
- esmeril
- oxicorte
- montacargas
- obstáculos
- carros dañados
- herramientas tiradas
- desorden excesivo
- fugas neumáticas
- químicos sin identificación
- estanterías sin anclaje
- guardas dañadas
- mangueras atravesadas
- superficies deslizantes

=================================================

2. grupo = 10

Asignar 10 si:
- afecta personas
- afecta colaboradores
- afecta tránsito
- afecta operación
- afecta área operativa

Si relacionada = 30 normalmente grupo también debe ser 10.

=================================================

3. corrige = 60

Asignar 60 SOLO si:
el riesgo YA FUE eliminado o controlado físicamente.

SOLO usar corrige cuando:
- ya repararon
- ya instalaron
- ya limpiaron
- ya retiraron
- ya bloquearon
- ya separaron
- ya reemplazaron
- ya corrigieron
- ya sujetaron
- ya apagaron
- ya detuvieron
- ya colocaron protección
- ya cambiaron pieza/equipo

Ejemplos válidos:
- se limpió
- se cambió
- se reparó
- se retiró
- se movió
- se bloquearon energías
- se instalaron guardas
- se colocó señalización
- se aseguraron piezas

NO usar corrige si:
- se reporta
- se avisa
- se informa
- se solicita
- se programa
- se coordina
- se planifica
- se agenda
- se dará seguimiento
- se retroalimenta
- se aborda al colaborador
- se pide apoyo
- queda pendiente
- “favor revisar”
- “favor corregir”

IMPORTANTE:
“reportar” NUNCA es corrección.
“avisar” NUNCA es corrección.
“retroalimentar” NO es corrección física.
“programar” NO significa que ya se corrigió.
“agendar” NO significa que ya se corrigió.
“planificar” NO significa que ya se corrigió.

=================================================

4. informa = 25

Asignar 25 si:
- solo se comunica
- solo se reporta
- solo se informa
- solo se avisa
- se solicita seguimiento
- se escala
- queda pendiente
- se coordina
- se planifica
- se agenda

=================================================

REGLAS IMPORTANTES

- Nunca usar corrige=60 e informa=25 juntos.
- Si el riesgo sigue existiendo → NO usar corrige.
- Si la acción solo comunica → usar informa.
- Si corrigieron físicamente → normalmente existía riesgo.
- Si se usa EPP incorrectamente → relacionada=30.
- Si existe derrame o fuga → relacionada=30.
- Si existe riesgo de caída/tropiezo → relacionada=30.

=================================================

EJEMPLOS

Descripción:
Colaborador sin mascarilla en área operativa

Acción:
Se aborda y retroalimenta sobre uso de EPP

Salida:
{"relacionada":30,"grupo":10,"corrige":0,"informa":25}

---

Descripción:
Cable expuesto en pasillo

Acción:
Se reporta a mantenimiento

Salida:
{"relacionada":30,"grupo":10,"corrige":0,"informa":25}

---

Descripción:
Cable expuesto en pasillo

Acción:
Se reemplaza el cable

Salida:
{"relacionada":30,"grupo":10,"corrige":60,"informa":0}

---

Descripción:
Aceite derramado en área de paso

Acción:
Se limpia inmediatamente

Salida:
{"relacionada":30,"grupo":10,"corrige":60,"informa":0}

---

Descripción:
Montacargas circula en área restringida

Acción:
Se reporta

Salida:
{"relacionada":30,"grupo":10,"corrige":0,"informa":25}

---

Descripción:
Herramientas tiradas en el suelo

Acción:
Aplicar 5S

Salida:
{"relacionada":30,"grupo":10,"corrige":0,"informa":25}

---

Descripción:
Rejillas necesitan pintura amarilla

Acción:
Agendar pintura

Salida:
{"relacionada":30,"grupo":10,"corrige":0,"informa":25}

---

Descripción:
Ducha lava ojos inexistente

Acción:
Comprar e instalar ducha lava ojos

Salida:
{"relacionada":30,"grupo":10,"corrige":60,"informa":0}

=================================================

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
            "Eres un auditor corporativo SISO experto. Responde SOLO JSON válido."
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

      const match = contenido.match(/\[[\\s\\S]*\\]/);

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

    // 🔥 VALIDACIONES DE CONSISTENCIA
    const resultados = registros.map((r, i) => {

      const ev = evaluaciones[i] || {};

      let relacionada = ev.relacionada === 30 ? 30 : 0;
      let grupo = ev.grupo === 10 ? 10 : 0;
      let corrige = ev.corrige === 60 ? 60 : 0;
      let informa = ev.informa === 25 ? 25 : 0;

      const descripcion = (r.descripcion || "").toLowerCase();
      const accion = (r.accion || "").toLowerCase();

      // 🔥 Nunca corrige e informa juntos
      if (corrige === 60) {
        informa = 0;
      }

      // 🔥 Si hay riesgo normalmente hay grupo
      if (relacionada === 30 && grupo === 0) {
        grupo = 10;
      }

      // 🔥 Si corrigió físicamente → había riesgo
      if (corrige === 60 && relacionada === 0) {
        relacionada = 30;
        grupo = 10;
      }

      // 🔥 Si acción es solo administrativa → NO corregir
      const accionesAdministrativas = [
        "program",
        "agend",
        "coord",
        "solicit",
        "seguimiento",
        "report",
        "avis",
        "inform",
        "retroaliment",
        "abord",
        "planific"
      ];

      if (
        corrige === 60 &&
        accionesAdministrativas.some(p =>
          accion.includes(p)
        ) &&
        !accion.includes("se limp") &&
        !accion.includes("se repar") &&
        !accion.includes("se cambi") &&
        !accion.includes("se instal") &&
        !accion.includes("se coloc") &&
        !accion.includes("se mov") &&
        !accion.includes("se retir")
      ) {

        corrige = 0;
        informa = 25;
      }

      // 🔥 Casos administrativos reales NO SISO
      const noSiso = [
        "café",
        "cafe",
        "oficina sin novedad"
      ];

      if (
        noSiso.some(p => descripcion.includes(p))
      ) {

        relacionada = 0;
        grupo = 0;
        corrige = 0;
      }

      // 🔥 Ducha lava ojos SI es SISO
      if (
        descripcion.includes("lava ojos") ||
        descripcion.includes("lavaojos")
      ) {

        relacionada = 30;
        grupo = 10;

        if (
          accion.includes("instal") ||
          accion.includes("compr")
        ) {
          corrige = 60;
          informa = 0;
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
