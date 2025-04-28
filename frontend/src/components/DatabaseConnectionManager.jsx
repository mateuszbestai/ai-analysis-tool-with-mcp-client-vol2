import { useState, useEffect } from "react";
import './DatabaseConnection.css';

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

  // Open modal
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

  // Close modal
  const closeModal = () => {
    setIsModalOpen(false);
  };

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setConnectionData({
      ...connectionData,
      [name]: value
    });
  };

  // Reset form fields
  const resetForm = () => {
    setConnectionData({
      connectionName: "",
      server: "",
      database: "",
      username: "",
      password: ""
    });
  };

  // Handle outside click to close modal
  const handleClickOutside = (e) => {
    if (e.target.className === "modal") {
      closeModal();
    }
  };

  return (
    <div className="db-connection-container">
      {isConnected ? (
        <div className="connection-status-info">
          <div className="connection-header">
            <span className="connection-icon">
              <span className="material-symbols-outlined">database</span>
            </span>
            <div className="connection-details">
              <h3>Connected Database</h3>
              <p>{connectedDb}</p>
            </div>
          </div>
          <div className="connection-actions">
            <button 
              className="connection-settings-btn" 
              onClick={openModal}
            >
              <span className="material-symbols-outlined">settings</span>
              Database Settings
            </button>
          </div>
        </div>
      ) : (
        <button className="db-connect-button" onClick={openModal}>
          <span className="material-symbols-outlined btn-icon">link</span>
          Connect to Database
        </button>
      )}

      {isModalOpen && (
        <div className="modal" onClick={handleClickOutside}>
          <div className="modal-content">
            <div className="modal-header">
              <h2>{isConnected ? "Database Connection" : "Connect to Database"}</h2>
              <button className="close-button" onClick={closeModal}>&times;</button>
            </div>
            
            {isConnected ? (
              <div className="modal-body">
                <div className="connection-info">
                  <div className="connected-status">
                    <div className="status-icon">
                      <span className="material-symbols-outlined">check_circle</span>
                    </div>
                    <div className="status-details">
                      <h3>Connected to {connectedDb}</h3>
                      <p>You are currently connected to the database.</p>
                    </div>
                  </div>
                  
                  <div className="table-list-container">
                    <h3>Available Tables</h3>
                    {tableList.length > 0 ? (
                      <ul className="table-list">
                        {tableList.map((table, index) => (
                          <li key={index} className="table-item">
                            <span className="table-name">{table}</span>
                            <button 
                              className="preview-table-btn"
                              onClick={() => {
                                // Trigger table preview and close modal
                                fetch('/get_table_preview', {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${localStorage.getItem("mcpToken")}`
                                  },
                                  body: JSON.stringify({ table })
                                });
                                closeModal();
                              }}
                            >
                              <span className="material-symbols-outlined">visibility</span>
                              Preview
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="no-tables">No tables available</p>
                    )}
                  </div>
                  
                  <div className="connection-controls">
                    <button 
                      className="refresh-btn"
                      onClick={() => {
                        fetch('/refresh_tables', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${localStorage.getItem("mcpToken")}`
                          }
                        })
                        .then(response => response.json())
                        .then(data => {
                          if (data.tables) {
                            setTableList(data.tables);
                            alert('Tables refreshed successfully!');
                          }
                        });
                      }}
                    >
                      <span className="material-symbols-outlined">refresh</span>
                      Refresh Tables
                    </button>
                    
                    <button 
                      className="disconnect-btn"
                      onClick={() => {
                        fetch('/disconnect', {
                          method: 'POST',
                          headers: {
                            'Authorization': `Bearer ${localStorage.getItem("mcpToken")}`
                          }
                        })
                        .then(() => {
                          localStorage.removeItem("mcpToken");
                          setIsConnected(false);
                          setConnectedDb("");
                          setTableList([]);
                          closeModal();
                        });
                      }}
                    >
                      <span className="material-symbols-outlined">link_off</span>
                      Disconnect
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="modal-body">
                <div className="connection-tabs">
                  <button 
                    className={`tab-btn ${activeTab === 'new' ? 'active' : ''}`}
                    onClick={() => setActiveTab('new')}
                  >
                    New Connection
                  </button>
                  <button 
                    className={`tab-btn ${activeTab === 'existing' ? 'active' : ''}`}
                    onClick={() => setActiveTab('existing')}
                  >
                    Saved Connections
                  </button>
                </div>
                
                {activeTab === 'existing' && savedConnections.length > 0 ? (
                  <div className="saved-connections">
                    <ul className="connections-list">
                      {savedConnections.map((conn, index) => (
                        <li 
                          key={index} 
                          className={`connection-item ${selectedConnection?.id === conn.id ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectedConnection(conn);
                            setConnectionData({
                              connectionName: conn.name,
                              server: conn.server,
                              database: conn.database,
                              username: "",
                              password: ""
                            });
                          }}
                        >
                          <div className="connection-item-details">
                            <h4>{conn.name}</h4>
                            <p>{conn.server} / {conn.database}</p>
                          </div>
                          <button 
                            className="delete-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              const newConnections = savedConnections.filter(c => c.id !== conn.id);
                              setSavedConnections(newConnections);
                              localStorage.setItem("dbConnections", JSON.stringify(newConnections));
                            }}
                          >
                            <span className="material-symbols-outlined">delete</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : activeTab === 'existing' ? (
                  <div className="no-connections">
                    <p>No saved connections found. Create a new connection first.</p>
                  </div>
                ) : null}
                
                <form 
                  className="connection-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setIsConnecting(true);
                    
                    fetch('/connect_db', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({
                        server: connectionData.server,
                        database: connectionData.database,
                        username: connectionData.username,
                        password: connectionData.password
                      })
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
                        
                        // Store token if provided
                        if (data.token) {
                          localStorage.setItem("mcpToken", data.token);
                        }
                        
                        // Save connection if it has a name
                        if (connectionData.connectionName && activeTab === 'new') {
                          const newConnection = {
                            id: Date.now().toString(),
                            name: connectionData.connectionName,
                            server: connectionData.server,
                            database: connectionData.database
                          };
                          
                          const updatedConnections = [...savedConnections, newConnection];
                          setSavedConnections(updatedConnections);
                          localStorage.setItem("dbConnections", JSON.stringify(updatedConnections));
                        }
                        
                        // Close modal after successful connection
                        setTimeout(() => {
                          closeModal();
                        }, 1500);
                      }
                    })
                    .catch(error => {
                      console.error('Error connecting to database:', error);
                      setIsConnecting(false);
                      alert('Error connecting to database. Please try again.');
                    });
                  }}
                >
                  {activeTab === 'new' && (
                    <div className="form-group">
                      <label htmlFor="connectionName">Connection Name</label>
                      <input
                        type="text"
                        id="connectionName"
                        name="connectionName"
                        value={connectionData.connectionName}
                        onChange={handleInputChange}
                        placeholder="My Database Connection"
                      />
                      <div className="form-hint">Optional: Name to save this connection</div>
                    </div>
                  )}
                  
                  <div className="form-group">
                    <label htmlFor="server">Server</label>
                    <input
                      type="text"
                      id="server"
                      name="server"
                      value={connectionData.server}
                      onChange={handleInputChange}
                      placeholder="e.g., your-server.database.windows.net"
                      required
                      readOnly={activeTab === 'existing' && selectedConnection}
                    />
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="database">Database</label>
                    <input
                      type="text"
                      id="database"
                      name="database"
                      value={connectionData.database}
                      onChange={handleInputChange}
                      placeholder="Database name"
                      required
                      readOnly={activeTab === 'existing' && selectedConnection}
                    />
                  </div>
                  
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="username">Username</label>
                      <input
                        type="text"
                        id="username"
                        name="username"
                        value={connectionData.username}
                        onChange={handleInputChange}
                        placeholder="Username"
                        required
                      />
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="password">Password</label>
                      <input
                        type="password"
                        id="password"
                        name="password"
                        value={connectionData.password}
                        onChange={handleInputChange}
                        placeholder="Password"
                        required
                      />
                    </div>
                  </div>
                  
                  <div className="form-actions">
                    <button
                      type="submit"
                      className="connect-btn"
                      disabled={isConnecting}
                    >
                      {isConnecting ? (
                        <>
                          <span className="spinner"></span>
                          Connecting...
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined">link</span>
                          Connect
                        </>
                      )}
                    </button>
                    
                    <button
                      type="button"
                      className="cancel-btn"
                      onClick={closeModal}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
                
                {connectionSuccess && (
                  <div className="connection-success">
                    <span className="material-symbols-outlined">check_circle</span>
                    <p>Successfully connected to {connectedDb}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default DatabaseConnectionManager;