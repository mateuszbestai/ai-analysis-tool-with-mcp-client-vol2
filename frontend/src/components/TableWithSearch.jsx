import { useState, useEffect } from 'react';
import './Table.css';

const TableWithSearch = ({ headers, rows, tableName }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredRows, setFilteredRows] = useState(rows);
  const [filters, setFilters] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [expandedFilters, setExpandedFilters] = useState(false);

  // Initialize filters based on headers
  useEffect(() => {
    const initialFilters = {};
    headers.forEach(header => {
      initialFilters[header] = { active: false, value: '' };
    });
    setFilters(initialFilters);
  }, [headers]);

  // Apply search and filters when they change
  useEffect(() => {
    let result = [...rows];
    
    // Apply search
    if (searchQuery) {
      const lowercaseQuery = searchQuery.toLowerCase();
      result = result.filter(row => 
        row.some(cell => 
          (cell !== null && cell.toString().toLowerCase().includes(lowercaseQuery))
        )
      );
    }
    
    // Apply column filters
    Object.keys(filters).forEach((columnName, columnIndex) => {
      if (filters[columnName].active && filters[columnName].value) {
        const filterValue = filters[columnName].value.toLowerCase();
        result = result.filter(row => 
          row[columnIndex] !== null && 
          row[columnIndex].toString().toLowerCase().includes(filterValue)
        );
      }
    });
    
    // Apply sorting
    if (sortConfig.key !== null) {
      const columnIndex = headers.indexOf(sortConfig.key);
      result.sort((a, b) => {
        const aValue = a[columnIndex] !== null ? a[columnIndex].toString().toLowerCase() : '';
        const bValue = b[columnIndex] !== null ? b[columnIndex].toString().toLowerCase() : '';
        
        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    
    setFilteredRows(result);
    setCurrentPage(1); // Reset to first page when filters change
  }, [searchQuery, filters, sortConfig, rows]);

  // Handle sorting
  const handleSort = (columnName) => {
    let direction = 'asc';
    if (sortConfig.key === columnName && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key: columnName, direction });
  };

  // Toggle column filter
  const toggleFilter = (columnName) => {
    setFilters({
      ...filters,
      [columnName]: {
        ...filters[columnName],
        active: !filters[columnName].active
      }
    });
  };

  // Update filter value
  const updateFilterValue = (columnName, value) => {
    setFilters({
      ...filters,
      [columnName]: {
        ...filters[columnName],
        value: value
      }
    });
  };

  // Pagination
  const indexOfLastRow = currentPage * rowsPerPage;
  const indexOfFirstRow = indexOfLastRow - rowsPerPage;
  const currentRows = filteredRows.slice(indexOfFirstRow, indexOfLastRow);
  const totalPages = Math.ceil(filteredRows.length / rowsPerPage);

  // Generate unique ID for the table
  const tableId = `table-${tableName.replace(/[^a-zA-Z0-9]/g, '-')}`;

  return (
    <div className="table-with-search">
      <div className="table-header">
        <h3 className="table-title">{tableName}</h3>
        
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
              {filteredRows.length} rows (Page {currentPage} of {totalPages || 1})
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
      {expandedFilters && (
        <div className="column-filters">
          {headers.map((header, index) => (
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
              {headers.map((header, index) => (
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
            </tr>
          </thead>
          <tbody>
            {currentRows.length > 0 ? (
              currentRows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{cell !== null ? cell : ''}</td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={headers.length} className="no-results">
                  No data matching your search criteria
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