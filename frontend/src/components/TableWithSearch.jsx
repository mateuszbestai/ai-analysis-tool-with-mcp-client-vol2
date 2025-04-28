// TableWithSearch.jsx - Comprehensive fix
import { useState, useEffect } from 'react';
import './Table.css';

const TableWithSearch = ({ headers, rows, tableName }) => {
  // Add console logging to debug data
  console.log('TableWithSearch received:', { 
    tableName, 
    headers: headers ? `${headers.length} headers` : 'no headers', 
    rows: rows ? `${rows.length} rows` : 'no rows' 
  });
  console.log('First row:', rows && rows.length > 0 ? rows[0] : 'none');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredRows, setFilteredRows] = useState([]);
  const [filters, setFilters] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(5); // Default to 5 rows per page
  const [expandedFilters, setExpandedFilters] = useState(false);
  const [processedHeaders, setProcessedHeaders] = useState([]);

  // Process and normalize headers
  useEffect(() => {
    if (!headers) {
      // If no headers provided, but we have rows, generate numeric headers
      if (rows && rows.length > 0 && rows[0] && Array.isArray(rows[0])) {
        const generatedHeaders = Array.from({ length: rows[0].length }, (_, i) => `Column ${i+1}`);
        setProcessedHeaders(generatedHeaders);
        console.log('Generated headers:', generatedHeaders);
      } else {
        setProcessedHeaders([]);
      }
    } else {
      setProcessedHeaders(headers);
      console.log('Using provided headers:', headers);
    }
  }, [headers, rows]);

  // Process and normalize rows, ensuring we always have a valid array
  useEffect(() => {
    if (!rows || !Array.isArray(rows)) {
      setFilteredRows([]);
      return;
    }
    
    // Ensure all rows are arrays
    const normalizedRows = rows.map(row => 
      Array.isArray(row) ? row : [row]
    );
    
    setFilteredRows(normalizedRows);
    console.log('Normalized rows:', normalizedRows.length);
  }, [rows]);

  // Initialize filters based on processed headers
  useEffect(() => {
    if (!processedHeaders || processedHeaders.length === 0) return;
    
    const initialFilters = {};
    processedHeaders.forEach(header => {
      initialFilters[header] = { active: false, value: '' };
    });
    setFilters(initialFilters);
    console.log('Initialized filters for', processedHeaders.length, 'headers');
  }, [processedHeaders]);

  // Apply search, filters, and sorting to the normalized rows
  useEffect(() => {
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      console.log('No rows to filter');
      return;
    }
    
    console.log('Applying filters/search to', rows.length, 'rows');
    
    let result = [...rows];
    
    // Apply search
    if (searchQuery) {
      const lowercaseQuery = searchQuery.toLowerCase();
      result = result.filter(row => 
        row.some(cell => 
          cell !== null && 
          cell !== undefined && 
          String(cell).toLowerCase().includes(lowercaseQuery)
        )
      );
      console.log('After search:', result.length, 'rows remain');
    }
    
    // Apply column filters
    if (processedHeaders && processedHeaders.length > 0) {
      processedHeaders.forEach((header, columnIndex) => {
        if (filters[header]?.active && filters[header]?.value) {
          const filterValue = filters[header].value.toLowerCase();
          result = result.filter(row => {
            // Make sure the row has this column index
            if (row.length <= columnIndex) return false;
            
            const cell = row[columnIndex];
            return cell !== null && 
                   cell !== undefined && 
                   String(cell).toLowerCase().includes(filterValue);
          });
        }
      });
      console.log('After column filters:', result.length, 'rows remain');
    }
    
    // Apply sorting
    if (sortConfig.key !== null && processedHeaders) {
      const columnIndex = processedHeaders.indexOf(sortConfig.key);
      if (columnIndex !== -1) {
        result.sort((a, b) => {
          // Handle cases where row might not have this index
          const aValue = a.length > columnIndex ? String(a[columnIndex] || '').toLowerCase() : '';
          const bValue = b.length > columnIndex ? String(b[columnIndex] || '').toLowerCase() : '';
          
          if (aValue < bValue) {
            return sortConfig.direction === 'asc' ? -1 : 1;
          }
          if (aValue > bValue) {
            return sortConfig.direction === 'asc' ? 1 : -1;
          }
          return 0;
        });
        console.log('Sorted by', sortConfig.key, 'in', sortConfig.direction, 'order');
      }
    }
    
    setFilteredRows(result);
    
    // Reset to first page when filters change
    setCurrentPage(1);
  }, [searchQuery, filters, sortConfig, rows, processedHeaders]);

  // Handle sorting when a column header is clicked
  const handleSort = (columnName) => {
    let direction = 'asc';
    if (sortConfig.key === columnName && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key: columnName, direction });
    console.log('Sort changed to', columnName, direction);
  };

  // Toggle column filter
  const toggleFilter = (columnName) => {
    setFilters(prev => ({
      ...prev,
      [columnName]: {
        ...prev[columnName],
        active: !prev[columnName]?.active
      }
    }));
    console.log('Toggled filter for', columnName);
  };

  // Update filter value
  const updateFilterValue = (columnName, value) => {
    setFilters(prev => ({
      ...prev,
      [columnName]: {
        ...prev[columnName],
        value: value
      }
    }));
  };

  // Calculate pagination values
  const totalRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  
  // Ensure current page is valid
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);
  
  // Calculate slice for current page
  const indexOfLastRow = currentPage * rowsPerPage;
  const indexOfFirstRow = indexOfLastRow - rowsPerPage;
  const currentRows = filteredRows.slice(indexOfFirstRow, indexOfLastRow);
  
  console.log('Pagination:', { 
    currentPage, 
    rowsPerPage, 
    totalRows, 
    totalPages,
    displayingRows: currentRows.length
  });

  // Generate unique ID for the table
  const tableId = `table-${tableName ? tableName.replace(/[^a-zA-Z0-9]/g, '-') : 'data'}-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div className="table-with-search">
      <div className="table-header">
        <h3 className="table-title">{tableName || 'Data Table'}</h3>
        
        <div className="table-toolbar">
          <div className="search-container">
            <input
              type="text"
              className="search-input"
              placeholder="Search in table..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button 
              className="btn-action filter-toggle"
              onClick={() => setExpandedFilters(!expandedFilters)}
            >
              <span className="material-symbols-outlined">
                {expandedFilters ? 'filter_list_off' : 'filter_list'}
              </span>
              {expandedFilters ? 'Hide Filters' : 'Show Filters'}
            </button>
          </div>
          
          <div className="table-pagination">
            <span className="pagination-info">
              {totalRows} rows (Page {currentPage} of {totalPages})
            </span>
            <select 
              className="rows-per-page" 
              value={rowsPerPage}
              onChange={(e) => setRowsPerPage(Number(e.target.value))}
            >
              <option value={5}>5 rows</option>
              <option value={10}>10 rows</option>
              <option value={25}>25 rows</option>
              <option value={50}>50 rows</option>
              <option value={100}>100 rows</option>
            </select>
            <div className="pagination-controls">
              <button 
                className="btn-action" 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(1)}
              >
                <span className="material-symbols-outlined">first_page</span>
              </button>
              <button 
                className="btn-action" 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              >
                <span className="material-symbols-outlined">chevron_left</span>
              </button>
              <button 
                className="btn-action" 
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              >
                <span className="material-symbols-outlined">chevron_right</span>
              </button>
              <button 
                className="btn-action" 
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(totalPages)}
              >
                <span className="material-symbols-outlined">last_page</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Column filters */}
      {expandedFilters && processedHeaders && processedHeaders.length > 0 && (
        <div className="column-filters">
          {processedHeaders.map((header, index) => (
            <div key={index} className="filter-item">
              <div className="filter-header">
                <label className="filter-label">
                  <input
                    type="checkbox"
                    checked={filters[header]?.active || false}
                    onChange={() => toggleFilter(header)}
                  />
                  {header}
                </label>
              </div>
              {filters[header]?.active && (
                <input
                  type="text"
                  className="filter-input"
                  placeholder={`Filter ${header}...`}
                  value={filters[header]?.value || ''}
                  onChange={(e) => updateFilterValue(header, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="table-container">
        <table id={tableId} className="chat-table">
          <thead>
            <tr>
              {processedHeaders && processedHeaders.map((header, index) => (
                <th 
                  key={index} 
                  onClick={() => handleSort(header)}
                  className={sortConfig.key === header ? `sorted-${sortConfig.direction}` : ''}
                >
                  <div className="th-content">
                    <span>{header}</span>
                    {sortConfig.key === header && (
                      <span className="sort-icon">
                        {sortConfig.direction === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </div>
                </th>
              ))}
              {(!processedHeaders || processedHeaders.length === 0) && currentRows.length > 0 && 
                currentRows[0].map((_, index) => (
                  <th key={index}>Column {index + 1}</th>
                ))
              }
            </tr>
          </thead>
          <tbody>
            {currentRows && currentRows.length > 0 ? (
              currentRows.map((row, rowIndex) => (
                <tr key={rowIndex} className="data-row">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="data-cell">
                      {cell !== null && cell !== undefined ? String(cell) : ''}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td 
                  colSpan={
                    processedHeaders?.length || 
                    (currentRows[0]?.length) || 
                    1
                  } 
                  className="no-results"
                >
                  No data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {totalPages > 1 && (
        <div className="pagination-footer">
          <div className="page-numbers">
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              // Show pages around current page
              let pageNum = i + 1;
              if (totalPages > 5) {
                if (currentPage > 3 && currentPage < totalPages - 1) {
                  pageNum = currentPage - 2 + i;
                } else if (currentPage >= totalPages - 1) {
                  pageNum = totalPages - 4 + i;
                }
              }
              
              return (
                <button
                  key={pageNum}
                  className={`page-number ${currentPage === pageNum ? 'active' : ''}`}
                  onClick={() => setCurrentPage(pageNum)}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default TableWithSearch;