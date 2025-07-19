// Header detection functions
export const evaluateConsistencyOfFollowingRows = (jsonData, headerRowIndex) => {
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

export const findHeaderRow = (jsonData, maxRowsToCheck = 10) => {
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