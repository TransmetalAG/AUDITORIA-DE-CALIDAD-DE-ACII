exports.handler = async function (event) {
  // 1. Validar entrada
  if (!event.body) {
    return { statusCode: 400, body: JSON.stringify({ error: "Falta body" }) };
  }
  
  const { registros } = JSON.parse(event.body);
  if (!registros || !registros.length) {
    return { statusCode: 400, body: JSON.stringify({ error: "Faltan registros" }) };
  }

  // 2. Construir prompt con IDs
  const prompt = `
Evalúa estos reportes. Devuelve JSON con "evaluaciones" array.
CADA objeto debe tener "id" (mismo que el original) y los campos.

REPORTES (con ID):
${registros.map((r, i) => `ID ${i}: ${r.descripcion}`).join("\n")}
... resto del prompt
`;

  // 3. Reintentos
  let lastError;
  for (let intento = 1; intento <= 3; intento++) {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { /* ... */ },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          temperature: 0.1
        }),
        signal: AbortSignal.timeout(8000) // timeout interno
      });
      
      const data = await response.json();
      const contenido = data.choices?.[0]?.message?.content;
      const parsed = JSON.parse(contenido);
      const evaluaciones = parsed.evaluaciones || [];
      
      // 4. Reconstruir por ID
      const resultados = registros.map((r, idx) => {
        const e = evaluaciones.find(e => e.id === idx) || {};
        // Validar reglas de negocio AQUÍ también
        const corrige = e.corrige === 60 ? 60 : 0;
        const informa = e.informa === 25 ? 25 : 0;
        // Forzar regla mutuamente excluyente
        const corrigeFinal = (corrige === 60 && informa === 25) ? 60 : corrige;
        const informaFinal = (corrige === 60 && informa === 25) ? 0 : informa;
        // ...
      });
      
      return { statusCode: 200, body: JSON.stringify(resultados) };
      
    } catch (error) {
      lastError = error;
      if (intento < 3) await new Promise(r => setTimeout(r, 1000 * intento));
    }
  }
  
  return { statusCode: 500, body: JSON.stringify({ error: lastError.message }) };
};
