import { useState } from "react";
import * as XLSX from "xlsx";

export default function App() {
  const [rows, setRows] = useState([]);
  const [mensaje, setMensaje] = useState("");
  const [loading, setLoading] = useState(false);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [dragActive, setDragActive] = useState(false);

  // 🔥 Normalizar texto
  const normalizar = (texto) => {
    return texto
      ?.toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  };

  // 🔥 Limpiar encoding roto
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

  // 🔥 Obtener valor flexible
  const getValue = (row, posibles) => {
    const keys = Object.keys(row);

    for (let key of keys) {
      const cleanKey = normalizar(key);

      for (let p of posibles) {
        if (cleanKey.includes(normalizar(p))) {
          return row[key];
        }
      }
    }

    return "";
  };

  // 📥 Leer archivo
  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    await procesarArchivo(file);
  };

  // 🎯 Drag & Drop
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const file = e.dataTransfer.files[0];
    if (file) await procesarArchivo(file);
  };

  const procesarArchivo = async (file) => {
    setNombreArchivo(file.name);
    setMensaje(`Leyendo ${file.name}...`);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, {
        defval: "",
        raw: false,
      });

      if (json.length === 0) {
        setMensaje("❌ Archivo vacío");
        return;
      }

      const procesados = json.map((row) => ({
        numero: getValue(row, ["acii", "no acii"]),
        descripcion: limpiarTexto(getValue(row, ["descripcion", "detalle"])),
        accion: limpiarTexto(getValue(row, ["accion inmediata", "accion correctiva", "accion"])),
        area: limpiarTexto(getValue(row, ["area"])),
      }));

      setRows(procesados);
      setMensaje(`✅ ${procesados.length} registros cargados correctamente`);

    } catch (error) {
      console.error(error);
      setMensaje("❌ Error al leer archivo");
    }
  };

  // 🤖 Evaluar IA
  const evaluarIA = async () => {
    if (rows.length === 0) {
      setMensaje("❌ Primero sube un archivo");
      return;
    }

    setLoading(true);
    setMensaje("🤖 Evaluando calidad de ACII...");

    try {
      const chunkSize = 20;
      let resultadosFinales = [];

      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);

        setMensaje(`📊 Procesando ${i + 1} - ${Math.min(i + chunk.length, rows.length)} de ${rows.length}`);

        const res = await fetch("/.netlify/functions/evaluar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ registros: chunk }),
        });

        const data = await res.json();

        if (!res.ok) throw new Error(data.error || "Error IA");

        resultadosFinales = [...resultadosFinales, ...data];
        await new Promise((r) => setTimeout(r, 400));
      }

      const worksheet = XLSX.utils.json_to_sheet(resultadosFinales);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Resultados");
      XLSX.writeFile(workbook, `acii_calificado_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.xlsx`);

      setMensaje("✅ ¡Evaluación completada! Archivo generado");
    } catch (error) {
      console.error(error);
      setMensaje(`❌ ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 🧹 Limpiar
  const limpiarTodo = () => {
    setRows([]);
    setMensaje("");
    setNombreArchivo("");
  };

  return (
    <div 
      style={styles.container}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.iconHeader}>📊</div>
        <h1 style={styles.title}>Auditoría de Calidad ACII</h1>
        <p style={styles.subtitle}>Evaluación inteligente de Actos, Condiciones Inseguras e Incidentes</p>
      </div>

      {/* Card principal */}
      <div style={styles.card}>
        
        {/* Área de carga */}
        <div style={styles.uploadArea}>
          <div style={styles.uploadIcon}>📁</div>
          <p style={styles.uploadText}>
            {dragActive ? "Suelta el archivo aquí" : "Arrastra y suelta tu archivo Excel"}
          </p>
          <label style={styles.uploadButton}>
            Seleccionar archivo
            <input
              type="file"
              onChange={handleFile}
              accept=".xlsx,.xls,.csv"
              style={{ display: "none" }}
            />
          </label>
          <p style={styles.uploadHint}>Formatos soportados: .xlsx, .xls, .csv</p>
        </div>

        {/* Info del archivo cargado */}
        {nombreArchivo && (
          <div style={styles.fileInfo}>
            <span style={styles.fileIcon}>📄</span>
            <span style={styles.fileName}>{nombreArchivo}</span>
            <button onClick={limpiarTodo} style={styles.clearButton}>✖</button>
          </div>
        )}

        {/* Estadísticas */}
        {rows.length > 0 && (
          <div style={styles.stats}>
            <div style={styles.statCard}>
              <div style={styles.statNumber}>{rows.length}</div>
              <div style={styles.statLabel}>Registros cargados</div>
            </div>
          </div>
        )}

        {/* Botón de evaluación */}
        <button
          onClick={evaluarIA}
          disabled={loading || rows.length === 0}
          style={{
            ...styles.evaluateButton,
            ...((loading || rows.length === 0) ? styles.evaluateButtonDisabled : {})
          }}
        >
          {loading ? (
            <span style={styles.loadingSpinner}>
              <span style={styles.spinner}></span>
              Procesando...
            </span>
          ) : (
            "🚀 Evaluar Calidad de ACII"
          )}
        </button>

        {/* Mensaje de estado */}
        {mensaje && (
          <div style={{
            ...styles.message,
            ...(mensaje.includes("✅") ? styles.messageSuccess : 
               mensaje.includes("❌") ? styles.messageError : 
               styles.messageInfo)
          }}>
            {mensaje}
          </div>
        )}

        {/* Pasos de ayuda */}
        {rows.length === 0 && !mensaje && (
          <div style={styles.helpSection}>
            <h3 style={styles.helpTitle}>¿Cómo funciona?</h3>
            <div style={styles.steps}>
              <div style={styles.step}>
                <div style={styles.stepNumber}>1</div>
                <div style={styles.stepText}>Sube un archivo Excel con reportes ACII</div>
              </div>
              <div style={styles.step}>
                <div style={styles.stepNumber}>2</div>
                <div style={styles.stepText}>El sistema evaluará cada reporte automáticamente</div>
              </div>
              <div style={styles.step}>
                <div style={styles.stepNumber}>3</div>
                <div style={styles.stepText}>Descarga el resultado calificado</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <p>Sistema de Auditoría ACII - Evaluación inteligente de seguridad industrial</p>
      </div>
    </div>
  );
}

// 🎨 Estilos mejorados
const styles = {
  container: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    padding: "20px",
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  },
  header: {
    textAlign: "center",
    marginBottom: "40px",
  },
  iconHeader: {
    fontSize: "64px",
    marginBottom: "10px",
  },
  title: {
    fontSize: "42px",
    fontWeight: "bold",
    color: "white",
    margin: "0 0 10px 0",
    textShadow: "2px 2px 4px rgba(0,0,0,0.2)",
  },
  subtitle: {
    fontSize: "18px",
    color: "rgba(255,255,255,0.9)",
    margin: 0,
  },
  card: {
    maxWidth: "800px",
    margin: "0 auto",
    backgroundColor: "white",
    borderRadius: "20px",
    padding: "40px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
  },
  uploadArea: {
    border: "2px dashed #cbd5e0",
    borderRadius: "12px",
    padding: "40px",
    textAlign: "center",
    backgroundColor: "#f7fafc",
    transition: "all 0.3s",
    cursor: "pointer",
  },
  uploadIcon: {
    fontSize: "48px",
    marginBottom: "10px",
  },
  uploadText: {
    fontSize: "18px",
    color: "#4a5568",
    marginBottom: "15px",
  },
  uploadButton: {
    backgroundColor: "#667eea",
    color: "white",
    padding: "10px 24px",
    borderRadius: "8px",
    cursor: "pointer",
    display: "inline-block",
    fontWeight: "bold",
    transition: "background 0.3s",
    border: "none",
    fontSize: "14px",
  },
  uploadHint: {
    fontSize: "12px",
    color: "#a0aec0",
    marginTop: "10px",
  },
  fileInfo: {
    backgroundColor: "#e2e8f0",
    borderRadius: "8px",
    padding: "12px 16px",
    marginTop: "20px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  fileIcon: {
    fontSize: "20px",
  },
  fileName: {
    flex: 1,
    fontSize: "14px",
    color: "#2d3748",
  },
  clearButton: {
    backgroundColor: "#fc8181",
    color: "white",
    border: "none",
    borderRadius: "6px",
    padding: "4px 10px",
    cursor: "pointer",
    fontSize: "12px",
    transition: "background 0.3s",
  },
  stats: {
    marginTop: "20px",
    display: "flex",
    justifyContent: "center",
  },
  statCard: {
    backgroundColor: "#edf2f7",
    borderRadius: "10px",
    padding: "15px 25px",
    textAlign: "center",
  },
  statNumber: {
    fontSize: "36px",
    fontWeight: "bold",
    color: "#667eea",
  },
  statLabel: {
    fontSize: "14px",
    color: "#4a5568",
    marginTop: "5px",
  },
  evaluateButton: {
    width: "100%",
    backgroundColor: "#48bb78",
    color: "white",
    border: "none",
    padding: "16px",
    fontSize: "18px",
    fontWeight: "bold",
    borderRadius: "10px",
    cursor: "pointer",
    marginTop: "20px",
    transition: "all 0.3s",
  },
  evaluateButtonDisabled: {
    backgroundColor: "#cbd5e0",
    cursor: "not-allowed",
    opacity: 0.6,
  },
  loadingSpinner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
  },
  spinner: {
    width: "20px",
    height: "20px",
    border: "3px solid rgba(255,255,255,0.3)",
    borderTop: "3px solid white",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  message: {
    marginTop: "20px",
    padding: "12px",
    borderRadius: "8px",
    textAlign: "center",
    fontWeight: "500",
  },
  messageSuccess: {
    backgroundColor: "#c6f6d5",
    color: "#22543d",
  },
  messageError: {
    backgroundColor: "#fed7d7",
    color: "#742a2a",
  },
  messageInfo: {
    backgroundColor: "#bee3f8",
    color: "#2c5282",
  },
  helpSection: {
    marginTop: "30px",
    paddingTop: "20px",
    borderTop: "1px solid #e2e8f0",
  },
  helpTitle: {
    fontSize: "18px",
    fontWeight: "bold",
    color: "#2d3748",
    marginBottom: "15px",
    textAlign: "center",
  },
  steps: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  step: {
    display: "flex",
    alignItems: "center",
    gap: "15px",
  },
  stepNumber: {
    width: "30px",
    height: "30px",
    backgroundColor: "#667eea",
    color: "white",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "bold",
    fontSize: "14px",
  },
  stepText: {
    flex: 1,
    color: "#4a5568",
    fontSize: "14px",
  },
  footer: {
    textAlign: "center",
    marginTop: "40px",
    color: "rgba(255,255,255,0.8)",
    fontSize: "12px",
  },
};

// Agrega esto al final del archivo o en un archivo CSS aparte
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  button:hover {
    transform: translateY(-2px);
  }
  
  button:active {
    transform: translateY(0px);
  }
`;
document.head.appendChild(styleSheet);
