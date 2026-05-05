export async function handler(event) {
  const { registros } = JSON.parse(event.body);

  const evaluados = registros.map((r) => {
    let accion = (r.accion || "").trim();

    let tipo = "";
    let score = 0;

    if (!accion || accion.length < 5) {
      tipo = "Informa";
      score = 40;
    } else if (accion.length > 20) {
      tipo = "Corrige";
      score = 100;
    } else {
      tipo = "Informa";
      score = 65;
    }

    return {
      ...r,
      tipo,
      score,
    };
  });

  return {
    statusCode: 200,
    body: JSON.stringify(evaluados),
  };
}
