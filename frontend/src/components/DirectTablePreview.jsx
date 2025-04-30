import React, { useState, useEffect } from 'react';

function DirectTablePreview({ table, onClose }) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!table) return;
    
    fetchTableData(table);
  }, [table]);

  const fetchTableData = (tableName) => {
    // Get token from localStorage if available
    const token = localStorage.getItem("mcpToken");
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    console.log(`Requesting direct preview for table: ${tableName}`);
    setIsLoading(true);
    
    fetch('/get_table_preview', {
      method: 'POST',
      headers,
      body: JSON.stringify({ table: tableName })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log('Table preview data received:', data);
      
      if (data.error) {
        setError(data.error);
        setIsLoading(false);
        return;
      }
      
      // Extract table data
      let tableHeaders = [];
      let tableRows = [];
      
      if (data.table && data.table.headers) {
        tableHeaders = data.table.headers;
        tableRows = data.table.rows || [];
      } else if (data.headers) {
        tableHeaders = data.headers;
        tableRows = data.rows || [];
      } else {
        setError('Could not find table data in the response');
        setIsLoading(false);
        return;
      }
      
      console.log(`Loaded ${tableRows.length} rows with ${tableHeaders.length} columns`);
      
      setHeaders(tableHeaders);
      setRows(tableRows);
      setIsLoading(false);
    })
    .catch(error => {
      console.error('Error fetching table preview:', error);
      setError(error.message);
      setIsLoading(false);
    });
  };

  if (error) {
    return (
      <div className="direct-table-preview error">
        <div className="preview-header">
          <h3>Error Loading Table: {table}</h3>
          <button onClick={onClose}>✖</button>
        </div>
        <div className="preview-content error">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="direct-table-preview loading">
        <div className="preview-header">
          <h3>Loading Table: {table}</h3>
          <button onClick={onClose}>✖</button>
        </div>
        <div className="preview-content loading">
          <div className="loading-spinner"></div>
          <p>Loading table data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="direct-table-preview">
      <div className="preview-header">
        <h3>Preview of {table}</h3>
        <button onClick={onClose}>✖</button>
      </div>
      <div className="preview-content">
        {headers.length > 0 ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  {headers.map((header, index) => (
                    <th key={index}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length > 0 ? (
                  rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex}>
                          {cell !== null && cell !== undefined ? String(cell) : ''}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={headers.length} className="no-data">
                      No data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="no-data">No columns available</p>
        )}
      </div>
    </div>
  );
}

export default DirectTablePreview;