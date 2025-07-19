export const processMatchedData = (
  matchedRows, 
  submissionIdField, 
  remittanceAmtSumByID
) => {
  return matchedRows.map(row => {
    // Create a new object with all existing properties
    const newRow = { ...row };
    
    // Find the index of the "Amt" column
    const headers = Object.keys(newRow);
    const amtIndex = headers.findIndex(header => header.toLowerCase() === 'amt');
    
    // Get the ID for this row
    const rowID = row[submissionIdField];
    
    // Get the sum of amounts for this ID from remittance file
    const remitAmtSum = remittanceAmtSumByID[rowID] || 0;
    
    // Get the original amount for calculation
    const originalAmt = parseFloat(row['Amt']) || 0;
    
    // Calculate rejected amount (Amt - Remit Amt) and round to avoid floating point precision issues
    const rejectedAmount = Math.round((originalAmt - remitAmtSum) * 100) / 100;
    
    // Create a new object with the Remit Amt and Rejected Amount columns inserted after Amt
    const result = {};
    headers.forEach((header, index) => {
      result[header] = newRow[header];
      
      // After the Amt column, add the Remit Amt and Rejected Amount columns
      if (index === amtIndex) {
        result['Remit Amt'] = remitAmtSum;
        result['Rejected Amount'] = rejectedAmount;
      }
    });
    
    return result;
  });
};

export const createRemittanceMapping = (remittanceData, remittanceIdField, amtFieldName) => {
  const remittanceIdCounts = {};
  const remittanceAmountsByID = {};
  
  remittanceData.forEach(row => {
    const id = row[remittanceIdField];
    remittanceIdCounts[id] = (remittanceIdCounts[id] || 0) + 1;
    
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
  
  return {
    remittanceIdCounts,
    remittanceAmountsByID,
    remittanceAmtSumByID
  };
};

export const findMatchingRecords = (submissionData, remittanceIds, submissionIdField) => {
  const matchedRows = [];
  const unmatchedRows = [];
  
  submissionData.forEach(row => {
    if (remittanceIds.has(row[submissionIdField])) {
      matchedRows.push(row);
    } else {
      unmatchedRows.push(row);
    }
  });
  
  return { matchedRows, unmatchedRows };
};

export const identifyColumns = (headers, fileType) => {
  if (fileType === 'remittance') {
    const amtFieldName = headers.find(header => 
      header.toLowerCase() === 'amt' || 
      header.toLowerCase() === 'amount' || 
      header.toLowerCase().includes('amount')
    );
    
    const idField = headers.find(header => 
      header.toLowerCase() === 'id' || 
      header.toLowerCase() === 'billno'
    ) || headers[0];
    
    return { amtFieldName, idField };
  } else {
    // submission file
    const idField = headers.find(header => 
      header.toLowerCase().includes('claim') || 
      header.toLowerCase() === 'id'
    ) || 'Claim ID';
    
    return { idField };
  }
};