import { useState, useEffect } from "react";
import DirectTablePreview from "./DirectTablePreview";
import "./TablePreview.css"; // Import the new styles

function ConnectionSettings() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [connectedDb, setConnectedDb] = useState("");
  const [tableList, setTableList] = useState([]);
  const [isDbConnected, setIsDbConnected] = useState(false);
  const [previewTable, setPreviewTable] = useState(null);

  // Check connection status on component mount
  useEffect(() => {
    // Check if there's an active database connection
    checkConnection();
  }, []);
  
  const checkConnection = async () => {
    try {
      // Get token from localStorage if available
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
          setTableList(data.tables || []);
        }
      }
    } catch (error) {
      console.error('Error checking connection status:', error);
    }
  };

  const openModal = () => {
    // Refresh connection status when opening the modal
    checkConnection();
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const handleClickOutside = (e) => {
    if (e.target.className === "modal") {
      closeModal();
    }
  };

  const handleShowTablePreview = (table) => {
    setPreviewTable(table);
    closeModal(); // Close the modal to show the table
  };

  const closeTablePreview = () => {
    setPreviewTable(null);
  };

  const refreshTables = async () => {
    try {
      // Get token from localStorage if available
      const token = localStorage.getItem("mcpToken");
      const headers = {
        'Content-Type': 'application/json'
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch('/refresh_tables', {
        method: 'POST',
        headers
      });
      
      if (response.ok) {
        const data = await response.json();
        setTableList(data.tables || []);
        alert('Table list refreshed successfully!');
      } else {
        const errorData = await response.json();
        alert(`Error: ${errorData.error || 'Failed to refresh tables'}`);
      }
    } catch (error) {
      console.error('Error refreshing tables:', error);
      alert('Error refreshing tables. Please try again.');
    }
  };
  
  const disconnectDatabase = async () => {
    try {
      // Get token from localStorage
      const token = localStorage.getItem("mcpToken");
      if (!token) {
        alert('No active connection found');
        return;
      }
      
      const response = await fetch('/disconnect', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      // Remove token regardless of response
      localStorage.removeItem("mcpToken");
      
      if (response.ok) {
        alert('Successfully disconnected from database');
      }
      
      // Reset state
      setIsDbConnected(false);
      setConnectedDb("");
      setTableList([]);
      closeModal();
      
    } catch (error) {
      console.error('Error disconnecting:', error);
      alert('Error disconnecting from database');
      
      // Remove token on error as well
      localStorage.removeItem("mcpToken");
    }
  };

  return (
    <>
      <button 
        className="db-connect-button" 
        onClick={openModal} 
        disabled={!isDbConnected}
      >
        Connection Settings
      </button>

      {isModalOpen && (
        <div className="modal" onClick={handleClickOutside}>
          <div className="modal-content">
            <span className="close" onClick={closeModal}>&times;</span>
            <h2>Connection Settings</h2>
            
            <div className="connection-info">
              <h3>Connected to: {connectedDb}</h3>
              
              <div className="table-actions">
                <button 
                  onClick={refreshTables} 
                  className="btn-primary"
                  style={{ marginRight: '10px' }}
                >
                  Refresh Tables
                </button>
                
                <button 
                  onClick={disconnectDatabase} 
                  className="btn-secondary"
                >
                  Disconnect
                </button>
              </div>
              
              <h4>Available Tables:</h4>
              {tableList.length > 0 ? (
                <div className="saved-connections">
                  <ul className="connection-list">
                    {tableList.map((table, index) => (
                      <li key={index} className="connection-item">
                        <div className="connection-info">
                          <span className="connection-name">{table}</span>
                        </div>
                        <button 
                          className="btn-small" 
                          onClick={() => handleShowTablePreview(table)}
                        >
                          Preview
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="no-connections">No tables available or you're not connected to a database.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Render the table preview component when a table is selected */}
      {previewTable && (
        <div id="tablePreviewContainer" className="chat-area-preview">
          <DirectTablePreview 
            table={previewTable}
            onClose={closeTablePreview}
          />
        </div>
      )}
    </>
  );
}

export default ConnectionSettings;