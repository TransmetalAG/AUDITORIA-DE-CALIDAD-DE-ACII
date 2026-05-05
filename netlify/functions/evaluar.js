exports.handler = async function (event) {
  // Manejo OPTIONS para CORS (necesario para algunas configuraciones)
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
    // Validar que el body existe
    if (!event.body) {
      throw new Error("No se recibieron datos");
    }

    const { registros } = JSON.parse(event.body);

    // Validar que hay registros
    if (!registros || registros.length === 0) {
      throw new Error("No hay registros para evaluar");
    }

    console.log(`Procesando ${registros.length} registros`);

    // Construir el prompt para OpenAI
    const prompt = `
Eres un auditor experto en seguridad industrial (SISO).

Evalúa estos reportes ACII y devuelve SOLO un array JSON válido, sin texto adicional.

REGLAS ESTRICTAS:
- "relacionada" SOLO puede ser 0 o 30
- "grupo" SOLO puede ser 0 o 10  
- "corrige" SOLO puede ser 0 o 60
- "informa" SOLO puede ser 0 o 25

REGLAS IMPORTANTES:
- "corrige" e "informa" NO pueden estar ambos activos
- Si "corrige" = 60, entonces "informa" debe ser 0
- Si "informa" = 25, entonces "corrige" debe ser 0

Formato de respuesta (array de objetos):
[
  {
    "relacionada": 0,
    "grupo": 0,
    "corrige": 0,
    "informa": 0,
    "comentario": "breve justificación"
  }
]

REPORTES A EVALUAR:
${JSON.stringify(registros, null, 2)}
`;

    console.log("Enviando a OpenAI...");

    // Llamar a OpenAI con el endpoint correcto
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
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });

    // Verificar si la respuesta de OpenAI es exitosa
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

    console.log("Respuesta OpenAI recibida");

    // Extraer el JSON de la respuesta
    let evaluaciones = [];
    
    try {
      // Intentar parsear directamente
      const parsed = JSON.parse(contenido);
      
      // Si es un objeto con array dentro
      if (parsed.evaluaciones && Array.isArray(parsed.evaluaciones)) {
        evaluaciones = parsed.evaluaciones;
      }
      // Si es un array directo
      else if (Array.isArray(parsed)) {
        evaluaciones = parsed;
      }
      // Si es un objeto, convertirlo a array
      else if (typeof parsed === "object" && parsed !== null) {
        evaluaciones = [parsed];
      }
    } catch (e) {
      // Si falla, buscar array con regex
      const jsonMatch = contenido.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          evaluaciones = JSON.parse(jsonMatch[0]);
        } catch (e2) {
          console.error("Error parseando JSON:", e2);
          evaluaciones = [];
        }
      }
    }

    console.log(`Se recibieron ${evaluaciones.length} evaluaciones`);

    // Construir resultados asegurando que haya una evaluación por cada registro
    const resultados = registros.map((registro, index) => {
      const evaluacion = evaluaciones[index] || {};
      
      // Validar y asignar valores según las reglas
      let relacionada = evaluacion.relacionada === 30 ? 30 : 0;
      let grupo = evaluacion.grupo === 10 ? 10 : 0;
      let corrige = evaluacion.corrige === 60 ? 60 : 0;
      let informa = evaluacion.informa === 25 ? 25 : 0;
      
      // Regla: corrige e informa no pueden estar ambos activos
      if (corrige === 60 && informa === 25) {
        // Por defecto, priorizar corrige
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
        "Comentario IA": evaluacion.comentario || "Sin comentario",
      };
    });

    console.log("Resultados procesados correctamente");

    // Devolver respuesta exitosa
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(resultados),
    };

  } catch (error) {
    console.error("ERROR EN LA FUNCIÓN:", error.message);
    console.error("Stack:", error.stack);
    
    // Devolver respuesta de error detallada
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ 
        error: error.message,
        details: "Revisa los logs de Netlify para más información"
      }),
    };
  }
};
