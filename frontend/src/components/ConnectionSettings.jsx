import { useState, useEffect } from "react";

function ConnectionSettings() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [connectedDb, setConnectedDb] = useState("");
  const [tableList, setTableList] = useState([]);
  const [isDbConnected, setIsDbConnected] = useState(false);

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

  const previewTable = (table) => {
    // Get token from localStorage if available
    const token = localStorage.getItem("mcpToken");
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    console.log(`Requesting preview for table: ${table}`);
    
    fetch('/get_table_preview', {
      method: 'POST',
      headers,
      body: JSON.stringify({ table: table })
    })
    .then(response => response.json())
    .then(previewData => {
      console.log('Preview data received:', previewData);
      
      if (previewData.error) {
        console.error('Preview error:', previewData.error);
        alert('Preview error: ' + previewData.error);
        return;
      }
      
      // Extract table data
      let headers = [];
      let rows = [];
      
      if (previewData.table && previewData.table.headers) {
        headers = previewData.table.headers;
        rows = previewData.table.rows || [];
      } else if (previewData.headers) {
        headers = previewData.headers;
        rows = previewData.rows || [];
      } else {
        console.error('Could not find table data in the response');
        alert('Received response but could not find table data');
        return;
      }
      
      console.log('Extracted table data:', { headers, rows });
      
      // Get chat area element
      const chatArea = document.querySelector('.chat-area');
      if (!chatArea) {
        console.error('Chat area not found');
        alert('Could not find chat area to display table');
        return;
      }
      
      // Create a container for the table
      const tableContainer = document.createElement('div');
      tableContainer.style.margin = '15px 0';
      tableContainer.style.border = '1px solid #273c75';
      tableContainer.style.borderRadius = '8px';
      tableContainer.style.overflow = 'hidden';
      
      // Create header
      const headerDiv = document.createElement('div');
      headerDiv.style.backgroundColor = '#273c75';
      headerDiv.style.color = 'white';
      headerDiv.style.padding = '10px 15px';
      headerDiv.style.fontWeight = 'bold';
      headerDiv.style.display = 'flex';
      headerDiv.style.justifyContent = 'space-between';
      headerDiv.textContent = `Preview of table: ${table}`;
      
      // Create controls
      const controlsDiv = document.createElement('div');
      
      // Delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.innerHTML = '✖';
      deleteBtn.style.background = 'none';
      deleteBtn.style.border = 'none';
      deleteBtn.style.color = 'white';
      deleteBtn.style.fontSize = '16px';
      deleteBtn.style.cursor = 'pointer';
      deleteBtn.title = 'Remove preview';
      deleteBtn.onclick = function() {
        tableContainer.remove();
      };
      
      controlsDiv.appendChild(deleteBtn);
      headerDiv.appendChild(controlsDiv);
      tableContainer.appendChild(headerDiv);
      
      // Create table wrapper
      const tableWrapper = document.createElement('div');
      tableWrapper.style.overflowX = 'auto';
      tableWrapper.style.maxHeight = '400px';
      tableWrapper.style.overflowY = 'auto';
      
      // Create table
      const table = document.createElement('table');
      table.style.width = '100%';
      table.style.borderCollapse = 'collapse';
      table.style.backgroundColor = 'white';
      
      // Create thead
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      
      headers.forEach(header => {
        const th = document.createElement('th');
        th.style.padding = '10px 15px';
        th.style.backgroundColor = '#f0f2f5';
        th.style.border = '1px solid #ddd';
        th.style.position = 'sticky';
        th.style.top = '0';
        th.textContent = header;
        headerRow.appendChild(th);
      });
      
      thead.appendChild(headerRow);
      table.appendChild(thead);
      
      // Create tbody
      const tbody = document.createElement('tbody');
      
      if (rows.length > 0) {
        rows.forEach((row, rowIndex) => {
          const tr = document.createElement('tr');
          
          row.forEach(cell => {
            const td = document.createElement('td');
            td.style.padding = '8px 15px';
            td.style.border = '1px solid #ddd';
            td.style.backgroundColor = rowIndex % 2 === 0 ? 'white' : '#f8f9fa';
            td.textContent = cell !== null && cell !== undefined ? String(cell) : '';
            tr.appendChild(td);
          });
          
          tbody.appendChild(tr);
        });
      } else {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = headers.length;
        td.style.textAlign = 'center';
        td.style.padding = '20px';
        td.style.color = '#666';
        td.textContent = 'No data available';
        tr.appendChild(td);
        tbody.appendChild(tr);
      }
      
      table.appendChild(tbody);
      tableWrapper.appendChild(table);
      tableContainer.appendChild(tableWrapper);
      
      // Add to chat area
      chatArea.appendChild(tableContainer);
      
      // Close the modal
      closeModal();
    })
    .catch(error => {
      console.error('Error fetching table preview:', error);
      alert('Error fetching table preview: ' + error.message);
    });
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
                          onClick={() => previewTable(table)}
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
    </>
  );
}

export default ConnectionSettings;