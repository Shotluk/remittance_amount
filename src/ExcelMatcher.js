import { useState } from 'react';
import * as XLSX from 'xlsx';

// Header detection functions
const evaluateConsistencyOfFollowingRows = (jsonData, headerRowIndex) => {
  if (!jsonData || headerRowIndex >= jsonData.length - 1) return 0;
  
  const headerRow = jsonData[headerRowIndex];
  const dataRows = jsonData.slice(headerRowIndex + 1, headerRowIndex + Math.min(5, jsonData.length - headerRowIndex - 1));
  
  if (dataRows.length === 0) return 0;
  
  // Check type consistency for each column
  let consistentColumns = 0;
  
  for (let colIndex = 0; colIndex < headerRow.length; colIndex++) {
    // Skip empty header cells
    if (headerRow[colIndex] === null || headerRow[colIndex] === undefined || headerRow[colIndex] === '') {
      continue;
    }
    
    // Check data types in this column
    const types = new Set();
    let validCells = 0;
    
    dataRows.forEach(row => {
      if (colIndex < row.length) {
        const cell = row[colIndex];
        if (cell !== null && cell !== undefined && cell !== '') {
          validCells++;
          
          // Categorize the type
          if (typeof cell === 'number') {
            types.add('number');
          } else if (typeof cell === 'string') {
            // Try to detect dates
            if (cell.match(/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/)) {
              types.add('date');
            }
            // Try to detect numeric strings
            else if (!isNaN(cell)) {
              types.add('numericString');
            } else {
              types.add('string');
            }
          } else if (typeof cell === 'boolean') {
            types.add('boolean');
          }
        }
      }
    });
    
    // If we have valid cells and they're of consistent type, count this column
    if (validCells > 0 && types.size <= 2) {
      consistentColumns++;
    }
  }
  
  // Return ratio of consistent columns
  return headerRow.length > 0 ? consistentColumns / headerRow.length : 0;
};

const findHeaderRow = (jsonData, maxRowsToCheck = 10) => {
  if (!jsonData || jsonData.length === 0) return 0;
  
  const rowScores = [];
  const rowsToCheck = Math.min(maxRowsToCheck, jsonData.length);
  
  // Common header terms to look for
  const commonHeaderTerms = ['id', 'name', 'date', 'number', 'code', 'description', 
    'amount', 'quantity', 'price', 'total', 'address', 'phone', 'email', 'status', 'mobile',
    'patient', 'doctor', 'bill', 'ins', 'file', 'card', 'payer', 'claim', 'sender', 'service',
    'net', 'clinician', 'denial', 'submission', 'remittance', 'billno', 'fileno', 'qty', 'amt'];
  
  for (let rowIndex = 0; rowIndex < rowsToCheck; rowIndex++) {
    const row = jsonData[rowIndex];
    if (!row || row.length === 0) continue;
    
    // 1. Calculate fill rate (percentage of non-empty cells)
    const fillRate = row.filter(cell => 
      cell !== null && cell !== undefined && cell !== ''
    ).length / row.length;
    
    // 2. Check for percentage of text cells vs numeric cells (headers tend to be text)
    const textCellCount = row.filter(cell => 
      typeof cell === 'string' && isNaN(cell.toString().trim())
    ).length;
    const textCellRatio = textCellCount / row.length;
    
    // 3. Look for common header terms
    let headerTermMatches = 0;
    row.forEach(cell => {
      if (typeof cell === 'string') {
        const cellText = cell.toString().toLowerCase();
        commonHeaderTerms.forEach(term => {
          if (cellText.includes(term)) headerTermMatches++;
        });
      }
    });
    const headerTermScore = Math.min(headerTermMatches / row.length, 1);
    
    // 4. Look for "forbidden" words often found in garbage rows
    const forbiddenWords = ['garbage', 'page', 'report', 'generated', 'total', 'summary'];
    const hasForbiddenWords = row.some(cell => 
      typeof cell === 'string' && 
      forbiddenWords.some(word => 
        cell.toString().toLowerCase().includes(word)
      )
    );
    
    // 5. Check for single-cell rows (likely not headers)
    const hasOnlyOneValue = row.filter(cell => 
      cell !== null && cell !== undefined && cell !== ''
    ).length === 1;
    
    // 6. Check for uniqueness - headers usually have unique values
    const uniqueValues = new Set(row.map(cell => cell?.toString()?.toLowerCase()));
    const uniquenessRatio = uniqueValues.size / row.filter(cell => 
      cell !== null && cell !== undefined && cell !== ''
    ).length;
    
    // 7. Check for data consistency in rows following this one
    const consistencyScore = evaluateConsistencyOfFollowingRows(jsonData, rowIndex);
    
    // Calculate final score
    let score = (
      (fillRate * 0.2) + 
      (textCellRatio * 0.25) + 
      (headerTermScore * 0.1) +
      (uniquenessRatio * 0.15) +
      (consistencyScore * 0.3)
    );
    
    // Apply penalties
    if (hasForbiddenWords) score *= 0.3; // Significant penalty
    if (hasOnlyOneValue) score *= 0.2;   // Single-cell rows unlikely to be headers
    
    rowScores.push({ rowIndex, score });
    
    // Uncomment for debugging
    // console.log(`Row ${rowIndex} score: ${score.toFixed(3)} (fill: ${fillRate.toFixed(2)}, text: ${textCellRatio.toFixed(2)}, terms: ${headerTermScore.toFixed(2)}, uniq: ${uniquenessRatio.toFixed(2)}, consist: ${consistencyScore.toFixed(2)})`);
  }
  
  // Select row with highest score
  rowScores.sort((a, b) => b.score - a.score);
  
  // If the best score is really low, default to first row
  if (rowScores.length > 0 && rowScores[0].score < 0.2) {
    return 0;
  }
  
  return rowScores.length > 0 ? rowScores[0].rowIndex : 0;
};

