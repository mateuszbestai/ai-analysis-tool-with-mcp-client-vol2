import { useState, useEffect, useRef } from 'react';
import './ReportGenerator.css';

const ReportGenerator = ({ setIsOpen, messages }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportTitle, setReportTitle] = useState('Data Analysis Report');
  const [reportDescription, setReportDescription] = useState('');
  const [includeAllMessages, setIncludeAllMessages] = useState(true);
  const [selectedMessages, setSelectedMessages] = useState([]);
  const [aiSummary, setAiSummary] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const reportRef = useRef(null);

  useEffect(() => {
    // Set selected messages when includeAllMessages changes
    if (includeAllMessages) {
      setSelectedMessages(messages.map((_, index) => index));
    } else {
      setSelectedMessages([]);
    }
  }, [includeAllMessages, messages]);

  // Generate AI summary based on messages
  const generateAiSummary = async () => {
    setAiGenerating(true);
    
    try {
      // Extract content from selected messages
      const selectedContent = selectedMessages.map(index => {
        const message = messages[index];
        return {
          type: message.messageType,
          content: message.content
        };
      });
      
      // Make API request to get AI-generated summary
      const response = await fetch('/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          question: `Please create a professional executive summary of this conversation. Focus on key insights, findings, and conclusions from the data analysis. Format the summary with clear sections and bullet points where appropriate. The summary will be used in a report: ${JSON.stringify(selectedContent)}`
        })
      });
      
      const data = await response.json();
      
      if (data.answer) {
        setAiSummary(data.answer);
      } else {
        setAiSummary('Could not generate summary. Please try again or write your own summary.');
      }
    } catch (error) {
      console.error('Error generating AI summary:', error);
      setAiSummary('Error generating summary. Please try again or write your own summary.');
    } finally {
      setAiGenerating(false);
    }
  };

  // Toggle message selection
  const toggleMessageSelection = (index) => {
    if (selectedMessages.includes(index)) {
      setSelectedMessages(selectedMessages.filter(i => i !== index));
    } else {
      setSelectedMessages([...selectedMessages, index]);
    }
  };

  // Export to PDF (using print functionality)
  const exportToPdf = () => {
    setIsGenerating(true);
    
    try {
      const reportElement = reportRef.current;
      
      if (!reportElement) {
        alert('Report content not found');
        setIsGenerating(false);
        return;
      }
      
      // Create a new window for printing
      const printWindow = window.open('', '_blank');
      
      if (!printWindow) {
        alert('Please allow pop-ups to export the report');
        setIsGenerating(false);
        return;
      }
      
      // Create print-friendly HTML
      const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>${reportTitle}</title>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              margin: 20px;
            }
            .report-header {
              text-align: center;
              margin-bottom: 30px;
              border-bottom: 2px solid #273c75;
              padding-bottom: 20px;
            }
            h1 {
              color: #273c75;
              margin: 0 0 10px 0;
            }
            .report-date {
              color: #666;
              font-style: italic;
            }
            .report-description {
              margin: 20px 0;
              font-style: italic;
              color: #555;
            }
            .report-summary {
              background-color: #f7f9fc;
              padding: 20px;
              border-left: 4px solid #273c75;
              margin-bottom: 30px;
            }
            .report-summary h2 {
              color: #273c75;
              margin-top: 0;
            }
            .report-content {
              margin-bottom: 30px;
            }
            .message {
              margin-bottom: 20px;
              padding: 15px;
              border-radius: 8px;
              page-break-inside: avoid;
            }
            .user-message {
              background-color: #e7f3ff;
              border-left: 4px solid #2196F3;
            }
            .bot-message {
              background-color: #f1f1f1;
              border-left: 4px solid #666;
            }
            .message-content {
              white-space: pre-wrap;
            }
            .message-image {
              max-width: 100%;
              margin-top: 15px;
              page-break-inside: avoid;
            }
            .message-image img {
              max-width: 100%;
              border: 1px solid #ddd;
            }
            table {
              border-collapse: collapse;
              width: 100%;
              margin: 15px 0;
              page-break-inside: avoid;
            }
            table, th, td {
              border: 1px solid #ddd;
            }
            th, td {
              padding: 8px;
              text-align: left;
            }
            th {
              background-color: #f2f2f2;
            }
            tr:nth-child(even) {
              background-color: #f9f9f9;
            }
            .report-footer {
              margin-top: 50px;
              text-align: center;
              font-size: 14px;
              color: #666;
              border-top: 1px solid #ddd;
              padding-top: 20px;
            }
            @media print {
              body { margin: 0 }
              .page-break { page-break-before: always; }
            }
          </style>
        </head>
        <body>
          ${reportElement.innerHTML}
          <script>
            setTimeout(() => {
              window.print();
              // Close after printing
              window.addEventListener('afterprint', function() {
                window.close();
              });
            }, 1000);
          </script>
        </body>
        </html>
      `;
      
      printWindow.document.open();
      printWindow.document.write(printContent);
      printWindow.document.close();
      
    } catch (error) {
      console.error('Error exporting to PDF:', error);
      alert('Failed to export report. Please try again.');
    }
    
    setIsGenerating(false);
  };

  // Export to HTML
  const exportToHtml = () => {
    setIsGenerating(true);
    
    try {
      const reportElement = reportRef.current;
      
      if (!reportElement) {
        alert('Report content not found');
        setIsGenerating(false);
        return;
      }
      
      // Create a new HTML document
      const reportHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>${reportTitle}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              max-width: 900px;
              margin: 0 auto;
              padding: 20px;
              color: #333;
            }
            .report-header {
              text-align: center;
              margin-bottom: 30px;
              border-bottom: 2px solid #273c75;
              padding-bottom: 20px;
            }
            h1 {
              color: #273c75;
              margin: 0 0 10px 0;
            }
            .report-date {
              color: #666;
              font-style: italic;
            }
            .report-description {
              margin: 20px 0;
              font-style: italic;
              color: #555;
            }
            .report-summary {
              background-color: #f7f9fc;
              padding: 20px;
              border-left: 4px solid #273c75;
              margin-bottom: 30px;
            }
            .report-summary h2 {
              color: #273c75;
              margin-top: 0;
            }
            .report-content {
              margin-bottom: 30px;
            }
            .message {
              margin-bottom: 20px;
              padding: 15px;
              border-radius: 8px;
            }
            .user-message {
              background-color: #e7f3ff;
              border-left: 4px solid #2196F3;
            }
            .bot-message {
              background-color: #f1f1f1;
              border-left: 4px solid #666;
            }
            .message-content {
              white-space: pre-wrap;
            }
            .message-image {
              max-width: 100%;
              margin-top: 15px;
            }
            .message-image img {
              max-width: 100%;
              border: 1px solid #ddd;
            }
            table {
              border-collapse: collapse;
              width: 100%;
              margin: 15px 0;
            }
            table, th, td {
              border: 1px solid #ddd;
            }
            th, td {
              padding: 8px;
              text-align: left;
            }
            th {
              background-color: #f2f2f2;
            }
            tr:nth-child(even) {
              background-color: #f9f9f9;
            }
            .report-footer {
              margin-top: 50px;
              text-align: center;
              font-size: 14px;
              color: #666;
              border-top: 1px solid #ddd;
              padding-top: 20px;
            }
          </style>
        </head>
        <body>
          ${reportElement.outerHTML}
        </body>
        </html>
      `;
      
      // Create a Blob and download link
      const blob = new Blob([reportHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${reportTitle.replace(/\s+/g, '_')}.html`;
      link.click();
      
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting to HTML:', error);
      alert('Failed to export report to HTML. Please try again.');
    }
    
    setIsGenerating(false);
  };

  return (
    <div className="report-modal">
      <div className="report-modal-content">
        <div className="report-modal-header">
          <h2>Generate Data Analysis Report</h2>
          <button className="close-button" onClick={() => setIsOpen(false)}>×</button>
        </div>
        
        <div className="report-modal-body">
          <div className="report-config">
            <div className="form-group">
              <label htmlFor="reportTitle">Report Title</label>
              <input
                type="text"
                id="reportTitle"
                value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)}
                placeholder="Enter report title"
                className="form-control"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="reportDescription">Report Description</label>
              <textarea
                id="reportDescription"
                value={reportDescription}
                onChange={(e) => setReportDescription(e.target.value)}
                placeholder="Enter optional description"
                className="form-control"
                rows={3}
              ></textarea>
            </div>
            
            <div className="form-group">
              <div className="checkbox-control">
                <input
                  type="checkbox"
                  id="includeAllMessages"
                  checked={includeAllMessages}
                  onChange={() => setIncludeAllMessages(!includeAllMessages)}
                />
                <label htmlFor="includeAllMessages">Include all messages</label>
              </div>
            </div>
            
            {!includeAllMessages && (
              <div className="message-selector">
                <h4>Select messages to include</h4>
                <div className="message-list">
                  {messages.map((message, index) => (
                    <div className="message-select-item" key={index}>
                      <div className="checkbox-control">
                        <input
                          type="checkbox"
                          id={`message-${index}`}
                          checked={selectedMessages.includes(index)}
                          onChange={() => toggleMessageSelection(index)}
                        />
                        <label htmlFor={`message-${index}`}>
                          <span className={`message-type ${message.messageType}`}>
                            {message.messageType === 'user' ? 'You' : 'Assistant'}:
                          </span>
                          <span className="message-preview">
                            {message.content.length > 60 
                              ? `${message.content.substring(0, 60)}...` 
                              : message.content}
                          </span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="form-group">
              <div className="ai-summary-container">
                <div className="ai-summary-header">
                  <h4>AI-Generated Executive Summary</h4>
                  <button 
                    className="btn-primary" 
                    onClick={generateAiSummary}
                    disabled={aiGenerating || selectedMessages.length === 0}
                  >
                    {aiGenerating ? 'Generating...' : 'Generate Summary'}
                  </button>
                </div>
                
                <textarea
                  value={aiSummary}
                  onChange={(e) => setAiSummary(e.target.value)}
                  placeholder="AI will generate a summary based on the selected messages, or you can write your own."
                  className="form-control"
                  rows={6}
                ></textarea>
              </div>
            </div>
            
            <div className="export-options">
              <button 
                className="btn-primary"
                onClick={exportToPdf}
                disabled={isGenerating}
              >
                {isGenerating ? 'Preparing Print View...' : 'Print Report'}
              </button>
              <button 
                className="btn-secondary"
                onClick={exportToHtml}
                disabled={isGenerating}
              >
                {isGenerating ? 'Generating HTML...' : 'Export as HTML'}
              </button>
            </div>
          </div>
          
          <div className="report-preview">
            <h3>Report Preview</h3>
            <div className="report-preview-container">
              <div id="reportContent" ref={reportRef} className="report-content">
                <div className="report-header">
                  <h1>{reportTitle}</h1>
                  <div className="report-date">
                    Generated on {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}
                  </div>
                  {reportDescription && (
                    <div className="report-description">{reportDescription}</div>
                  )}
                </div>
                
                {aiSummary && (
                  <div className="report-summary">
                    <h2>Executive Summary</h2>
                    <div dangerouslySetInnerHTML={{ __html: aiSummary.replace(/\n/g, '<br>') }}></div>
                  </div>
                )}
                
                <div className="report-messages">
                  <h2>Conversation Details</h2>
                  {selectedMessages.length > 0 ? (
                    selectedMessages.sort((a, b) => a - b).map(index => {
                      const message = messages[index];
                      return (
                        <div 
                          key={index} 
                          className={`message ${message.messageType === 'user' ? 'user-message' : 'bot-message'}`}
                        >
                          <div className="message-header">
                            <strong>{message.messageType === 'user' ? 'You' : 'Assistant'}</strong>
                            <span className="message-time">{message.timestamp}</span>
                          </div>
                          <div className="message-content" dangerouslySetInnerHTML={{ __html: message.content.replace(/\n/g, '<br>') }}></div>
                          
                          {message.image && (
                            <div className="message-image">
                              <img 
                                src={`${message.image}.png`}
                                alt="Data visualization"
                              />
                            </div>
                          )}
                          
                          {message.table && (
                            <div className="message-table">
                              <table className="data-table">
                                <thead>
                                  <tr>
                                    {message.table.headers.map((header, i) => (
                                      <th key={i}>{header}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {message.table.rows.map((row, rowIndex) => (
                                    <tr key={rowIndex}>
                                      {row.map((cell, cellIndex) => (
                                        <td key={cellIndex}>{cell !== null ? cell : ''}</td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="no-messages">No messages selected to include in the report.</div>
                  )}
                </div>
                
                <div className="report-footer">
                  <p>This report was generated with Data Analyzer</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportGenerator;