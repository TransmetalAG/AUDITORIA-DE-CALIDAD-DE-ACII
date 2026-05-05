import { useState } from "react";

export default function AuditoriaACII() {
  const [descripcion, setDescripcion] = useState("");
  const [accion, setAccion] = useState("");
  const [resultado, setResultado] = useState(null);

  const evaluar = () => {
    let relacionada = descripcion ? 30 : 0;
    let grupo = 10;

    let corrige = 0;
    let informa = 0;

    if (accion.length > 20) {
      corrige = 60;
    } else {
      informa = 25;
    }

    let total = relacionada + grupo + (corrige || informa);

    setResultado({ relacionada, grupo, corrige, informa, total });
  };

  return (
    <div>
      <textarea
        placeholder="Descripción"
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
      />

      <br />

      <textarea
        placeholder="Acción"
        value={accion}
        onChange={(e) => setAccion(e.target.value)}
      />

      <br />

      <button onClick={evaluar}>Evaluar</button>

      {resultado && (
        <div>
          <p>Relacionada: {resultado.relacionada}</p>
          <p>Grupo: {resultado.grupo}</p>
          <p>Corrige: {resultado.corrige}</p>
          <p>Informa: {resultado.informa}</p>
          <p>Total: {resultado.total}</p>
        </div>
      )}
    </div>
  );
}
