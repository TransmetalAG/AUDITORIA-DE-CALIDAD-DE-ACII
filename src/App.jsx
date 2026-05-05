import { useState } from "react";
import * as XLSX from "xlsx";

export default function App() {
  const [rows, setRows] = useState([]);
  const [mensaje, setMensaje] = useState("");

  const handleFile = async (e) => {
    const file = e.target.files[0];
    const data = await file.arrayBuffer();

    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet);

    const procesados = json.map((row) => ({
      descripcion: row["Descripción"],
      accion: row["Acción Inmediata"],
    }));

    setRows(procesados);
    setMensaje(""); // limpiar mensaje al subir nuevo archivo
  };

  const evaluarIA = () => {
    if (rows.length === 0) {
      setMensaje("Primero sube un archivo");
      return;
    }

    setMensaje("Archivo listo para evaluar con IA");
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Auditoría ACII</h1>

      <input type="file" onChange={handleFile} />

      <br /><br />

      <button onClick={evaluarIA}>
        Evaluar con IA
      </button>

      <br /><br />

      {rows.length > 0 && (
        <p>Registros cargados: {rows.length}</p>
      )}

      {mensaje && (
        <p><b>{mensaje}</b></p>
      )}
    </div>
  );
}
