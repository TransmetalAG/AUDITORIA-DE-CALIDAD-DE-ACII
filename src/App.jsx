import { useState } from "react";
import * as XLSX from "xlsx";

export default function App() {
  const [descripcion, setDescripcion] = useState("");
  const [accion, setAccion] = useState("");
  const [rows, setRows] = useState([]);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    const data = await file.arrayBuffer();

    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet);

    console.log(json);
    setRows(json);
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Auditoría ACII</h1>

      <input type="file" onChange={handleFile} />

      <br /><br />

      <textarea
        placeholder="Descripción"
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
      />

      <br /><br />

      <textarea
        placeholder="Acción"
        value={accion}
        onChange={(e) => setAccion(e.target.value)}
      />

      <br /><br />

      {rows.length > 0 && (
        <div>
          <p>Registros cargados: {rows.length}</p>
        </div>
      )}
    </div>
  );
}
