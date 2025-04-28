import { useState, useRef, useEffect } from "react";
import DatabaseConnectionManager from "./DatabaseConnectionManager";
import "./Sidebar.css";

function Sidebar({ onFileUpload }) {
  const [fileName, setFileName] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);
  const [activeTab, setActiveTab] = useState("csv"); // "csv" or "sql"
  const [isDbConnected, setIsDbConnected] = useState(false);
  const [connectedDb, setConnectedDb] = useState("");

  // Check connection status on component mount
  useEffect(() => {
    checkConnectionStatus();
  }, []);
  
  const checkConnectionStatus = async () => {
    try {
      const token = localStorage.getItem("mcpToken");
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      
      const response = await fetch('/check_connection_status', {
        method: 'GET',
        headers
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.connected) {
          setIsDbConnected(true);
          setConnectedDb(data.database);
          setActiveTab("sql");
        }
      }
    } catch (error) {
      console.error('Error checking connection status:', error);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (["dragenter", "dragover"].includes(e.type)) {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files?.[0]) {
      uploadFile(files[0]);
      setFileName(files[0].name);
    }
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      uploadFile(file);
      setFileName(file.name);
    }
  };

  const handleFileUploadClick = () => {
    fileInputRef.current.click();
  };

  function uploadFile(file) {
    if (file.size >= 1024 * 1024 * 50) {
      alert("File size too big. Max 50 MB.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    fetch("/upload", {
      method: "POST",
      body: formData,
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.message) {
          alert(data.message);
          // Switch to CSV mode
          fetch('/switch_mode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'csv' })
          });
          setActiveTab("csv");
        } else {
          alert(data.error);
        }
      });
  }

  const switchTab = (tab) => {
    setActiveTab(tab);
  };

  const handleCreateReport = () => {
    // This will be implemented in another component
    const reportEvent = new CustomEvent('createReport');
    document.dispatchEvent(reportEvent);
  };

  return (
    <div className="sidebar">
      <h2 className="sidebar-title">Data Analysis Dashboard</h2>
      
      {/* Status indicators */}
      {(isDbConnected || fileName) && (
        <div className="dashboard-status">
          {isDbConnected && (
            <div className="status-item connected">
              <span className="status-indicator"></span>
              <span className="status-text">Connected to: {connectedDb}</span>
            </div>
          )}
          {fileName && (
            <div className="status-item file-loaded">
              <span className="status-indicator"></span>
              <span className="status-text">File loaded: {fileName}</span>
            </div>
          )}
        </div>
      )}

      {/* Tab navigation */}
      <div className="dashboard-tabs">
        <button 
          className={`dashboard-tab ${activeTab === 'csv' ? 'active' : ''}`} 
          onClick={() => switchTab('csv')}
        >
          <span className="material-symbols-outlined">upload_file</span>
          <span className="tab-text">Upload CSV</span>
        </button>
        <button 
          className={`dashboard-tab ${activeTab === 'sql' ? 'active' : ''}`} 
          onClick={() => switchTab('sql')}
        >
          <span className="material-symbols-outlined">database</span>
          <span className="tab-text">SQL Database</span>
        </button>
      </div>

      {/* CSV Upload Panel */}
      <div className={`dashboard-panel ${activeTab === 'csv' ? 'active' : ''}`}>
        <div
          className={`upload-area ${dragActive ? "drag-active" : ""}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={handleFileUploadClick}
        >
          <div className="upload-icon-container">
            <span className="material-symbols-outlined upload-icon">cloud_upload</span>
          </div>
          <div className="upload-text">
            <p>Drag & drop files here or</p>
            <button className="browse-button">Browse files</button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="file-input"
            onChange={handleFileInputChange}
            accept=".csv,.xml"
          />
          <p className="supported-formats">Supported formats: CSV, XML</p>
        </div>
      </div>

      {/* SQL Connection Panel */}
      <div className={`dashboard-panel ${activeTab === 'sql' ? 'active' : ''}`}>
        <DatabaseConnectionManager />
      </div>

      {/* Create Report Button - Only show one */}
      <div className="dashboard-actions">
        <button className="create-report-btn" onClick={handleCreateReport}>
          <span className="material-symbols-outlined btn-icon">Generate Report</span>
        </button>
      </div>
    </div>
  );
}

export default Sidebar;