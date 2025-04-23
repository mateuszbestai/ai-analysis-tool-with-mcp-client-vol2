import { useState, useEffect } from "react";

function DatabaseConnectionManager() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionSuccess, setConnectionSuccess] = useState(false);
  const [connectedDb, setConnectedDb] = useState("");
  const [tableList, setTableList] = useState([]);
  const [savedConnections, setSavedConnections] = useState([]);
  const [activeTab, setActiveTab] = useState("new"); // "new" or "existing"
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionData, setConnectionData] = useState({
    connectionName: "",
    server: "",
    database: "",
    username: "",
    password: ""
  });

  // Load saved connections from localStorage on component mount and check connection status
  useEffect(() => {
    const savedConns = localStorage.getItem("dbConnections");
    if (savedConns) {
      setSavedConnections(JSON.parse(savedConns));
    }
    
    // Check if already connected
    checkConnectionStatus();
  }, []);
  
  // Function to check connection status
  const checkConnectionStatus = async () => {
    try {
      // Get token from localStorage if it exists
      const token = localStorage.getItem("mcpToken");
      const headers = {};
      
      // Add authorization header if token exists
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      
      const response = await fetch('/check_connection_status', {
        method: 'GET',
        headers
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.connected) {
          setIsConnected(true);
          setConnectedDb(data.database);
          setTableList(data.tables || []);
          setConnectionSuccess(true);
          
          // Ensure mode is set to SQL
          fetch('/switch_mode', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token && { 'Authorization': `Bearer ${token}` })
            },
            body: JSON.stringify({ mode: 'sql' })
          });
        } else {
          setIsConnected(false);
          // Token is invalid - remove it
          localStorage.removeItem("mcpToken");
        }
      } else {
        // Connection check failed - clear state
        setIsConnected(false);
        localStorage.removeItem("mcpToken");
      }
    } catch (error) {
      console.error('Error checking connection status:', error);
      setIsConnected(false);
      localStorage.removeItem("mcpToken");
    }
  };
  
  // Helper function to get auth headers
  const getAuthHeaders = () => {
    const token = localStorage.getItem("mcpToken");
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    return headers;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setConnectionData({
      ...connectionData,
      [name]: value
    });
  };

  const openModal = () => {
    // If already connected, show the connection status
    if (isConnected) {
      setConnectionSuccess(true);
    } else {
      setConnectionSuccess(false);
      setActiveTab("new");
      resetForm();
    }
    
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const resetForm = () => {
    setConnectionData({
      connectionName: "",
      server: "",
      database: "",
      username: "",
      password: ""
    });
  };

  const handleClickOutside = (e) => {
    if (e.target.className === "modal") {
      closeModal();
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (!isConnected) {
      setConnectionSuccess(false);
    }
    resetForm();
    setSelectedConnection(null);
  };

  const saveConnection = () => {
    // Check if connectionName is provided
    if (!connectionData.connectionName.trim()) {
      alert("Please provide a name for this connection");
      return;
    }

    // Create connection object to save
    const connectionToSave = {
      id: Date.now().toString(),
      name: connectionData.connectionName,
      server: connectionData.server,
      database: connectionData.database
      // We don't save username and password for security reasons
    };

    // Add to savedConnections
    const updatedConnections = [...savedConnections, connectionToSave];
    setSavedConnections(updatedConnections);
    
    // Save to localStorage
    localStorage.setItem("dbConnections", JSON.stringify(updatedConnections));
    
    alert(`Connection "${connectionData.connectionName}" has been saved`);
  };

  const deleteConnection = (id) => {
    if (confirm("Are you sure you want to delete this connection?")) {
      const updatedConnections = savedConnections.filter(conn => conn.id !== id);
      setSavedConnections(updatedConnections);
      localStorage.setItem("dbConnections", JSON.stringify(updatedConnections));
    }
  };

  const selectConnection = (connection) => {
    setSelectedConnection(connection);
    setConnectionData({
      connectionName: connection.name,
      server: connection.server,
      database: connection.database,
      username: "",
      password: ""
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsConnecting(true);

    const connectionPayload = {
      server: connectionData.server,
      database: connectionData.database,
      username: connectionData.username,
      password: connectionData.password
    };

    fetch('/connect_db', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(connectionPayload)
    })
    .then(response => response.json())
    .then(data => {
      setIsConnecting(false);
      
      if (data.error) {
        alert('Connection error: ' + data.error);
      } else {
        setConnectionSuccess(true);
        setConnectedDb(connectionData.database);
        setTableList(data.tables || []);
        setIsConnected(true);
        
        // Store the MCP token if provided
        if (data.token) {
          localStorage.setItem("mcpToken", data.token);
        }
        
        // If it's a new connection and has a name, offer to save it
        if (activeTab === "new" && connectionData.connectionName && 
            !savedConnections.some(c => c.name === connectionData.connectionName)) {
          saveConnection();
        }
        
        // Switch to SQL mode
        fetch('/switch_mode', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ mode: 'sql' })
        });
        
        // Add a success message to the chat area
        const chatArea = document.getElementById('chatArea');
        if (chatArea) {
          const successMsg = document.createElement('div');
          successMsg.className = 'system-message success';
          successMsg.textContent = `Successfully connected to database: ${connectionData.database}. You can now ask questions about your data!`;
          chatArea.appendChild(successMsg);
        }
      }
    })
    .catch(error => {
      console.error('Error connecting to database:', error);
      setIsConnecting(false);
      alert('Error connecting to database. Please check your connection details and try again.');
    });
  };

  const disconnectDatabase = async () => {
    try {
      setIsConnecting(true);
      
      const response = await fetch('/disconnect', {
        method: 'POST',
        headers: getAuthHeaders() // Use the helper function
      });
      
      // Always clean up the frontend state, regardless of response
      setIsConnected(false);
      setConnectionSuccess(false);
      setConnectedDb("");
      setTableList([]);
      localStorage.removeItem("mcpToken");
      
      // Switch back to CSV mode
      fetch('/switch_mode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ mode: 'csv' })
      });
      
      // Show appropriate message based on response
      if (response.ok) {
        alert('Successfully disconnected from database');
      } else {
        const errorData = await response.json();
        // We still alert success because the client side is disconnected
        alert('Disconnected from database. Server message: ' + (errorData.error || 'Unknown status'));
      }
      
      closeModal();
      
      // Add a message to the chat area
      const chatArea = document.getElementById('chatArea');
      if (chatArea) {
        const disconnectMsg = document.createElement('div');
        disconnectMsg.className = 'system-message info';
        disconnectMsg.textContent = 'Disconnected from database. You can upload a CSV file or connect to another database.';
        chatArea.appendChild(disconnectMsg);
      }
    } catch (error) {
      console.error('Error disconnecting:', error);
      
      // Still clean up the frontend state
      setIsConnected(false);
      setConnectionSuccess(false);
      setConnectedDb("");
      setTableList([]);
      localStorage.removeItem("mcpToken");
      
      alert('Error while disconnecting, but local session cleared.');
    } finally {
      setIsConnecting(false);
    }
  };

  const previewTable = (table) => {
    fetch('/get_table_preview', {
      method: 'POST',
      headers: getAuthHeaders(), // Use the helper function
      body: JSON.stringify({ table: table })
    })
    .then(response => {
      if (!response.ok) {
        // Check if this is a connection error
        if (response.status === 400) {
          // Try to re-establish connection
          checkConnectionStatus();
          throw new Error('Connection error. Please try again after reconnecting.');
        }
        throw new Error('Failed to get table preview');
      }
      return response.json();
    })
    .then(previewData => {
      if (previewData.error) {
        alert('Preview error: ' + previewData.error);
      } else if (previewData.table) {
        // Display table in the chat area
        const chatArea = document.getElementById('chatArea');
        if (chatArea) {
          // Create a container div for the preview with controls
          const previewContainer = document.createElement('div');
          previewContainer.className = 'preview-container';
          previewContainer.id = `preview-${Date.now()}`;
          
          // Add header with controls
          const previewHeader = document.createElement('div');
          previewHeader.className = 'preview-header';
          
          // Title
          const titleSpan = document.createElement('span');
          titleSpan.className = 'preview-title';
          titleSpan.textContent = `Preview of table: ${table}`;
          previewHeader.appendChild(titleSpan);
          
          // Controls
          const controlsDiv = document.createElement('div');
          controlsDiv.className = 'preview-controls';
          
          // Hide button
          const hideBtn = document.createElement('button');
          hideBtn.className = 'preview-btn preview-hide-btn';
          hideBtn.innerHTML = '<span class="material-symbols-outlined">visibility_off</span>';
          hideBtn.title = 'Hide table';
          hideBtn.onclick = function() {
            const tableDiv = this.closest('.preview-container').querySelector('.table-container');
            if (tableDiv.style.display === 'none') {
              tableDiv.style.display = 'block';
              this.innerHTML = '<span class="material-symbols-outlined">visibility_off</span>';
              this.title = 'Hide table';
            } else {
              tableDiv.style.display = 'none';
              this.innerHTML = '<span class="material-symbols-outlined">visibility</span>';
              this.title = 'Show table';
            }
          };
          
          // Delete button
          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'preview-btn preview-delete-btn';
          deleteBtn.innerHTML = '<span class="material-symbols-outlined">delete</span>';
          deleteBtn.title = 'Delete preview';
          deleteBtn.onclick = function() {
            this.closest('.preview-container').remove();
          };
          
          controlsDiv.appendChild(hideBtn);
          controlsDiv.appendChild(deleteBtn);
          previewHeader.appendChild(controlsDiv);
          
          previewContainer.appendChild(previewHeader);
          
          // Create table container
          const tableDiv = document.createElement('div');
          tableDiv.className = 'table-container';
          
          // Create table
          const tableEl = document.createElement('table');
          tableEl.className = 'chat-table';
          
          // Create header
          const thead = document.createElement('thead');
          const headerRow = document.createElement('tr');
          previewData.table.headers.forEach(header => {
            const th = document.createElement('th');
            th.textContent = header;
            headerRow.appendChild(th);
          });
          thead.appendChild(headerRow);
          tableEl.appendChild(thead);
          
          // Create body
          const tbody = document.createElement('tbody');
          previewData.table.rows.forEach(row => {
            const tr = document.createElement('tr');
            row.forEach(cell => {
              const td = document.createElement('td');
              td.textContent = cell !== null ? cell : '';
              tr.appendChild(td);
            });
            tbody.appendChild(tr);
          });
          tableEl.appendChild(tbody);
          
          tableDiv.appendChild(tableEl);
          previewContainer.appendChild(tableDiv);
          
          // Add the preview container to the chat area
          chatArea.appendChild(previewContainer);
          
          // Close the modal
          closeModal();
        }
      }
    })
    .catch(error => {
      console.error('Error fetching table preview:', error);
      alert(`Error fetching table preview: ${error.message}`);
    });
  };

  const refreshTables = async () => {
    try {
      const response = await fetch('/refresh_tables', {
        method: 'POST',
        headers: getAuthHeaders()
      });
      
      if (response.ok) {
        const data = await response.json();
        setTableList(data.tables || []);
        alert('Tables refreshed successfully!');
      } else {
        // Check if this is a connection error
        if (response.status === 400) {
          // Try to re-establish connection first
          await checkConnectionStatus();
          
          // Try refresh again if reconnection succeeded
          if (isConnected) {
            refreshTables();
            return;
          }
        }
        
        // Handle other errors
        const errorData = await response.json();
        alert(`Error: ${errorData.error || 'Failed to refresh tables'}`);
      }
    } catch (error) {
      console.error('Error refreshing tables:', error);
      alert('Error refreshing tables. Please try again.');
    }
  };
  

  return (
    <>
      <button 
        id="connectDbBtn" 
        className="db-connect-button" 
        onClick={openModal}
      >
        {isConnected ? "Manage Database Connection" : "Connect to Database"}
      </button>

      {isModalOpen && (
        <div id="dbConnectionModal" className="modal" onClick={handleClickOutside}>
          <div className="modal-content">
            <span className="close" onClick={closeModal}>&times;</span>
            <h2>{isConnected ? "Database Connection Manager" : "Connect to Database"}</h2>
            
            {isConnected ? (
              // Show connection details when connected
              <div className="connection-info">
                <div className="connection-status">
                  <div className="status-indicator status-connected"></div>
                  <div>Connected to database: <strong>{connectedDb}</strong></div>
                </div>
                
                <div className="connection-actions">
                  <button 
                    onClick={refreshTables} 
                    className="btn-primary"
                    style={{ marginRight: '10px' }}
                    disabled={isConnecting}
                  >
                    <span className="material-symbols-outlined btn-icon">refresh</span>
                    Refresh Tables
                  </button>
                  
                  <button 
                    onClick={disconnectDatabase} 
                    className="btn-danger"
                    disabled={isConnecting}
                  >
                    <span className="material-symbols-outlined btn-icon">link_off</span>
                    {isConnecting ? "Disconnecting..." : "Disconnect"}
                  </button>
                </div>
                
                <h4>Available Tables:</h4>
                {tableList.length > 0 ? (
                  <div className="table-list-container">
                    <ul className="connection-list">
                      {tableList.map((table, index) => (
                        <li key={index} className="connection-item">
                          <div className="connection-info">
                            <span className="connection-name">{table}</span>
                          </div>
                          <button 
                            className="btn-small" 
                            onClick={() => previewTable(table)}
                          >
                            Preview
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="no-connections">No tables available.</p>
                )}
              </div>
            ) : (
              // Show connection form when not connected
              <>
                <div className="connection-tabs">
                  <button 
                    className={`tab-btn ${activeTab === 'new' ? 'active' : ''}`}
                    onClick={() => handleTabChange('new')}
                  >
                    New Connection
                  </button>
                  <button 
                    className={`tab-btn ${activeTab === 'existing' ? 'active' : ''}`}
                    onClick={() => handleTabChange('existing')}
                  >
                    Saved Connections ({savedConnections.length})
                  </button>
                </div>

                {activeTab === 'existing' && (
                  <div className="saved-connections">
                    {savedConnections.length === 0 ? (
                      <p className="no-connections">No saved connections. Create a new connection first.</p>
                    ) : (
                      <ul className="connection-list">
                        {savedConnections.map(connection => (
                          <li 
                            key={connection.id} 
                            className={`connection-item ${selectedConnection?.id === connection.id ? 'selected' : ''}`}
                          >
                            <div className="connection-info" onClick={() => selectConnection(connection)}>
                              <span className="connection-name">{connection.name}</span>
                              <span className="connection-details">{connection.server} / {connection.database}</span>
                            </div>
                            <button 
                              className="delete-connection-btn" 
                              onClick={() => deleteConnection(connection.id)}
                              title="Delete connection"
                            >
                              <span className="material-symbols-outlined">delete</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                
                <form id="dbConnectionForm" onSubmit={handleSubmit}>
                  {activeTab === 'new' && (
                    <div className="form-group">
                      <label htmlFor="connectionName">Connection Name:</label>
                      <input 
                        type="text" 
                        id="connectionName" 
                        name="connectionName" 
                        placeholder="My Database Connection" 
                        value={connectionData.connectionName}
                        onChange={handleInputChange}
                      />
                      <small className="form-hint">Give this connection a name if you want to save it</small>
                    </div>
                  )}
                  
                  <div className="form-group">
                    <label htmlFor="server">Server:</label>
                    <input 
                      type="text" 
                      id="server" 
                      name="server" 
                      placeholder="e.g., your-server.database.windows.net" 
                      value={connectionData.server}
                      onChange={handleInputChange}
                      required 
                      readOnly={activeTab === 'existing' && selectedConnection}
                    />
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="database">Database:</label>
                    <input 
                      type="text" 
                      id="database" 
                      name="database" 
                      value={connectionData.database}
                      onChange={handleInputChange}
                      required 
                      readOnly={activeTab === 'existing' && selectedConnection}
                    />
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="username">Username:</label>
                    <input 
                      type="text" 
                      id="username" 
                      name="username" 
                      value={connectionData.username}
                      onChange={handleInputChange}
                      required 
                    />
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="password">Password:</label>
                    <input 
                      type="password" 
                      id="password" 
                      name="password" 
                      value={connectionData.password}
                      onChange={handleInputChange}
                      required 
                    />
                  </div>
                  
                  <div className="form-actions">
                    <button 
                      type="submit" 
                      className="btn-primary"
                      disabled={isConnecting || (activeTab === 'existing' && !selectedConnection)}
                    >
                      {isConnecting ? 'Connecting...' : 'Connect'}
                    </button>
                    
                    {activeTab === 'new' && connectionData.connectionName && (
                      <button 
                        type="button" 
                        className="btn-secondary"
                        onClick={saveConnection}
                      >
                        Save Connection
                      </button>
                    )}
                  </div>
                </form>
              </>
            )}
            
            {connectionSuccess && !isConnected && (
              <div className="success-message">
                <h3>Connection Successful!</h3>
                <p>Connected to <span id="connectedDb">{connectedDb}</span></p>
                <h4>Available Tables:</h4>
                <ul id="tableList">
                  {tableList.map((table, index) => (
                    <li key={index}>
                      {table}
                      <button 
                        className="btn-small" 
                        onClick={() => previewTable(table)}
                      >
                        Preview
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default DatabaseConnectionManager;