export default function ExcelMatcher() {
  const [remittanceFile, setRemittanceFile] = useState(null);
  const [submissionFile, setSubmissionFile] = useState(null);
  const [matchedData, setMatchedData] = useState(null);
  const [unmatchedData, setUnmatchedData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [debugInfo, setDebugInfo] = useState('');

  const handleRemittanceUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setRemittanceFile(file);
      setStatus(`Remittance file "${file.name}" selected`);
    }
  };

  const handleSubmissionUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSubmissionFile(file);
      setStatus(`Submission file "${file.name}" selected`);
    }
  };

  const processFiles = async () => {
    if (!remittanceFile || !submissionFile) {
      setError('Please upload both files');
      return;
    }

    setLoading(true);
    setError('');
    setStatus('Processing files...');
    setDebugInfo('');

    try {
      // Read remittance file
      const remittanceData = await readExcelFile(remittanceFile);
      setStatus('Remittance file processed. Processing submission file...');
      
      // Read submission file
      const submissionData = await readExcelFile(submissionFile);
      setStatus('Both files processed. Matching IDs...');
      
      // Log some debug info
      setDebugInfo(prev => prev + `Remittance data: ${remittanceData.length} rows\n`);
      setDebugInfo(prev => prev + `Submission data: ${submissionData.length} rows\n`);
      
      // Find headers
      const remittanceHeaders = Object.keys(remittanceData[0]);
      const submissionHeaders = Object.keys(submissionData[0]);
      
      setDebugInfo(prev => prev + `Remittance headers: ${remittanceHeaders.join(', ')}\n`);
      setDebugInfo(prev => prev + `Submission headers: ${submissionHeaders.join(', ')}\n`);
      
      // Identify the amount column in remittance file
      const amtFieldName = remittanceHeaders.find(header => 
        header.toLowerCase() === 'amt' || 
        header.toLowerCase() === 'amount' || 
        header.toLowerCase().includes('amount')
      );
      
      setDebugInfo(prev => prev + `Amount field in remittance file: ${amtFieldName}\n`);
      
      // Identify ID columns - adjusting for amount field
      const remittanceIdField = remittanceHeaders.find(header => 
        header.toLowerCase() === 'id' || 
        header.toLowerCase() === 'billno'
      ) || remittanceHeaders[0];
      
      const submissionIdField = submissionHeaders.find(header => 
        header.toLowerCase().includes('claim') || 
        header.toLowerCase() === 'id'
      ) || 'Claim ID'; 
      
      setDebugInfo(prev => prev + `Using remittance ID field: ${remittanceIdField}\n`);
      setDebugInfo(prev => prev + `Using submission ID field: ${submissionIdField}\n`);
      
      setStatus(`Matching "${submissionIdField}" from submission file with "${remittanceIdField}" from remittance file...`);

      // Count occurrences of each ID in remittance file
      const remittanceIdCounts = {};
      remittanceData.forEach(row => {
        const id = row[remittanceIdField];
        remittanceIdCounts[id] = (remittanceIdCounts[id] || 0) + 1;
      });
      
      // Create a mapping of remittance amounts by ID
      const remittanceAmountsByID = {};
      remittanceData.forEach(row => {
        const id = row[remittanceIdField];
        let amount = 0;
        
        if (amtFieldName) {
          const rawAmt = row[amtFieldName];
          // Handle different formats of amount (string, number, etc.)
          if (typeof rawAmt === 'number') {
            amount = rawAmt;
          } else if (typeof rawAmt === 'string') {
            // Remove any non-numeric characters except decimal point
            const cleanedAmt = rawAmt.replace(/[^\d.-]/g, '');
            amount = parseFloat(cleanedAmt) || 0;
          }
        }
        
        if (!remittanceAmountsByID[id]) {
          remittanceAmountsByID[id] = [];
        }
        remittanceAmountsByID[id].push(amount);
      });
      
      // Calculate sum for each ID
      const remittanceAmtSumByID = {};
      Object.keys(remittanceAmountsByID).forEach(id => {
        const amounts = remittanceAmountsByID[id];
        const sum = amounts.reduce((total, amt) => total + amt, 0);
        remittanceAmtSumByID[id] = sum;
      });

      // Extract IDs from remittance file
      const remittanceIds = new Set(remittanceData.map(row => row[remittanceIdField]));
      setDebugInfo(prev => prev + `Unique IDs in remittance file: ${remittanceIds.size}\n`);

      // Find matching and unmatched rows in submission file
      const matchedRows = [];
      const unmatchedRows = [];
      
      submissionData.forEach(row => {
        if (remittanceIds.has(row[submissionIdField])) {
          matchedRows.push(row);
        } else {
          unmatchedRows.push(row);
        }
      });
      
      setDebugInfo(prev => prev + `Matched rows count: ${matchedRows.length}\n`);
      setDebugInfo(prev => prev + `Unmatched rows count: ${unmatchedRows.length}\n`);

      // Add the Remit Amt column to each matched row with the sum from remittance file
      const enhancedMatchedRows = matchedRows.map(row => {
        // Create a new object with all existing properties
        const newRow = { ...row };
        
        // Find the index of the "Amt" column
        const headers = Object.keys(newRow);
        const amtIndex = headers.findIndex(header => header.toLowerCase() === 'amt');
        
        // Get the ID for this row
        const rowID = row[submissionIdField];
        
        // Get the sum of amounts for this ID from remittance file
        const remitAmtSum = remittanceAmtSumByID[rowID] || 0;
        
        // Create a new object with the Remit Amt column inserted after Amt
        const result = {};
        headers.forEach((header, index) => {
          result[header] = newRow[header];
          
          // After the Amt column, add the Remit Amt column with the calculated sum
          if (index === amtIndex) {
            result['Remit Amt'] = remitAmtSum;
          }
        });
        
        return result;
      });

      setStatus(`Found ${enhancedMatchedRows.length} matching rows and ${unmatchedRows.length} unmatched rows out of ${submissionData.length} total submission rows.`);
      setMatchedData(enhancedMatchedRows);
      setUnmatchedData(unmatchedRows);
    } catch (err) {
      console.error('Error processing files:', err);
      setError(`Error processing files: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const readExcelFile = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          
          // First read to get the cell types and formats
          const workbook = XLSX.read(data, { 
            type: 'array',
            cellDates: true,  // Parse dates as Date objects to identify them
            cellNF: true,     // Keep number formats
            cellStyles: true  // Keep cell styles
          });
          
          // Get first sheet
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          
          // Get raw data for header detection
          const rawData = XLSX.utils.sheet_to_json(worksheet, { 
            header: 1,
            defval: ''
          });
          
          // Use advanced header detection to find the most likely header row
          const headerRowIndex = findHeaderRow(rawData);
          setDebugInfo(prev => prev + `Detected header row at index ${headerRowIndex} for ${file.name}\n`);
          
          // Process the sheet manually to handle dates properly
          const range = XLSX.utils.decode_range(worksheet['!ref']);
          const headers = [];
          const dateColumns = [];
          const finalData = [];
          
          // Find all date columns by checking cell types in the first data row after headers
          for (let C = range.s.c; C <= range.e.c; ++C) {
            const headerCellRef = XLSX.utils.encode_cell({ r: headerRowIndex, c: C });
            
            if (headerCellRef && worksheet[headerCellRef]) {
              headers[C] = worksheet[headerCellRef].v;
            }
            
            // Check next row for dates
            const dataCellRef = XLSX.utils.encode_cell({ r: headerRowIndex + 1, c: C });
            if (worksheet[dataCellRef] && worksheet[dataCellRef].t === 'd') {
              dateColumns.push(C);
            }
          }
          
          // Create objects with properly formatted dates - start from the row after headers
          for (let R = headerRowIndex + 1; R <= range.e.r; ++R) {
            const row = {};
            
            // Skip entirely empty rows
            let isEmpty = true;
            
            for (let C = range.s.c; C <= range.e.c; ++C) {
              const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
              const headerRef = XLSX.utils.encode_cell({ r: headerRowIndex, c: C });
              
              if (!worksheet[headerRef]) continue;
              
              const header = worksheet[headerRef].v;
              
              if (worksheet[cellRef]) {
                isEmpty = false;
                const cell = worksheet[cellRef];
                
                // Format dates specially
                if (dateColumns.includes(C) && cell.t === 'd') {
                  const date = cell.v;
                  const day = String(date.getDate()).padStart(2, '0');
                  const month = String(date.getMonth() + 1).padStart(2, '0');
                  const year = date.getFullYear();
                  
                  let timeStr = '';
                  if (date.getHours() || date.getMinutes() || date.getSeconds()) {
                    const hours = String(date.getHours()).padStart(2, '0');
                    const minutes = String(date.getMinutes()).padStart(2, '0');
                    const seconds = String(date.getSeconds()).padStart(2, '0');
                    const ampm = date.getHours() >= 12 ? 'PM' : 'AM';
                    const hours12 = date.getHours() % 12 || 12;
                    timeStr = `  ${hours12}:${minutes}:${seconds} ${ampm}`;
                  }
                  
                  row[header] = `${day}/${month}/${year}${timeStr}`;
                } else {
                  row[header] = cell.v;
                }
              } else {
                row[header] = '';
              }
            }
            
            if (!isEmpty) {
              finalData.push(row);
            }
          }
          
          resolve(finalData);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = (error) => reject(error);
      reader.readAsArrayBuffer(file);
    });
  };

  const downloadExcelFile = (data, filename, sheetName) => {
    if (!data || data.length === 0) {
      setError(`No ${sheetName} data to download`);
      return;
    }

    try {
      // Create workbook and worksheet
      const workbook = XLSX.utils.book_new();
      
      // Get headers
      const headers = Object.keys(data[0]);
      
      // Create worksheet from the data
      const worksheet = XLSX.utils.json_to_sheet(data, {
        header: headers,
        skipHeader: false
      });
      
      // Make header row bold
      const headerRange = XLSX.utils.decode_range(worksheet['!ref']);
      for (let C = headerRange.s.c; C <= headerRange.e.c; ++C) {
        const cell = XLSX.utils.encode_cell({ r: 0, c: C });
        if (!worksheet[cell]) continue;
        worksheet[cell].s = { font: { bold: true } };
      }
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      
      // Write file with options to preserve formatting
      XLSX.writeFile(workbook, filename, { 
        bookType: 'xlsx',
        bookSST: false,
        type: 'binary',
        cellStyles: true
      });
      
      setStatus(`${sheetName} downloaded successfully!`);
    } catch (error) {
      console.error(`Error creating Excel file for ${sheetName}:`, error);
      setError(`Error creating Excel file for ${sheetName}: ${error.message}`);
    }
  };

  const downloadMatchedData = () => {
    downloadExcelFile(matchedData, 'matched_records.xlsx', 'Matched Records');
  };
  
  const downloadUnmatchedData = () => {
    downloadExcelFile(unmatchedData, 'unmatched_records.xlsx', 'Unmatched Records');
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-bold text-center mb-6 text-blue-700">Excel ID Matcher</h1>
        
        <p className="mb-6 text-gray-600 text-center">
          Upload your Remittance and Submission reports to match IDs and download the results
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Remittance File Upload */}
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 hover:border-blue-500 transition-colors">
            <h2 className="text-lg font-semibold mb-2">Remittance Report</h2>
            <p className="text-sm text-gray-500 mb-4">Upload the Excel file containing the remittance details</p>
            
            <div className="flex flex-col items-center justify-center">
              <label className="flex flex-col items-center justify-center w-full cursor-pointer">
                <div className="flex flex-col items-center justify-center">
                  <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                  </svg>
                  <p className="mt-2 text-sm text-gray-500">Click to select file</p>
                </div>
                <input 
                  type="file" 
                  className="hidden" 
                  accept=".xlsx, .xls" 
                  onChange={handleRemittanceUpload} 
                />
              </label>
              {remittanceFile && (
                <p className="mt-2 text-xs text-green-600 truncate max-w-full">
                  Selected: {remittanceFile.name}
                </p>
              )}
            </div>
          </div>
          
          {/* Submission File Upload */}
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 hover:border-blue-500 transition-colors">
            <h2 className="text-lg font-semibold mb-2">Submission Report</h2>
            <p className="text-sm text-gray-500 mb-4">Upload the Excel file containing the submission details</p>
            
            <div className="flex flex-col items-center justify-center">
              <label className="flex flex-col items-center justify-center w-full cursor-pointer">
                <div className="flex flex-col items-center justify-center">
                  <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                  </svg>
                  <p className="mt-2 text-sm text-gray-500">Click to select file</p>
                </div>
                <input 
                  type="file" 
                  className="hidden" 
                  accept=".xlsx, .xls" 
                  onChange={handleSubmissionUpload} 
                />
              </label>
              {submissionFile && (
                <p className="mt-2 text-xs text-green-600 truncate max-w-full">
                  Selected: {submissionFile.name}
                </p>
              )}
            </div>
          </div>
        </div>
        
        {/* Process Button */}
        <div className="flex justify-center mb-6">
          <button
            onClick={processFiles}
            disabled={!remittanceFile || !submissionFile || loading}
            className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Processing...' : 'Match Files'}
          </button>
        </div>
        
        {/* Status and Error Messages */}
        {status && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-blue-800">{status}</p>
          </div>
        )}
        
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-800">{error}</p>
          </div>
        )}
        
        {/* Debug Information (Hidden in Production) */}
        {debugInfo && (
          <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-md">
            <details>
              <summary className="cursor-pointer font-medium text-gray-700">Show Processing Details</summary>
              <pre className="mt-2 text-xs text-gray-600 whitespace-pre-wrap overflow-auto max-h-40">
                {debugInfo}
              </pre>
            </details>
          </div>
        )}
        
        {/* Results Tabs */}
        {(matchedData || unmatchedData) && (
          <div className="mt-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Results</h2>
              <div className="space-x-2">
                <button
                  onClick={downloadMatchedData}
                  disabled={!matchedData || matchedData.length === 0}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  Download Matched
                </button>
                <button
                  onClick={downloadUnmatchedData}
                  disabled={!unmatchedData || unmatchedData.length === 0}
                  className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  Download Unmatched
                </button>
              </div>
            </div>
            
            {/* Display Matched Results */}
            {matchedData && matchedData.length > 0 && (
              <div className="mb-8">
                <h3 className="text-lg font-semibold mb-3">Matched Records ({matchedData.length})</h3>
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        {Object.keys(matchedData[0]).map((header, index) => (
                          <th 
                            key={index} 
                            className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {matchedData.slice(0, 5).map((row, rowIndex) => (
                        <tr key={rowIndex}>
                          {Object.values(row).map((value, cellIndex) => (
                            <td key={cellIndex} className="px-4 py-2 text-sm text-gray-500 truncate max-w-xs">
                              {value !== null && value !== undefined ? value.toString() : ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  {matchedData.length > 5 && (
                    <div className="px-4 py-2 bg-gray-50 text-sm text-gray-500 text-center">
                      Showing 5 of {matchedData.length} results. Download the Excel file to view all matched records.
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Display Unmatched Results */}
            {unmatchedData && unmatchedData.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-3">Unmatched Records ({unmatchedData.length})</h3>
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        {Object.keys(unmatchedData[0]).map((header, index) => (
                          <th 
                            key={index} 
                            className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {unmatchedData.slice(0, 5).map((row, rowIndex) => (
                        <tr key={rowIndex}>
                           {Object.values(row).map((value, cellIndex) => (
                            <td key={cellIndex} className="px-4 py-2 text-sm text-gray-500 truncate max-w-xs">
                              {value !== null && value !== undefined ? value.toString() : ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  {unmatchedData.length > 5 && (
                    <div className="px-4 py-2 bg-gray-50 text-sm text-gray-500 text-center">
                      Showing 5 of {unmatchedData.length} results. Download the Excel file to view all unmatched records.
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* No Results Message */}
            {(!matchedData || matchedData.length === 0) && (!unmatchedData || unmatchedData.length === 0) && (
              <div className="mt-8 p-4 border border-yellow-200 bg-yellow-50 rounded-md">
                <p className="text-yellow-700">No records found for the provided files.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}