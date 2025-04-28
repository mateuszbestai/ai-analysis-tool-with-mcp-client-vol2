import "./App.css";
import { useState, useRef, useEffect } from "react";
import Navbar from "./components/Navbar";
import Chatbox from "./components/Chatbox";
import Sidebar from "./components/Sidebar";
import ReportGenerator from "./components/ReportGenerator";
import TableWithSearch from "./components/TableWithSearch";
import DatabaseConnectionManager from "./components/DatabaseConnectionManager";

function App() {
  const [reportOpen, setReportOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [darkMode, setDarkMode] = useState(false);

  // Handle message updates from Chatbox
  const updateMessages = (newMessages) => {
    setMessages(newMessages);
  };

  // Listen for create-report events
  useEffect(() => {
    const handleCreateReport = () => {
      setReportOpen(true);
    };
    
    document.addEventListener('createReport', handleCreateReport);
    
    return () => {
      document.removeEventListener('createReport', handleCreateReport);
    };
  }, []);

  // Toggle dark mode
  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    if (!darkMode) {
      document.body.classList.add('darkmode');
    } else {
      document.body.classList.remove('darkmode');
    }
  };

  // Apply preview table enhancement
  useEffect(() => {
    // This will enhance any tables created after this component loads
    const enhanceExistingTables = () => {
      // Find all tables in the chat area that don't have search functionality
      const tables = document.querySelectorAll('.chat-area .chat-table:not(.enhanced)');
      
      tables.forEach(table => {
        const headers = [];
        const rows = [];
        
        // Get table headers
        table.querySelectorAll('thead th').forEach(th => {
          headers.push(th.textContent);
        });
        
        // Get table rows
        table.querySelectorAll('tbody tr').forEach(tr => {
          const rowData = [];
          tr.querySelectorAll('td').forEach(td => {
            rowData.push(td.textContent);
          });
          rows.push(rowData);
        });
        
        if (headers.length > 0 && rows.length > 0) {
          // Create an enhanced table with search
          const tableName = table.closest('.preview-container')?.querySelector('.preview-title')?.textContent || 'Data Table';
          
          // Create container for the enhanced table
          const enhancedContainer = document.createElement('div');
          enhancedContainer.className = 'enhanced-table-container';
          
          // Render the enhanced table
          const tableWithSearch = document.createElement('div');
          tableWithSearch.className = 'table-with-search';
          enhancedContainer.appendChild(tableWithSearch);
          
          // Replace the original table with the enhanced container
          const tableParent = table.parentNode;
          tableParent.appendChild(enhancedContainer);
          
          // Mark table as enhanced
          table.classList.add('enhanced');
          table.style.display = 'none';
          
          // Initialize the TableWithSearch component
          // Note: This is a simplified version since we can't directly render React components here
          // In a real implementation, you'd use ReactDOM.render or a proper React approach
          const searchContainer = document.createElement('div');
          searchContainer.className = 'table-toolbar';
          
          const searchInput = document.createElement('input');
          searchInput.type = 'text';
          searchInput.className = 'search-input';
          searchInput.placeholder = 'Search in table...';
          
          searchContainer.appendChild(searchInput);
          tableWithSearch.appendChild(searchContainer);
          
          // Create table container
          const tableContainer = document.createElement('div');
          tableContainer.className = 'table-container';
          tableWithSearch.appendChild(tableContainer);
          
          // Clone the original table for the enhanced version
          const enhancedTable = table.cloneNode(true);
          enhancedTable.classList.add('enhanced-table');
          tableContainer.appendChild(enhancedTable);
          
          // Add search functionality
          searchInput.addEventListener('input', function(e) {
            const searchValue = e.target.value.toLowerCase();
            
            enhancedTable.querySelectorAll('tbody tr').forEach(row => {
              const rowText = Array.from(row.querySelectorAll('td'))
                .map(cell => cell.textContent.toLowerCase())
                .join(' ');
              
              if (rowText.includes(searchValue)) {
                row.style.display = '';
              } else {
                row.style.display = 'none';
              }
            });
          });
        }
      });
    };
    
    // Run on load
    enhanceExistingTables();
    
    // Set up mutation observer to detect new tables
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        if (mutation.addedNodes.length) {
          enhanceExistingTables();
        }
      });
    });
    
    observer.observe(document.querySelector('.chat-area'), { 
      childList: true, 
      subtree: true 
    });
    
    return () => observer.disconnect();
  }, []);

  return (
    <div className="app-container">
      {/* Navbar */}
      <Navbar darkMode={darkMode} toggleDarkMode={toggleDarkMode} />

      {/* Main Content */}
      <div className="content-container">
        {/* Sidebar */}
        <Sidebar />

        {/* Chat Area */}
        <div className="chat-area" id="chatArea">
          <Chatbox updateMessages={updateMessages} />
        </div>
      </div>
      
      {/* Report Generator Modal */}
      {reportOpen && (
        <ReportGenerator 
          setIsOpen={setReportOpen} 
          messages={messages} 
        />
      )}
    </div>
  );
}

export default App;