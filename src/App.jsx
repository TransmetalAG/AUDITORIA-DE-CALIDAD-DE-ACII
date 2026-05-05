import { useState } from "react";
import * as XLSX from "xlsx";

export default function App() {
  const [rows, setRows] = useState([]);
  const [mensaje, setMensaje] = useState("");
  const [loading, setLoading] = useState(false);
  const [nombreArchivo, setNombreArchivo] = useState("");

  // Limpiar tildes dañadas
  const limpiarTexto = (texto) => {
    if (!texto) return "";
    return texto
      .toString()
      .replace(/Ã¡/g, "á")
      .replace(/Ã©/g, "é")
      .replace(/Ã­/g, "í")
      .replace(/Ã³/g, "ó")
      .replace(/Ãº/g, "ú")
      .replace(/Ã±/g, "ñ")
      .replace(/Ã/g, "Á")
      .replace(/Â/g, "")
      .trim();
  };

  // Leer archivo CSV
  const leerCSV = (texto) => {
    const lines = texto.split(/\r?\n/);
    const headers = lines[0].split(",").map(h => h.replace(/["']/g, "").trim());
    
    const json = [];
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "") continue;
      
      // Manejar campos entre comillas
      const values = [];
      let current = "";
      let inQuotes = false;
      
      for (let char of lines[i]) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
          values.push(current);
          current = "";
        } else {
          current += char;
        }
      }
      values.push(current);
      
      const row = {};
      headers.forEach((h, idx) => {
        let val = values[idx] || "";
        val = val.replace(/^["']|["']$/g, "");
        row[h] = val;
      });
      
      json.push(row);
    }
    
    return json;
  };

  // Procesar archivo subido
  const handleFile = async (e) => {
    const file = e.target.files[0];
    
    if (!file) return;
    
    setNombreArchivo(file.name);
    setMensaje(`Leyendo ${file.name}...`);
    
    // Validar extensión
    const extension = file.name.split('.').pop().toLowerCase();
    
    try {
      let json = [];
      
      if (extension === 'csv') {
        // Leer CSV
        const text = await file.text();
        json = leerCSV(text);
        setMensaje(`✅ Archivo CSV leído: ${json.length} registros`);
      } 
      else if (extension === 'xlsx' || extension === 'xls') {
        // Leer Excel
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        json = XLSX.utils.sheet_to_json(sheet, {
          defval: "",
          raw: false,
        });
        setMensaje(`✅ Archivo Excel leído: ${json.length} registros`);
      }
      else {
        setMensaje("❌ Solo archivos CSV, XLSX o XLS");
        return;
      }
      
      if (json.length === 0) {
        setMensaje("❌ El archivo está vacío");
        return;
      }
      
      // Verificar columnas necesarias
      const primeraFila = json[0];
      const columnasNecesarias = ["No. ACII", "Descripción", "Acción Inmediata", "Área"];
      const columnasFaltantes = columnasNecesarias.filter(col => !(col in primeraFila));
      
      if (columnasFaltantes.length > 0) {
        setMensaje(`❌ Faltan columnas: ${columnasFaltantes.join(", ")}\nColumnas encontradas: ${Object.keys(primeraFila).join(", ")}`);
        return;
      }
      
      // Procesar datos
      const procesados = json.map((row) => ({
        numero: row["No. ACII"] || "",
        descripcion: limpiarTexto(row["Descripción"]),
        accion: limpiarTexto(row["Acción Inmediata"]),
        area: limpiarTexto(row["Área"]),
      }));
      
      setRows(procesados);
      setMensaje(`✅ ${procesados.length} registros cargados correctamente`);
      
    } catch (error) {
      console.error(error);
      setMensaje(`❌ Error al leer el archivo: ${error.message}`);
    }
  };

  // Evaluar con IA
  const evaluarIA = async () => {
    if (rows.length === 0) {
      setMensaje("❌ Primero sube un archivo");
      return;
    }

    setLoading(true);
    setMensaje("🤖 Analizando con IA... Esto puede tomar unos segundos");

    try {
      const res = await fetch("/.netlify/functions/evaluar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ registros: rows }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(`❌ Error: ${data.error || "Error desconocido"}`);
        return;
      }

      if (!data || data.length === 0) {
        setMensaje("❌ No se recibieron resultados");
        return;
      }

      // Generar Excel
      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Resultados");
      
      // Ajustar ancho de columnas (opcional)
      const colWidths = [
        { wch: 10 },  // No. ACII
        { wch: 40 },  // Descripción
        { wch: 40 },  // Acción Inmediata
        { wch: 18 },  // Relacionada SISO
        { wch: 18 },  // Grupo específico
        { wch: 15 },  // Corrige
        { wch: 15 },  // Informa
        { wch: 10 },  // Total
        { wch: 20 },  // Área
        { wch: 50 },  // Comentario IA
      ];
      worksheet['!cols'] = colWidths;
      
      const fecha = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
      XLSX.writeFile(workbook, `acii_calificado_${fecha}.xlsx`);

      setMensaje(`✅ Archivo generado y descargado correctamente`);
    } catch (error) {
      console.error(error);
      setMensaje(`❌ Error de conexión: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Limpiar todo
  const limpiarTodo = () => {
    setRows([]);
    setMensaje("");
    setNombreArchivo("");
  };

  return (
    <div style={{ 
      padding: 20, 
      fontFamily: "Arial, sans-serif",
      maxWidth: 800,
      margin: "0 auto"
    }}>
      <h1>📋 Auditoría ACII con IA</h1>
      
      <div style={{ 
        border: "2px dashed #ccc", 
        borderRadius: 10, 
        padding: 20,
        textAlign: "center",
        marginBottom: 20
      }}>
        <input 
          type="file" 
          onChange={handleFile} 
          accept=".xlsx,.xls,.csv"
          disabled={loading}
        />
        <p style={{ fontSize: 14, color: "#666", marginTop: 10 }}>
          Formatos soportados: Excel (.xlsx, .xls) o CSV (.csv)
        </p>
      </div>

      {nombreArchivo && (
        <div style={{ 
          backgroundColor: "#e3f2fd", 
          padding: 10, 
          borderRadius: 5,
          marginBottom: 10
        }}>
          📁 Archivo: <strong>{nombreArchivo}</strong>
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ 
          backgroundColor: "#e8f5e9", 
          padding: 10, 
          borderRadius: 5,
          marginBottom: 10
        }}>
          📊 Registros cargados: <strong>{rows.length}</strong>
          <button 
            onClick={limpiarTodo}
            style={{ 
              marginLeft: 10,
              backgroundColor: "#f44336",
              color: "white",
              border: "none",
              borderRadius: 3,
              padding: "2px 8px",
              cursor: "pointer"
            }}
          >
            Limpiar
          </button>
        </div>
      )}

      <button 
        onClick={evaluarIA} 
        disabled={loading || rows.length === 0}
        style={{
          padding: "12px 24px",
          backgroundColor: (loading || rows.length === 0) ? "#ccc" : "#007bff",
          color: "white",
          border: "none",
          borderRadius: 5,
          cursor: (loading || rows.length === 0) ? "not-allowed" : "pointer",
          fontSize: 16,
          fontWeight: "bold",
          width: "100%",
          marginBottom: 20
        }}
      >
        {loading ? "🔄 Procesando con IA..." : "🎯 Evaluar con IA"}
      </button>

      {mensaje && (
        <div style={{ 
          backgroundColor: mensaje.includes("✅") ? "#e8f5e9" : 
                          mensaje.includes("❌") ? "#ffebee" : "#fff3e0",
          padding: 10, 
          borderRadius: 5,
          borderLeft: `4px solid ${
            mensaje.includes("✅") ? "#4caf50" : 
            mensaje.includes("❌") ? "#f44336" : "#ff9800"
          }`
        }}>
          <b>{mensaje}</b>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: "center", marginTop: 20 }}>
          <div className="spinner" style={{
            display: "inline-block",
            width: 40,
            height: 40,
            border: "4px solid #f3f3f3",
            borderTop: "4px solid #007bff",
            borderRadius: "50%",
            animation: "spin 1s linear infinite"
          }}></div>
          <p>Por favor espera, la IA está analizando...</p>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
