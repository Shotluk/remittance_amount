import { useState } from 'react';
import { readExcelFile, downloadExcelFile } from './excelUtils';
import { 
  processMatchedData, 
  createRemittanceMapping, 
  findMatchingRecords, 
  identifyColumns 
} from './dataProcessor';

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
      const remittanceData = await readExcelFile(remittanceFile, setDebugInfo);
      setStatus('Remittance file processed. Processing submission file...');
      
      // Read submission file
      const submissionData = await readExcelFile(submissionFile, setDebugInfo);
      setStatus('Both files processed. Matching IDs...');
      
      // Log some debug info
      setDebugInfo(prev => prev + `Remittance data: ${remittanceData.length} rows\n`);
      setDebugInfo(prev => prev + `Submission data: ${submissionData.length} rows\n`);
      
      // Find headers
      const remittanceHeaders = Object.keys(remittanceData[0]);
      const submissionHeaders = Object.keys(submissionData[0]);
      
      setDebugInfo(prev => prev + `Remittance headers: ${remittanceHeaders.join(', ')}\n`);
      setDebugInfo(prev => prev + `Submission headers: ${submissionHeaders.join(', ')}\n`);
      
      // Identify columns
      const { amtFieldName, idField: remittanceIdField } = identifyColumns(remittanceHeaders, 'remittance');
      const { idField: submissionIdField } = identifyColumns(submissionHeaders, 'submission');
      
      setDebugInfo(prev => prev + `Amount field in remittance file: ${amtFieldName}\n`);
      setDebugInfo(prev => prev + `Using remittance ID field: ${remittanceIdField}\n`);
      setDebugInfo(prev => prev + `Using submission ID field: ${submissionIdField}\n`);
      
      setStatus(`Matching "${submissionIdField}" from submission file with "${remittanceIdField}" from remittance file...`);

      // Create remittance mapping
      const { remittanceAmtSumByID } = createRemittanceMapping(
        remittanceData, 
        remittanceIdField, 
        amtFieldName
      );

      // Extract IDs from remittance file
      const remittanceIds = new Set(remittanceData.map(row => row[remittanceIdField]));
      setDebugInfo(prev => prev + `Unique IDs in remittance file: ${remittanceIds.size}\n`);

      // Find matching and unmatched rows in submission file
      const { matchedRows, unmatchedRows } = findMatchingRecords(
        submissionData, 
        remittanceIds, 
        submissionIdField
      );
      
      setDebugInfo(prev => prev + `Matched rows count: ${matchedRows.length}\n`);
      setDebugInfo(prev => prev + `Unmatched rows count: ${unmatchedRows.length}\n`);

      // Process matched data to add Remit Amt and Rejected Amount columns
      const enhancedMatchedRows = processMatchedData(
        matchedRows, 
        submissionIdField, 
        remittanceAmtSumByID
      );

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

  const downloadMatchedData = () => {
    downloadExcelFile(matchedData, 'matched_records.xlsx', 'Matched Records', setStatus, setError);
  };
  
  const downloadUnmatchedData = () => {
    downloadExcelFile(unmatchedData, 'unmatched_records.xlsx', 'Unmatched Records', setStatus, setError);
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
                          {Object.entries(row).map(([header, value], cellIndex) => (
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