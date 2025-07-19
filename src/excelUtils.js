import * as XLSX from 'xlsx';
import { findHeaderRow } from './headerDetection';

export const readExcelFile = (file, setDebugInfo) => {
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

export const downloadExcelFile = async (data, filename, sheetName, setStatus, setError) => {
  if (!data || data.length === 0) {
    setError(`No ${sheetName} data to download`);
    return;
  }

  try {
    // Dynamic import of ExcelJS
    const ExcelJS = await import('exceljs');
    
    // Create a new workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(sheetName);
    
    // Get headers
    const headers = Object.keys(data[0]);
    
    // Add headers to worksheet
    worksheet.addRow(headers);
    
    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFCCCCCC' }
    };
    
    // Add data rows
    data.forEach((row, index) => {
      const rowData = headers.map(header => row[header]);
      worksheet.addRow(rowData);
      
      // Apply color coding to Remit Amt column
      const currentRow = worksheet.getRow(index + 2); // +2 because Excel is 1-indexed and we have a header
      const remitAmtColIndex = headers.indexOf('Remit Amt');
      const amtColIndex = headers.indexOf('Amt');
      
      if (remitAmtColIndex !== -1 && amtColIndex !== -1) {
        const amtValue = parseFloat(row['Amt']) || 0;
        const remitAmtValue = parseFloat(row['Remit Amt']) || 0;
        
        const remitAmtCell = currentRow.getCell(remitAmtColIndex + 1); // +1 because Excel is 1-indexed
        
        if (remitAmtValue < (amtValue * 0.5)) {
          // Yellow background for less than 50%
          remitAmtCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFFF00' } // Yellow
          };
        } else {
          // Green background for 50% or more
          remitAmtCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF90EE90' } // Light Green
          };
        }
      }
    });
    
    // Auto-fit columns
    worksheet.columns.forEach((column, index) => {
      let maxLength = headers[index] ? headers[index].length : 10;
      data.forEach(row => {
        const cellValue = row[headers[index]];
        if (cellValue) {
          maxLength = Math.max(maxLength, cellValue.toString().length);
        }
      });
      column.width = Math.min(maxLength + 2, 50); // Cap at 50 characters
    });
    
    // Generate Excel file buffer
    const buffer = await workbook.xlsx.writeBuffer();
    
    // Create blob and download
    const blob = new Blob([buffer], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
    
    setStatus(`${sheetName} downloaded successfully with color coding!`);
  } catch (error) {
    console.error(`Error creating Excel file for ${sheetName}:`, error);
    setError(`Error creating Excel file for ${sheetName}: ${error.message}`);
  }
};