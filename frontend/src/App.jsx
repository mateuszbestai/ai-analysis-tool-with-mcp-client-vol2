import "./App.css";
import Navbar from "./components/Navbar";
import { useState, useRef, useEffect } from "react";
import Chatbox from "./components/Chatbox";
import DatabaseConnectionManager from "./components/DatabaseConnectionManager";

function App() {
  const [fileName, setFileName] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

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

  const handleFileUploadClick = () => {
    fileInputRef.current.click();
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      uploadFile(file);
      setFileName(file.name);
    }
  };

  function uploadFile(file) {
    const formData = new FormData();
    if(file.size >= 1024*1024*50){
      alert("File size too big. Max 50 MB.");
      return;
    }
    formData.append("file", file);

    fetch("/upload", {
      method: "POST",
      body: formData,
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.message) {
          alert(data.message);
        } else {
          alert(data.error);
        }
      });
  }

  return (
    <div className="app-container">
      {/* Navbar */}
      <Navbar />

      {/* Main Content */}
      <div className="content-container">
        {/* File Upload Sidebar */}
        <div className="sidebar">
          <h2 className="sidebar-title">Upload Documents</h2>
          <div
            className={`upload-area ${dragActive ? "drag-active" : ""}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={handleFileUploadClick}
          >
            <svg
              className="upload-icon"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 16v4a1 1 0 001 1h16a1 1 0 001-1v-4M7 10l5-5m0 0l5 5m-5-5v12"
              />
            </svg>
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
          
          {/* Database Connection Manager */}
          <div className="db-connection-container">
            <DatabaseConnectionManager />
          </div>
        </div>

        {/* Chat Area */}
        <div className="chat-area" id="chatArea">
          <Chatbox />
        </div>
      </div>
    </div>
  );
}

export default App;