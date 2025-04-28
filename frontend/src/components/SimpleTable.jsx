import React from 'react';

const SimpleTable = ({ headers, rows, title }) => {
  console.log('SimpleTable rendering with:', { 
    title,
    headers: headers ? `${headers.length} headers` : 'no headers', 
    rows: rows ? `${rows.length} rows` : 'no rows'
  });
  
  return (
    <div className="simple-table-wrapper" style={{ margin: '15px 0' }}>
      <div style={{ 
        backgroundColor: '#273c75', 
        color: 'white', 
        padding: '10px 15px',
        borderTopLeftRadius: '8px',
        borderTopRightRadius: '8px',
        fontWeight: 'bold'
      }}>
        {title || 'Data Table'}
      </div>
      
      <div style={{ 
        overflowX: 'auto', 
        border: '1px solid #ccc',
        borderBottomLeftRadius: '8px',
        borderBottomRightRadius: '8px'
      }}>
        <table style={{ 
          width: '100%', 
          borderCollapse: 'collapse',
          backgroundColor: 'white'
        }}>
          <thead>
            <tr>
              {headers && headers.map((header, index) => (
                <th key={index} style={{ 
                  padding: '10px 15px', 
                  backgroundColor: '#f0f2f5',
                  border: '1px solid #ddd',
                  position: 'sticky',
                  top: 0
                }}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows && rows.length > 0 ? (
              rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} style={{ 
                      padding: '8px 15px',
                      border: '1px solid #ddd',
                      backgroundColor: rowIndex % 2 === 0 ? 'white' : '#f8f9fa'
                    }}>
                      {cell !== null && cell !== undefined ? String(cell) : ''}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td 
                  colSpan={headers ? headers.length : 1} 
                  style={{ 
                    textAlign: 'center', 
                    padding: '20px',
                    color: '#666'
                  }}
                >
                  No data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SimpleTable;