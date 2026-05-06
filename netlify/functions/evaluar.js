import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 🔥 FUNCIÓN DE NORMALIZACIÓN (corrige caracteres rotos y quita acentos)
const normalizarTexto = (str) => {
  if (!str) return "";
  return str
    .toString()
    .toLowerCase()
    // Corregir caracteres rotos comunes (por mala codificación)
    .replace(/Ã¡/g, "á")
    .replace(/Ã©/g, "é")
    .replace(/Ã­/g, "í")
    .replace(/Ã³/g, "ó")
    .replace(/Ãº/g, "ú")
    .replace(/Ã±/g, "ñ")
    .replace(/Ã¼/g, "ü")
    .replace(/Ã/g, "")
    .replace(/Â/g, "")
    // Quitar acentos
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Eliminar caracteres especiales no deseados
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
};

// 🔥 PALABRAS CLAVE AMPLIADAS
const palabrasRiesgo = [
  // Riesgos físicos
  "herramienta", "rebaba", "cable", "fuga", "presion",
  "equipo", "defecto", "dañado", "golpe", "atrap",
  "corte", "electr", "caliente", "aceite", "manguera",
  "conector", "tuberia", "arnes", "altura", "eslinga",
  "troquel", "ruido", "vibracion", "freno", "prensa",
  "esmeril", "extintor", "lentes", "epp", "guante", "botas",
  // NUEVAS PALABRAS (CRÍTICAS)
  "canaleta", "escalera", "andamio", "baranda", "quimico",
  "derrame", "suelo", "iluminacion", "ventilacion", "señalizacion",
  "guardia", "resguardo", "emergencia", "pasillo", "acceso",
  "bloqueado", "obstruccion", "caida", "resbal", "tro pieza",
  "faja", "quebrada", "ventilador", "sobrecalienta", "chispa",
  "explosion", "incendio", "humo", "gases", "polvo", "liquido"
];

const palabrasCorrige = [
  "repar", "corrig", "ajust", "cambi", "deten", "paro",
  "colocara", "colocará", "instal", "soldador", "reemplaz",
  "arregl", "solucion", "limpio", "ordeno", "reubico"
];

const palabrasInforma = [
  "report", "inform", "avis", "comunic", "traslad",
  "comento", "dijo", "notifico", "aviso"
];

// 🔥 Función para evaluar con reglas (más rápido y preciso)
const evaluarConReglas = (descripcion, accion) => {
  const textoNormalizado = normalizarTexto(descripcion);
  const accionNormalizada = normalizarTexto(accion);
  
  let relacionada = 0;
  let grupo = 0;
  let corrige = 0;
  let informa = 0;
  let usadoReglas = false;

  // 1. Detectar RIESGO por palabras clave
  const riesgoEncontrado = palabrasRiesgo.some(p => textoNormalizado.includes(p));
  
  if (riesgoEncontrado) {
    relacionada = 30;
    grupo = 10;  // Si hay riesgo, siempre afecta grupo
    usadoReglas = true;
    console.log(`✅ [REGLAS] Riesgo detectado en: "${textoNormalizado}"`);
  }

  // 2. Detectar ACCIÓN
  const corrigeEncontrado = palabrasCorrige.some(p => accionNormalizada.includes(p));
  const informaEncontrado = palabrasInforma.some(p => accionNormalizada.includes(p));

  if (corrigeEncontrado) {
    corrige = 60;
    informa = 0;
    usadoReglas = true;
    console.log(`✅ [REGLAS] Acción correctiva detectada: "${accionNormalizada}"`);
  } else if (informaEncontrado) {
    informa = 25;
    usadoReglas = true;
    console.log(`✅ [REGLAS] Acción informativa detectada: "${accionNormalizada}"`);
  }

  // Si no se detectó acción pero hay riesgo, al menos informa algo
  if (relacionada === 30 && corrige === 0 && informa === 0 && !corrigeEncontrado && !informaEncontrado) {
    informa = 25;
    console.log(`⚠️ [REGLAS] Riesgo sin acción clara → se asigna como "informa"`);
  }

  return { relacionada, grupo, corrige, informa, usadoReglas };
};

