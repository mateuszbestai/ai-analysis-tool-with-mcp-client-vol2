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
    
    fetch('/get_table_preview', {
      method: 'POST',
      headers,
      body: JSON.stringify({ table: table })
    })
    .then(response => response.json())
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
      alert('Error fetching table preview');
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