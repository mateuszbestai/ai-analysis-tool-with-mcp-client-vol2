import { useState } from "react";

function DatabaseConnection() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionSuccess, setConnectionSuccess] = useState(false);
  const [connectedDb, setConnectedDb] = useState("");
  const [tableList, setTableList] = useState([]);
  const [connectionData, setConnectionData] = useState({
    server: "",
    database: "",
    username: "",
    password: ""
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setConnectionData({
      ...connectionData,
      [name]: value
    });
  };

  const openModal = () => {
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

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsConnecting(true);

    fetch('/connect_db', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(connectionData)
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
          successMsg.className = 'system-message';
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

  const previewTable = (table) => {
    fetch('/get_table_preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
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

  return (
    <>
      <button id="connectDbBtn" className="db-connect-button" onClick={openModal}>
        Connect to Database
      </button>

      {isModalOpen && (
        <div id="dbConnectionModal" className="modal" onClick={handleClickOutside}>
          <div className="modal-content">
            <span className="close" onClick={closeModal}>&times;</span>
            <h2>Connect to SQL Database</h2>
            
            <form id="dbConnectionForm" onSubmit={handleSubmit}>
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
              
              <button 
                type="submit" 
                className="btn-primary"
                disabled={isConnecting}
              >
                {isConnecting ? 'Connecting...' : 'Connect'}
              </button>
            </form>
            
            <div id="connectionStatus" className={connectionSuccess ? '' : 'hidden'}>
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
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default DatabaseConnection;