// 🔥 Función para evaluar con IA (solo casos ambiguos)
const evaluarConIA = async (reportes) => {
  const prompt = `
Eres un auditor SISO experto en seguridad industrial.

Evalúa CADA reporte y devuelve SOLO un array JSON con este formato EXACTO:

[
  { "relacionada": 30, "grupo": 10, "corrige": 60, "informa": 0 },
  { "relacionada": 0, "grupo": 0, "corrige": 0, "informa": 25 }
]

REGLAS ESTRICTAS:
- relacionada = 30 si el reporte describe un riesgo de seguridad (golpes, caídas, eléctrico, incendio, etc.)
- grupo = 10 si el riesgo afecta a personas o un área específica (si relacionada=30, grupo=10 automático)
- corrige = 60 si la acción inmediata SOLUCIONA el problema (reparar, instalar, cambiar, detener)
- informa = 25 si la acción solo COMUNICA el problema (reportar, avisar, notificar)
- NUNCA asignar corrige e informa juntos. Si corrige=60, informa debe ser 0.

Reportes a evaluar:
${JSON.stringify(reportes, null, 2)}
`;

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "Eres un auditor SISO. Responde SOLO con el array JSON, sin explicaciones." },
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
    return null;
  }

  return evaluaciones;
};

// 🔥 HANDLER PRINCIPAL
export const handler = async (event) => {
  // Manejo de CORS
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

    if (!registros || !Array.isArray(registros) || registros.length === 0) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "No se enviaron registros válidos" }),
      };
    }

    console.log(`📊 Procesando ${registros.length} registros...`);

    // 1. PRIMERO evaluar con REGLAS (rápido, gratis, preciso)
    const resultadosReglas = registros.map(r => {
      const resultado = evaluarConReglas(r.descripcion, r.accion);
      return { ...resultado, idx: r.idx };
    });

    // 2. Identificar casos ambiguos (donde las reglas no detectaron NADA)
    const casosAmbiguos = [];
    const resultadosFinales = [...resultadosReglas];

    for (let i = 0; i < registros.length; i++) {
      if (!resultadosReglas[i].usadoReglas) {
        casosAmbiguos.push({
          idx: i,
          descripcion: registros[i].descripcion,
          accion: registros[i].accion
        });
      }
    }

    console.log(`🎯 Reglas aplicadas: ${registros.length - casosAmbiguos.length} registros`);
    console.log(`🤖 Casos ambiguos para IA: ${casosAmbiguos.length} registros`);

    // 3. Solo enviar a IA los casos ambiguos (AHORRO DE COSTOS)
    if (casosAmbiguos.length > 0) {
      const evaluacionesIA = await evaluarConIA(casosAmbiguos.map(c => ({
        id: c.idx,
        descripcion: c.descripcion,
        accion: c.accion
      })));

      if (evaluacionesIA && Array.isArray(evaluacionesIA)) {
        for (let j = 0; j < casosAmbiguos.length; j++) {
          const caso = casosAmbiguos[j];
          const evIA = evaluacionesIA[j] || {};
          
          resultadosFinales[caso.idx] = {
            ...resultadosFinales[caso.idx],
            relacionada: evIA.relacionada === 30 ? 30 : 0,
            grupo: evIA.grupo === 10 ? 10 : 0,
            corrige: evIA.corrige === 60 ? 60 : 0,
            informa: evIA.informa === 25 ? 25 : 0,
            usadoReglas: false
          };
          
          console.log(`🤖 [IA] Evaluado caso ambiguo ${caso.idx}`);
        }
      }
    }

    // 4. Construir respuesta final
    const resultados = registros.map((r, i) => {
      const ev = resultadosFinales[i];
      
      let relacionada = ev?.relacionada || 0;
      let grupo = ev?.grupo || 0;
      let corrige = ev?.corrige || 0;
      let informa = ev?.informa || 0;

      // Validación final: si hay riesgo, grupo debe ser 10
      if (relacionada === 30 && grupo !== 10) {
        grupo = 10;
      }

      // Validación final: si corrige=60, informa debe ser 0
      if (corrige === 60 && informa !== 0) {
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
        "Área": r.area || ""
      };
    });

    console.log(`✅ Evaluación completada. Totales:`, {
      totalRegistros: resultados.length,
      puntajes: resultados.map(r => r.Total)
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
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
