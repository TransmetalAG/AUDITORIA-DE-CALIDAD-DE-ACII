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
      throw new Error("No hay registros para evaluar");
    }

    const reportes = registros.map((r, i) => ({
      id: i,
      descripcion: r.descripcion || "",
      accion: r.accion || "",
    }));

    const prompt = `
Eres un auditor SISO experto en seguridad industrial.

Debes evaluar cada reporte y devolver SOLO un array JSON con este formato:
{"relacionada": 0-30, "grupo": 0-10, "corrige": 0-60, "informa": 0-25}

REGLAS ESTRICTAS:
- relacionada = 30 si hay una CONDICIÓN INSEGURA o ACTO INSEGURO.
- grupo = 10 si afecta a personas o un área específica.
- corrige = 60 si la acción SOLUCIONA el problema (ya fue ejecutada: se reparó, se cambió, se limpió, se ordenó, se separó, se apagó, se detuvo, se le hace el cambio).
- informa = 25 si la acción solo COMUNICA, reporta, avisa, notifica, solicita seguimiento, programa, planifica o escala.
- NUNCA poner corrige e informa juntos. Si corrige=60, informa=0.

CASOS GUÍA:
- Cable eléctrico dañado + reparar = 30,10,60,0
- Fuga de gas + cerrar válvula/delimitar = 30,10,60,0
- Grasa o aceite en piso + reportar = 30,10,0,25
- Falta de EPP + retroalimentar/reportar = 30,10,0,25
- EPP roto + cambio inmediato = 30,10,60,0
- Máquina defectuosa + reportar a mantenimiento = 30,10,0,25
- Máquina defectuosa + reparar/cambiar/detener = 30,10,60,0
- Dispensador de agua/café/oficina sin riesgo físico = 0,0,0,25 si solo se reporta
- Orden/limpieza solo es SISO si genera riesgo de caída, golpe, atrapamiento, obstrucción o exposición.

RESPONDE SOLO JSON.

REPORTES:
${JSON.stringify(reportes, null, 2)}
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Eres un auditor SISO. Responde SOLO con JSON válido, sin explicaciones."
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

    if (!Array.isArray(evaluaciones)) {
      evaluaciones = registros.map(() => ({
        relacionada: 0,
        grupo: 0,
        corrige: 0,
        informa: 0
      }));
    }

    // 🔥 PALABRAS DE RIESGO
    const palabrasRiesgoBasico = [
      "grasa", "suelo", "piso", "cable", "fuga", "electr", "canaleta",
      "guarda", "guardia", "control", "energia", "energía", "peligro",
      "riesgo", "accidente", "lentes", "botas", "guante", "guantes",
      "mascarilla", "tapones", "orejeras", "epp", "extension", "extensión",
      "desorden", "cristal", "hongo", "troquel", "troqueladora", "faja",
      "esmeril", "oxicorte", "inflamable", "incendio", "explosion",
      "explosión", "gas", "cilindro", "sujetar", "solvente", "aceite",
      "trapo", "combustible", "rebaba", "rebada", "filo", "corte",
      "caida", "caída", "tropiezo", "golpe", "atrap", "arnes", "arnés",
      "altura", "manguera", "conector", "tuberia", "tubería", "presion",
      "presión", "resorte", "molde", "freno", "pulsador", "botonera",
      "manometro", "manómetro", "extintor", "carga suspendida",
      "montacargas", "quimico", "químico", "caliente", "quemadura",
      "vapor", "humo", "extraccion", "extracción", "proteccion",
      "protección", "pantalla", "eslinga", "polaina", "chaleco",
      "casco", "ruido", "vibracion", "vibración", "derrame",
      "flojo", "floja", "quebrado", "quebrada", "dañado", "dañada",
      "mal estado", "defectuoso", "defectuosa", "agujero", "desgastado"
    ];

    // 🔥 ACCIONES QUE SON CORRECCIÓN FÍSICA (ya ejecutadas)
    const palabrasCorrigeBasico = [
      "repar", "corrig", "cambi", "cambio", "cambió", "deten", "detuvo",
      "limpia", "limpio", "limpió", "ordena", "ordeno", "ordenó",
      "coloca", "coloco", "colocó", "instala", "instalo", "instaló",
      "separa", "aleja", "sujeta", "sujeto", "sujetó", "cerro",
      "cerró", "cierra", "bloque", "retira", "retiro", "retiró",
      "apago", "apagó", "desconecta", "desconectó", "reemplaz",
      "delimita", "delimitó", "corta", "cortó", "elimina", "eliminó",
      "resuelve", "resolvio", "resolvió", "se llevó", "llevo",
      "se paró", "se detuvo", "se fabrico", "se fabricó", "se hizo", "se iso",
      // 🔥 NUEVAS FRASES PARA CAMBIO DE EPP
      "se le hace el cambio", "se le hizo el cambio", "se realiza cambio",
      "se le cambia", "se le cambió", "se procede a cambiar", "se procedió a cambiar"
    ];

    // 🔥 ACCIONES QUE SON INFORMATIVAS
    const palabrasInformaBasico = [
      "report", "inform", "avis", "notific", "comunic", "traslad",
      "solicita", "solicitó", "coordina", "coordinó", "programa",
      "programó", "planifica", "planificó", "seguimiento", "se genera",
      "se genero", "se generó", "se hace reporte", "se hizo reporte",
      "se hizo acii", "se iso acii", "se hizo una acii", "se generó una tarjeta"
    ];

    // 🔥 CASOS GENERALMENTE NO SISO
    const palabrasNoSiso = [
      "dispensador de agua", "oasis", "agua pura", "café", "cafe",
      "silla nueva", "sillas nuevas", "oficina sin novedad",
      "no tiene agua", "falta de agua"
    ];

    const resultados = registros.map((r, i) => {
      let ev = evaluaciones[i] || {};

      let relacionada = ev.relacionada === 30 ? 30 : 0;
      let grupo = ev.grupo === 10 ? 10 : 0;
      let corrige = ev.corrige === 60 ? 60 : 0;
      let informa = ev.informa === 25 ? 25 : 0;

      const texto = (r.descripcion || "").toLowerCase();
      const accion = (r.accion || "").toLowerCase();
      const combinado = `${texto} ${accion}`;

      const hayNoSiso = palabrasNoSiso.some(p => combinado.includes(p));
      const hayRiesgo = palabrasRiesgoBasico.some(p => combinado.includes(p));

      // 1. Forzar riesgo si aparece en descripción o acción
      if (hayRiesgo) {
        relacionada = 30;
        grupo = 10;
      }

      // 2. EPP explícito: si menciona no usar/no tener EPP, siempre SISO
      if (
        (texto.includes("no usa") ||
          texto.includes("no utiliza") ||
          texto.includes("no tiene") ||
          texto.includes("no llevaba") ||
          texto.includes("sin") ||
          texto.includes("roto") ||
          texto.includes("rota") ||
          texto.includes("mal estado") ||
          texto.includes("agujero") ||
          texto.includes("desgastado")) &&
        (
          texto.includes("lente") ||
          texto.includes("guante") ||
          texto.includes("mascarilla") ||
          texto.includes("arnes") ||
          texto.includes("arnés") ||
          texto.includes("casco") ||
          texto.includes("bota") ||
          texto.includes("polaina") ||
          texto.includes("orejera") ||
          texto.includes("tapon") ||
          texto.includes("tapón") ||
          texto.includes("chaleco") ||
          texto.includes("epp")
        )
      ) {
        relacionada = 30;
        grupo = 10;
      }

      // 3. 🔥 REGLA ESPECIAL: Cambio de EPP (siempre corrección)
      const esEppRoto = (
        (texto.includes("polaina") || texto.includes("guante") || texto.includes("bota") || 
         texto.includes("casco") || texto.includes("lente") || texto.includes("arnes")) &&
        (texto.includes("roto") || texto.includes("mal estado") || texto.includes("agujero") || 
         texto.includes("desgastado") || texto.includes("pequeño agujero"))
      );
      
      const esCambioEpp = (
        accion.includes("cambio") || accion.includes("cambió") || accion.includes("cambiar") ||
        accion.includes("se le hace") || accion.includes("se realizó") || 
        accion.includes("se procedió") || accion.includes("se le cambia")
      );
      
      if (esEppRoto && esCambioEpp) {
        relacionada = 30;
        grupo = 10;
        corrige = 60;
        informa = 0;
      }

      // 4. Si es caso no SISO y no hay riesgo fuerte explícito, limpiar relacionada/grupo
      if (hayNoSiso && !texto.includes("fatiga") && !texto.includes("golpe de calor")) {
        relacionada = 0;
        grupo = 0;
      }

      // 5. Detectar corrección (solo acciones físicas ejecutadas)
      if (palabrasCorrigeBasico.some(p => accion.includes(p))) {
        corrige = 60;
        informa = 0;
      }

      // 6. Detectar comunicación si no corrigió
      if (corrige !== 60 && palabrasInformaBasico.some(p => accion.includes(p))) {
        informa = 25;
      }

      // 7. Si hay riesgo y no corrigió, pero la acción pide seguimiento/programación/solicitud, cuenta como informa
      if (
        relacionada === 30 &&
        corrige !== 60 &&
        informa === 0 &&
        (
          accion.includes("seguimiento") ||
          accion.includes("program") ||
          accion.includes("solicit") ||
          accion.includes("coord") ||
          accion.includes("revis") ||
          accion.includes("evalu")
        )
      ) {
        informa = 25;
      }

      // 8. Consistencia final
      if (relacionada === 30 && grupo === 0) {
        grupo = 10;
      }

      if (corrige === 60) {
        informa = 0;
      }

      // 9. Si no hay SISO, no debe tener grupo ni corrige
      if (relacionada === 0) {
        grupo = 0;
        if (corrige === 60 && !hayRiesgo) {
          corrige = 0;
        }
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
      body: JSON.stringify({ error: error.message }),
    };
  }
};
