// ChronoSense Main JavaScript
// --------------------------------------------------------------------------
//  chronosense.js
// 
//  23-Mar-2025   Created after splitting HTML, CSS, JS   James O'Sullivan
//  28-Mar-2025   Added Advanced Calibration Functionality   JOS
//  29-Mar-2025   Added Y-Axis Controls and Scale Detection  JOS 
//  04-Apr-2025   Added support for checksum validation with radio data JOS
//  07-Apr-2025   Modified to hide checksum column from UI while preserving validation
//
// -------------------------------------------------------------------------- 

// Calibration Storage and Management
const calibrationData = {};

// Global variables
let port;
let reader;
let readLoopRunning = false;
let allData = [];
let dataColumns = [];
let chart;
let autoExportInterval;

// Checksum Configuration - Generic implementation
const checksumConfig = {
    enabled: true,                  // Whether to validate checksums
    lastColumnIsChecksum: true,     // Assume the last column is the checksum
    columnsToCheck: [],             // All available columns except the last one
    calculationMethod: 'modSum',    // Default calculation method
    showStatusIndicator: true,      // Whether to show status indicator
    colorRows: true,                // Whether to color the entire row based on validation
    keepInvalidData: true           // Whether to keep invalid data (with indicator) or discard it
};

// Checksum Calculation Methods
const checksumMethods = {
    // Simple modulo sum of the ones digits of each value
    modSum: function(values) {
        let sum = 0;
        for (let value of values) {
            // If value is a string with a decimal point, convert to a number first
            if (typeof value === 'string' && value.includes('.')) {
                value = parseFloat(value);
            }
            
            // Check if value is a number or can be converted to one
            if (!isNaN(value)) {
                // Extract the ones digit value
                sum += Math.abs(Math.round(value)) % 10;
            }
        }
        // Return the last digit of the sum
        return sum % 10;
    },
    
    // For use with temperature and humidity as commonly sent by micro:bit
    // (temperature % 10) + Math.floor(humidity / 10) % 10
    tempHumidity: function(values) {
        if (values.length < 2) return null;
        
        let temp = values[0];
        let humidity = values[1];
        
        // If temp or humidity is a string, convert to number
        if (typeof temp === 'string') temp = parseFloat(temp);
        if (typeof humidity === 'string') humidity = parseFloat(humidity);
        
        // Check if conversion was successful
        if (isNaN(temp) || isNaN(humidity)) return null;
        
        // Calculate checksum using the formula: (temp's last digit) + (humidity's first digit)
        let checksum = (temp % 10) + Math.floor(humidity / 10) % 10;
        return checksum;
    }
};

// Function to validate checksum generically
function validateChecksum(dataObj) {
    if (!checksumConfig.enabled || dataColumns.length < 2) {
        return true; // Skip validation if not enabled or not enough columns
    }
    
    try {
        // Determine which column is the checksum
        let checksumColumnIndex = dataColumns.length - 1; // Default to last column
        
        // Get values to check (all columns except checksum)
        let columnsToCheck = [];
        for (let i = 0; i < dataColumns.length - 1; i++) {
            columnsToCheck.push(dataColumns[i]);
        }
        
        // Get values from those columns
        const valuesToCheck = columnsToCheck.map(column => dataObj[column]);
        
        // Get expected checksum from data
        const checksumColumn = dataColumns[checksumColumnIndex];
        const expectedChecksum = parseInt(dataObj[checksumColumn]);
        
        // Calculate actual checksum using configured method
        const actualChecksum = checksumMethods[checksumConfig.calculationMethod](valuesToCheck);
        
        // If either checksum is not a number, validation fails
        if (isNaN(expectedChecksum) || actualChecksum === null) {
            return false;
        }
        
        // Compare checksums
        return expectedChecksum === actualChecksum;
    } catch (error) {
        console.error('Error validating checksum:', error);
        return false;
    }
}

// Function to apply calibration to a raw value
function applyCalibration(column, rawValue) {
    if (!calibrationData[column] || isNaN(rawValue)) {
        return rawValue;
    }
    
    const { slope, intercept } = calibrationData[column];
    return (rawValue * slope) + intercept;
}

// Function to get and display instance information from URL parameters
function getInstanceInfo() {
    const urlParams = new URLSearchParams(window.location.search);
    const instanceId = urlParams.get('instance') || '';
    const instanceName = urlParams.get('name') || '';
    
    // Only update UI if launched from launcher (has instance parameter)
    if (instanceId) {
        console.log("Instance detected:", instanceId, instanceName);
        
        // Update page title with instance name
        document.title = instanceName ? `ChronoSense - ${instanceName}` : 'ChronoSense';
        
        // Add the instance name to the header
        const titleContainer = document.querySelector('.title-container');
        if (titleContainer && instanceName) {
            // Create a subtitle element for the instance name
            const subtitle = document.createElement('div');
            subtitle.className = 'instance-subtitle';
            subtitle.textContent = instanceName;
            
            // Add it below the h1 element
            titleContainer.appendChild(subtitle);
            console.log("Added instance name to UI:", instanceName);
        }
    }
    
    // Return instance information for use elsewhere
    return { instanceId, instanceName };
}

// Call this function early to initialize instance info
const instanceInfo = getInstanceInfo();
const instanceId = instanceInfo.instanceId;
const instanceName = instanceInfo.instanceName;

// DOM elements
const connectButton = document.getElementById('connectButton');
const connectionIndicator = document.getElementById('connectionIndicator');
const exportButton = document.getElementById('exportButton');
const clearButton = document.getElementById('clearButton');
const dataTable = document.getElementById('dataTable');
const dataCount = document.getElementById('dataCount');
const columnSelectors = document.getElementById('columnSelectors');
const autoExportInput = document.getElementById('autoExport');
const timeWindowSelect = document.getElementById('timeWindow');
const aboutButton = document.getElementById('aboutButton');
const aboutModal = document.getElementById('aboutModal');
const closeModal = document.querySelector('.close-modal');
const exportImageButton = document.getElementById('exportImageButton');
const calibrateButton = document.getElementById('calibrateButton');

// Function to update button states whenever data changes
function updateButtonStates() {
    // Enable buttons if we have data
    const hasData = allData.length > 0;
    const hasColumns = dataColumns.length > 0;
    
    exportButton.disabled = !hasData;
    clearButton.disabled = !hasData;
    exportImageButton.disabled = !hasData;
    
    // Enable calibration if we have data columns, regardless of connection method
    calibrateButton.disabled = !hasColumns || !hasData;
}

// Calibration Methods and Utilities
const calibrationMethods = {
    single: {
        generateInputs(container) {
            container.innerHTML = `
                <div class="calibration-input-group">
                    <label>Current Reading:</label>
                    <input type="number" id="currentReading" step="0.01">
                </div>
                <div class="calibration-input-group">
                    <label>Known/Expected Value:</label>
                    <input type="number" id="expectedValue" step="0.01">
                </div>
                <div class="calibration-preview">
                    <p>Offset will be calculated to align current reading with expected value.</p>
                </div>
            `;
        },
        validate() {
            const currentReading = parseFloat(document.getElementById('currentReading').value);
            const expectedValue = parseFloat(document.getElementById('expectedValue').value);
            return !isNaN(currentReading) && !isNaN(expectedValue);
        },
        calculateCalibration() {
            const currentReading = parseFloat(document.getElementById('currentReading').value);
            const expectedValue = parseFloat(document.getElementById('expectedValue').value);
            
            // Calculate offset
            const offset = expectedValue - currentReading;
            
            return {
                slope: 1,
                intercept: offset
            };
        }
    },
    twoPoint: {
        generateInputs(container) {
            container.innerHTML = `
                <div class="calibration-input-group">
                    <label>Low Point Raw Value:</label>
                    <input type="number" id="lowRawValue" step="0.01">
                </div>
                <div class="calibration-input-group">
                    <label>Low Point Expected Value:</label>
                    <input type="number" id="lowExpectedValue" step="0.01">
                </div>
                <div class="calibration-input-group">
                    <label>High Point Raw Value:</label>
                    <input type="number" id="highRawValue" step="0.01">
                </div>
                <div class="calibration-input-group">
                    <label>High Point Expected Value:</label>
                    <input type="number" id="highExpectedValue" step="0.01">
                </div>
                <div class="calibration-preview">
                    <p>Linear calibration will be calculated between two points.</p>
                </div>
            `;
        },
        validate() {
            const lowRawValue = parseFloat(document.getElementById('lowRawValue').value);
            const lowExpectedValue = parseFloat(document.getElementById('lowExpectedValue').value);
            const highRawValue = parseFloat(document.getElementById('highRawValue').value);
            const highExpectedValue = parseFloat(document.getElementById('highExpectedValue').value);
            
            // Ensure all values are numbers and raw values are different
            return !isNaN(lowRawValue) && !isNaN(lowExpectedValue) && 
                   !isNaN(highRawValue) && !isNaN(highExpectedValue) &&
                   lowRawValue !== highRawValue;
        },
        calculateCalibration() {
            const lowRawValue = parseFloat(document.getElementById('lowRawValue').value);
            const lowExpectedValue = parseFloat(document.getElementById('lowExpectedValue').value);
            const highRawValue = parseFloat(document.getElementById('highRawValue').value);
            const highExpectedValue = parseFloat(document.getElementById('highExpectedValue').value);
            
            // Calculate slope and intercept using point-slope formula
            const slope = (highExpectedValue - lowExpectedValue) / (highRawValue - lowRawValue);
            const intercept = lowExpectedValue - (slope * lowRawValue);
            
            return { slope, intercept };
        }
    }
};

// Calibration Modal Setup
function setupCalibrationModal() {
    const calibrationModal = document.getElementById('calibrationModal');
    const calibrationColumnSelect = document.getElementById('calibrationColumn');
    const calibrationMethodRadios = document.querySelectorAll('input[name="calibrationMethod"]');
    const calibrationInputContainer = document.getElementById('calibrationInputContainer');
    const applyCalibrationButton = document.getElementById('applyCalibrationButton');
    const cancelCalibrationButton = document.getElementById('cancelCalibrationButton');
    const calibrationModalClose = calibrationModal.querySelector('.close-modal');

    // Open calibration modal
    calibrateButton.addEventListener('click', () => {
        calibrationModal.style.display = 'block';
        
        // Populate column dropdown (exclude checksum column if configured)
        calibrationColumnSelect.innerHTML = '';
        
        // Determine which columns to include
        let columnsToCalibrate = dataColumns;
        if (checksumConfig.enabled && checksumConfig.lastColumnIsChecksum) {
            // Skip the last column if it's a checksum
            columnsToCalibrate = dataColumns.slice(0, -1);
        }
        
        // Add options for calibration columns
        columnsToCalibrate.forEach((column, index) => {
            const option = document.createElement('option');
            option.value = dataColumns.indexOf(column); // Use actual index in dataColumns
            option.textContent = column;
            calibrationColumnSelect.appendChild(option);
        });
        
        // Default to first method
        document.getElementById('singlePointCalibration').checked = true;
        calibrationMethods.single.generateInputs(calibrationInputContainer);
        
        // Enable/disable apply button based on inputs
        updateCalibrationApplyButton();
    });

    // Close modal
    calibrationModalClose.addEventListener('click', () => {
        calibrationModal.style.display = 'none';
    });

    // Cancel button
    cancelCalibrationButton.addEventListener('click', () => {
        calibrationModal.style.display = 'none';
    });

    // Method radio button change
    calibrationMethodRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const method = e.target.value === 'single' ? 
                calibrationMethods.single : 
                calibrationMethods.twoPoint;
            
            method.generateInputs(calibrationInputContainer);
            updateCalibrationApplyButton();
        });
    });

    // Column selection change
    calibrationColumnSelect.addEventListener('change', updateCalibrationApplyButton);

    // Input validation for apply button
    calibrationInputContainer.addEventListener('input', updateCalibrationApplyButton);

    // Apply calibration
    applyCalibrationButton.addEventListener('click', () => {
        const columnIndex = parseInt(calibrationColumnSelect.value);
        const column = dataColumns[columnIndex];
        const method = document.getElementById('singlePointCalibration').checked ? 
            calibrationMethods.single : 
            calibrationMethods.twoPoint;
        
        // Calculate and store calibration
        calibrationData[column] = method.calculateCalibration();
        
        // Close modal
        calibrationModal.style.display = 'none';
        
        // Show confirmation
        alert(`Calibration applied for ${column}`);
        
        // Update data table with calibrated values
        updateDataWithCalibration(column);
    });
}

// Update apply button state
function updateCalibrationApplyButton() {
    const method = document.getElementById('singlePointCalibration').checked ? 
        calibrationMethods.single : 
        calibrationMethods.twoPoint;
    
    const applyCalibrationButton = document.getElementById('applyCalibrationButton');
    applyCalibrationButton.disabled = !method.validate();
}

// Function to update the data table with calibrated values for a specific column
function updateDataWithCalibration(column) {
    if (!calibrationData[column]) return;
    
    // Get the column index
    const columnIndex = dataColumns.indexOf(column);
    if (columnIndex === -1) return;
    
    // Get the calibration parameters
    const { slope, intercept } = calibrationData[column];
    
    // Update the data table rows
    const tbody = dataTable.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    
    // Apply calibration to data rows
    rows.forEach((row, rowIndex) => {
        // Determine the correct cell index
        // If checksum column is hidden, we need to adjust the column index
        let cellIndex = columnIndex + 2; // +2 for status and timestamp columns
        
        // Adjust for hidden checksum column if needed
        if (checksumConfig.enabled && checksumConfig.lastColumnIsChecksum && columnIndex >= dataColumns.length - 1) {
            // Skip checksum column
            return;
        }
        
        // If the checksum column is hidden, we need to adjust the cell index for visible columns
        if (checksumConfig.enabled && checksumConfig.lastColumnIsChecksum && columnIndex < dataColumns.length - 1) {
            // No adjustment needed for the cell index since we're iterating based on the visible columns
        }
        
        const cell = row.cells[cellIndex];
        if (!cell) return;
        
        // Get the original uncalibrated value from allData
        // The row index needs to be reversed because the table displays newest first
        const dataIndex = allData.length - 1 - rowIndex;
        if (dataIndex < 0 || dataIndex >= allData.length) return;
        
        const rawValue = parseFloat(allData[dataIndex][column]);
        if (isNaN(rawValue)) return;
        
        // Calculate calibrated value
        const calibratedValue = (rawValue * slope) + intercept;
        
        // Update the cell display
        cell.textContent = calibratedValue.toFixed(2);
        
        // Also update the data in allData for chart updates
        allData[dataIndex][column] = calibratedValue;
    });
    
    // Update the chart to reflect the calibrated values
    updateChart();
    
    console.log(`Updated data table with calibrated values for ${column}`);
}

// Make column header editable
function makeHeaderEditable(th, columnIndex) {
    // Don't make the last column editable if it's a checksum column
    if (checksumConfig.enabled && checksumConfig.lastColumnIsChecksum && 
        columnIndex === dataColumns.length - 1) {
        return;
    }
    
    th.classList.add('editable');
    
    th.addEventListener('click', function() {
        // If already editing, return
        if (th.classList.contains('editing')) return;
        
        const originalText = th.textContent;
        th.classList.add('editing');
        
        // Create input field
        const input = document.createElement('input');
        input.type = 'text';
        input.value = originalText;
        
        // Clear the cell content and add the input
        th.textContent = '';
        th.appendChild(input);
        input.focus();
        
        // Handle input blur (finish editing)
        input.addEventListener('blur', finishEditing);
        
        // Handle Enter key
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                finishEditing();
            }
        });
        
        function finishEditing() {
            const newColumnName = input.value.trim() || originalText; // Fallback to original if empty
            
            // Update the header
            th.textContent = newColumnName;
            th.classList.remove('editing');
            
            // Update our data columns array
            dataColumns[columnIndex] = newColumnName;
            
            // Update column selectors
            updateColumnSelectors();
            
            // Update chart
            updateChart();
        }
    });
}

// Process a line of data from the serial port
function processDataLine(line) {
    try {
        // Split the line by commas
        const values = line.split(',').map(v => v.trim());
        
        // If this is the first data or columns changed, update the table headers
        if (dataColumns.length === 0 || values.length !== dataColumns.length) {
            updateDataColumns(values);
        }
        
        // Create a data object with timestamp and values
        const timestamp = new Date();
        const dataObj = {
            timestamp: timestamp
        };
        
        values.forEach((value, index) => {
            // Try to convert to number if possible
            const numValue = parseFloat(value);
            
            // Store raw value and apply calibration
            const column = dataColumns[index];
            const processedValue = isNaN(numValue) ? value : applyCalibration(column, numValue);
            dataObj[column] = processedValue;
        });
        
        // Validate checksum if enabled
        const isValid = validateChecksum(dataObj);
        dataObj.checksumValid = isValid;
        
        // Add validation status to the data object
        if (checksumConfig.keepInvalidData || isValid) {
            // Add to our data array
            allData.push(dataObj);
            
            // Update the table with the new data
            addDataRow(dataObj);
            
            // Update the data count
            dataCount.textContent = `${allData.length} records collected`;
            
            // Update the chart
            updateChart();
            
            // Update button states
            updateButtonStates();
        } else {
            console.warn('Invalid checksum, data discarded:', dataObj);
        }
    } catch (error) {
        console.error('Error processing data line:', error, line);
    }
}

// Update the data columns based on the first data line
function updateDataColumns(values) {
    // Generate column names based on the values
    if (dataColumns.length === 0) {
        // First data received - generate default names
        dataColumns = values.map((_, i) => `field${i+1}`);
    } else if (values.length !== dataColumns.length) {
        // If column count changes, ensure we have enough column names
        if (values.length > dataColumns.length) {
            // Add new column names for additional columns
            const additionalColumns = values.length - dataColumns.length;
            for (let i = 0; i < additionalColumns; i++) {
                dataColumns.push(`field${dataColumns.length + 1}`);
            }
        } else {
            // Remove extra column names if fewer columns
            dataColumns = dataColumns.slice(0, values.length);
        }
        console.warn('Column count changed. Adjusting column names.');
    }
    
    // Update the table headers
    const headerRow = dataTable.querySelector('thead tr');
    
    // Clear existing headers
    headerRow.innerHTML = '';
    
    // Add checksum validation status header first
    const validationHeader = document.createElement('th');
    validationHeader.textContent = 'Status';
    validationHeader.className = 'checksum-status-header';
    headerRow.appendChild(validationHeader);
    
    // Add timestamp header
    const timestampHeader = document.createElement('th');
    timestampHeader.textContent = 'Timestamp';
    headerRow.appendChild(timestampHeader);
    
    // Add data column headers, excluding checksum column if configured
    const columnsToDisplay = [...dataColumns];
    if (checksumConfig.enabled && checksumConfig.lastColumnIsChecksum) {
        // Remove the last column (checksum) from display
        columnsToDisplay.pop();
    }
    
    columnsToDisplay.forEach((column, index) => {
        const th = document.createElement('th');
        th.textContent = column;
        headerRow.appendChild(th);
        
        // Make the header editable
        makeHeaderEditable(th, index);
    });
    
    // Update column selectors for the chart
    updateColumnSelectors();
    
    // Update button states
    updateButtonStates();
}

// Add a data row to the table
function addDataRow(dataObj) {
    const tbody = dataTable.querySelector('tbody');
    const row = document.createElement('tr');
    
    // Add class based on checksum validation status
    if (checksumConfig.enabled && checksumConfig.showStatusIndicator) {
        row.classList.add(dataObj.checksumValid ? 'valid-data' : 'invalid-data');
    }
    
    // Add checksum validation status as first cell
    const validationCell = document.createElement('td');
    validationCell.className = 'checksum-status-cell';
    
    if (checksumConfig.enabled && checksumConfig.showStatusIndicator) {
        if (dataObj.checksumValid) {
            validationCell.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-check-circle">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
            `;
        } else {
            validationCell.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F44336" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-alert-circle">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
            `;
        }
    }
    row.appendChild(validationCell);
    
    // Add timestamp cell
    const timestampCell = document.createElement('td');
    timestampCell.textContent = dataObj.timestamp.toLocaleTimeString();
    row.appendChild(timestampCell);
    
    // Add data cells, excluding checksum column if configured
    const columnsToDisplay = [...dataColumns];
    if (checksumConfig.enabled && checksumConfig.lastColumnIsChecksum) {
        // Remove the last column (checksum) from display
        columnsToDisplay.pop();
    }
    
    columnsToDisplay.forEach(column => {
        const cell = document.createElement('td');
        cell.textContent = dataObj[column];
        row.appendChild(cell);
    });
    
    // Add to the top of the table
    tbody.insertBefore(row, tbody.firstChild);
    
    // Limit the number of rows displayed (for performance)
    if (tbody.children.length > 100) {
        tbody.removeChild(tbody.lastChild);
    }
}

// Read data from the serial port
async function readSerialData() {
    if (!port) return;
    
    try {
        reader = port.readable.getReader();
        readLoopRunning = true;
        
        let buffer = '';
        const decoder = new TextDecoder();
        
        while (readLoopRunning) {
            const { value, done } = await reader.read();
            
            if (done) {
                reader.releaseLock();
                break;
            }
            
            // Decode the received bytes and add to buffer
            const chunk = decoder.decode(value);
            buffer += chunk;
            
            // Process complete lines in the buffer
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep the incomplete line in the buffer
            
            for (const line of lines) {
                if (line.trim()) {
                    processDataLine(line.trim());
                }
            }
        }
    } catch (error) {
        console.error('Error reading from serial port:', error);
        
        connectButton.textContent = 'Connect';
        connectionIndicator.classList.remove('active');
        
        if (reader) {
            reader.releaseLock();
        }
    }
}

// Connect or disconnect from the serial port
async function toggleConnection() {
    if (port) {
        // Disconnect
        if (reader) {
            await reader.cancel();
            readLoopRunning = false;
            reader = null;
        }
        
        await port.close();
        port = null;
        
        connectButton.textContent = 'Connect';
        connectionIndicator.classList.remove('active');
        
        // Only disable export and clear buttons if no data exists
        const buttonsDisabled = allData.length === 0;
        exportButton.disabled = buttonsDisabled;
        clearButton.disabled = buttonsDisabled;
        exportImageButton.disabled = buttonsDisabled;
        
        // Enable calibration if we have data columns and data
        calibrateButton.disabled = dataColumns.length === 0 || allData.length === 0;
        
        // Disable auto-export input
        autoExportInput.disabled = true;
        const settingsRow = autoExportInput.closest('.settings-row');
        if (settingsRow) {
            settingsRow.classList.add('disabled');
            settingsRow.classList.remove('enabled');
        }
        
        // Stop auto-export if it's running
        if (autoExportInterval) {
            clearInterval(autoExportInterval);
            autoExportInterval = null;
        }
    } else {
        // Connect
        try {
            port = await navigator.serial.requestPort();
            const baudRate = 115200; // will work for majority of cases, so not configurable for now
            
            await port.open({ baudRate });
            
            connectButton.textContent = 'Disconnect';
            connectionIndicator.classList.add('active');
            
            // Always enable these buttons if we have data
            const buttonsDisabled = allData.length === 0;
            exportButton.disabled = buttonsDisabled;
            clearButton.disabled = buttonsDisabled;
            exportImageButton.disabled = buttonsDisabled;
            
            // Enable calibration if we have data columns
            calibrateButton.disabled = dataColumns.length === 0;
            
            // Enable auto-export input
            autoExportInput.disabled = false;
            const settingsRow = autoExportInput.closest('.settings-row');
            if (settingsRow) {
                settingsRow.classList.remove('disabled');
                settingsRow.classList.add('enabled');
            }
            
            // Set up auto-export if enabled
            setupAutoExport();
            
            // Start reading data
            readSerialData();
        } catch (error) {
            console.error('Error connecting to serial port:', error);
            alert('Failed to connect to the serial port. Please try again.');
        }
    }
}

// Update column selectors for the chart
function updateColumnSelectors() {
    // Clear existing checkboxes
    columnSelectors.innerHTML = '';
    
    // Determine which columns to display (exclude checksum)
    const columnsToDisplay = [...dataColumns];
    if (checksumConfig.enabled && checksumConfig.lastColumnIsChecksum) {
        // Remove the last column (checksum) from selectors
        columnsToDisplay.pop();
    }
    
    // Add new checkboxes
    columnsToDisplay.forEach((column, index) => {
        const div = document.createElement('div');
        div.className = 'checkbox-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `col-${index}`;
        checkbox.dataset.column = column;
        checkbox.checked = index === 0; // Select the first column by default
        
        const label = document.createElement('label');
        label.htmlFor = `col-${index}`;
        label.textContent = column;
        
        div.appendChild(checkbox);
        div.appendChild(label);
        columnSelectors.appendChild(div);
    });
    
    // Update the checkbox event handlers
    updateColumnSelectorHandlers();
    
    // Initialize chart datasets
    updateChartDatasets();
}

// Update checkbox event handlers
function updateColumnSelectorHandlers() {
    // Get all column checkboxes
    const checkboxes = document.querySelectorAll('#columnSelectors input[type="checkbox"]');
    

    // Add/update change event listeners
    checkboxes.forEach(checkbox => {
        // Remove existing listeners to avoid duplicates
        const newCheckbox = checkbox.cloneNode(true);
        checkbox.parentNode.replaceChild(newCheckbox, checkbox);
        
        // Add new listener that updates both the chart and axis controls
        newCheckbox.addEventListener('change', function() {
            updateAxisControls(); // Update axis controls when selection changes
            updateChart();        // Update the chart
        });
    });
}

// Initialize chart datasets
function updateChartDatasets() {
    if (!chart) return;
    chart.data.datasets = [];
    chart.update();
    updateChart();
}

// Initialize the chart with dual y-axis support
function initChart() {
    const ctx = document.getElementById('dataChart').getContext('2d');
    
    // Clear existing chart if any
    if (chart) {
        chart.destroy();
    }
    
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: []
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'minute',
                        displayFormats: {
                            minute: 'HH:mm:ss',
                            hour: 'HH:mm'
                        }
                    },
                    title: {
                        display: true,
                        text: 'Time (HH:MM:SS)'
                    }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    beginAtZero: false,
                    title: {
                        display: true,
                        text: 'Left Axis',
                        color: 'rgb(49, 130, 206)'
                    },
                    grid: {
                        drawOnChartArea: true
                    },
                    ticks: {
                        color: 'rgb(49, 130, 206)'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    beginAtZero: false,
                    title: {
                        display: true,
                        text: 'Right Axis',
                        color: 'rgb(237, 137, 54)'
                    },
                    grid: {
                        drawOnChartArea: false
                    },
                    ticks: {
                        color: 'rgb(237, 137, 54)'
                    }
                }
            },
            plugins: {
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        // Add checksum validation status to tooltip
                        footer: function(tooltipItems) {
                            if (!checksumConfig.enabled) return;
                            
                            const dataIndex = tooltipItems[0].dataIndex;
                            const datasetIndex = tooltipItems[0].datasetIndex;
                            const dataset = chart.data.datasets[datasetIndex];
                            
                            if (dataset && dataset.checksumStatus) {
                                const isValid = dataset.checksumStatus[dataIndex];
                                return isValid ? 'Valid checksum ✓' : 'Invalid checksum ⚠';
                            }
                            return '';
                        }
                    }
                },
                legend: {
                    position: 'top'
                }
            },
            elements: {
                point: {
                    radius: 4,
                    hoverRadius: 7,
                    // Customize point appearance based on checksum validation
                    pointStyle: function(context) {
                        if (!checksumConfig.enabled) return 'circle';
                        
                        const dataset = context.dataset;
                        if (dataset && dataset.checksumStatus) {
                            const isValid = dataset.checksumStatus[context.dataIndex];
                            return isValid ? 'circle' : 'triangle';
                        }
                        return 'circle';
                    },
                    // Custom point color based on validation status
                    backgroundColor: function(context) {
                        const dataset = context.dataset;
                        if (!checksumConfig.enabled || !dataset || !dataset.checksumStatus) {
                            return dataset.borderColor;
                        }
                        
                        const isValid = dataset.checksumStatus[context.dataIndex];
                        return isValid ? dataset.borderColor : '#F44336';
                    }
                },
                line: {
                    tension: 0.2
                }
            }
        }
    });
    
    console.log("Chart initialized with dual y-axis support");
}

// Function to create and add the Y-axis controls section to the HTML
function createYAxisControls() {
    // Get the panel element where we'll add the controls
    const visualPanel = document.querySelector('.panel:nth-of-type(2)');
    const chartContainer = visualPanel.querySelector('.chart-container');
    
    // Create the axis controls container
    const axisControls = document.createElement('div');
    axisControls.className = 'axis-controls';
    axisControls.innerHTML = `
        <div class="axis-title">Y-Axis Assignment</div>
        <div class="axis-options" id="axisOptions">
            <div class="no-columns-message">Select columns above to assign to axes</div>
        </div>
        <div class="axis-info">
            <div class="axis-info-item">
                <div class="axis-info-color left"></div>
                <span>Left Axis</span>
            </div>
            <div class="axis-info-item">
                <div class="axis-info-color right"></div>
                <span>Right Axis</span>
            </div>
        </div>
        <div id="scaleWarnings" class="scale-warnings"></div>
    `;
    
    // Insert the axis controls before the chart container
    visualPanel.insertBefore(axisControls, chartContainer);
    
    // Also add a scale type toggle for each axis
    const scaleToggle = document.createElement('div');
    scaleToggle.className = 'scale-toggle';
    scaleToggle.innerHTML = `
        <div class="scale-toggle-item">
            <label for="leftAxisScale">Left Axis Scale:</label>
            <select id="leftAxisScale">
                <option value="linear" selected>Linear</option>
                <option value="logarithmic">Logarithmic</option>
            </select>
        </div>
        <div class="scale-toggle-item">
            <label for="rightAxisScale">Right Axis Scale:</label>
            <select id="rightAxisScale">
                <option value="linear" selected>Linear</option>
                <option value="logarithmic">Logarithmic</option>
            </select>
        </div>
    `;
    
    // Add the scale toggle after the axis controls
    visualPanel.insertBefore(scaleToggle, chartContainer);
    
    // Add event listeners for scale toggles
    document.getElementById('leftAxisScale').addEventListener('change', updateChart);
    document.getElementById('rightAxisScale').addEventListener('change', updateChart);
}

// Function to update the axis assignment controls based on selected columns
function updateAxisControls() {
    const axisOptions = document.getElementById('axisOptions');
    if (!axisOptions) return;
    
    // Get selected columns
    const selectedCheckboxes = document.querySelectorAll('#columnSelectors input[type="checkbox"]:checked');
    
    if (selectedCheckboxes.length === 0) {
        axisOptions.innerHTML = '<div class="no-columns-message">Select columns above to assign to axes</div>';
        return;
    }
    
    // Clear existing options
    axisOptions.innerHTML = '';
    
    // Add axis assignment controls for each selected column
    selectedCheckboxes.forEach(checkbox => {
        const column = checkbox.dataset.column;
        const columnIndex = dataColumns.indexOf(column);
        
        // Skip the checksum column if identified
        if (checksumConfig.enabled && checksumConfig.lastColumnIsChecksum && 
            columnIndex === dataColumns.length - 1) {
            return;
        }
        
        // Get current axis assignment or default to left
        // We'll use localStorage to persist user choices
        const storageKey = `axis_${instanceId || 'default'}_${column}`;
        const currentAxis = localStorage.getItem(storageKey) || 'left';
        
        const axisVariable = document.createElement('div');
        axisVariable.className = `axis-variable selected-${currentAxis}`;
        axisVariable.dataset.column = column;
        
        axisVariable.innerHTML = `
            <div class="axis-variable-name">${column}</div>
            <div class="axis-selector">
                <label class="left">
                    <input type="radio" name="axis_${columnIndex}" value="left" ${currentAxis === 'left' ? 'checked' : ''}>
                    Left
                </label>
                <label class="right">
                    <input type="radio" name="axis_${columnIndex}" value="right" ${currentAxis === 'right' ? 'checked' : ''}>
                    Right
                </label>
            </div>
        `;
        
        axisOptions.appendChild(axisVariable);
        
        // Add event listeners for the radio buttons
        const radios = axisVariable.querySelectorAll('input[type="radio"]');
        radios.forEach(radio => {
            radio.addEventListener('change', function() {
                // Update the class on the parent element
                axisVariable.className = `axis-variable selected-${this.value}`;
                
                // Save the selection to localStorage
                localStorage.setItem(storageKey, this.value);
                
                // Update the chart
                updateChart();
                
                // Check for scale conflicts after a short delay to let the chart update
                setTimeout(checkScaleConflicts, 100);
            });
        });
    });
    
    // Check for scale conflicts after everything is set up
    setTimeout(checkScaleConflicts, 100);
}

// Function to check for scale conflicts between data series on the same axis
function checkScaleConflicts() {
    if (!chart || allData.length === 0) return;
    
    const scaleWarnings = document.getElementById('scaleWarnings');
    if (!scaleWarnings) return;
    
    // Clear existing warnings
    scaleWarnings.innerHTML = '';
    
    // Get all the active data series and their axis assignments
    const leftAxisSeries = [];
    const rightAxisSeries = [];
    
    // Get the axis assignments for each selected column
    document.querySelectorAll('.axis-variable').forEach(element => {
        const column = element.dataset.column;
        const axisAssignment = element.classList.contains('selected-left') ? 'left' : 'right';
        
        if (axisAssignment === 'left') {
            leftAxisSeries.push(column);
        } else {
            rightAxisSeries.push(column);
        }
    });
    
    // Check for scale conflicts on left axis
    if (leftAxisSeries.length > 1) {
        checkAxisScaleConflict(leftAxisSeries, 'left', scaleWarnings);
    }
    
    // Check for scale conflicts on right axis
    if (rightAxisSeries.length > 1) {
        checkAxisScaleConflict(rightAxisSeries, 'right', scaleWarnings);
    }
    
    // Check if logarithmic scale would be beneficial
    leftAxisSeries.forEach(column => {
        checkLogarithmicScaleBenefit(column, 'left', scaleWarnings);
    });
    
    rightAxisSeries.forEach(column => {
        checkLogarithmicScaleBenefit(column, 'right', scaleWarnings);
    });
}

// Function to check for scale conflicts between data series on the same axis
function checkAxisScaleConflict(seriesColumns, axis, warningsElement) {
    if (seriesColumns.length < 2) return;
    
    // Calculate min and max values for each series
    const ranges = seriesColumns.map(column => {
        const values = allData.map(d => parseFloat(d[column])).filter(v => !isNaN(v));
        if (values.length === 0) return { column, min: 0, max: 0, range: 0 };
        
        const min = Math.min(...values);
        const max = Math.max(...values);
        return { column, min, max, range: max - min };
    });
    
    // Compare ranges to detect conflicts
    let conflictFound = false;
    for (let i = 0; i < ranges.length; i++) {
        for (let j = i + 1; j < ranges.length; j++) {
            const ratio = Math.max(
                ranges[i].range / Math.max(ranges[j].range, 0.001),
                ranges[j].range / Math.max(ranges[i].range, 0.001)
            );
            
            // If one range is more than 5 times larger than another, suggest separation
            if (ratio > 5) {
                const warning = document.createElement('div');
                warning.className = 'scale-warning';
                warning.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <span>Scale conflict: <strong>${ranges[i].column}</strong> and <strong>${ranges[j].column}</strong> have very different value ranges. Consider moving one to the ${axis === 'left' ? 'right' : 'left'} axis.</span>
                `;
                warningsElement.appendChild(warning);
                conflictFound = true;
            }
        }
    }
    
    return conflictFound;
}

// Function to check if a logarithmic scale would be beneficial for a data series
function checkLogarithmicScaleBenefit(column, axis, warningsElement) {
    // Get all numeric values for this column
    const values = allData.map(d => parseFloat(d[column])).filter(v => !isNaN(v) && v > 0);
    if (values.length < 5) return false; // Need enough data points
    
    // Check if all values are positive (required for log scale)
    if (Math.min(...values) <= 0) return false;
    
    const min = Math.min(...values);
    const max = Math.max(...values);
    
    // Calculate ratio between max and min
    const ratio = max / min;
    
    // If ratio is very large, suggest logarithmic scale
    // This threshold can be adjusted based on preference
    if (ratio > 100) {
        // Check if we're already using logarithmic scale
        const scaleSelect = document.getElementById(`${axis}AxisScale`);
        if (scaleSelect && scaleSelect.value === 'logarithmic') return false;
        
        const warning = document.createElement('div');
        warning.className = 'scale-warning';
        warning.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span><strong>${column}</strong> has a very wide range of values (${min.toFixed(2)} to ${max.toFixed(2)}). Consider using logarithmic scale for the ${axis} axis.</span>
        `;
        warningsElement.appendChild(warning);
        return true;
    }
    
    return false;
}

// Function to update axis titles based on what's being displayed
function updateAxisTitles() {
    if (!chart) return;
    
    // Get all columns assigned to left axis
    const leftAxisColumns = [];
    // Get all columns assigned to right axis
    const rightAxisColumns = [];
    
    // Check all datasets and categorize them by axis
    chart.data.datasets.forEach(dataset => {
        if (dataset.yAxisID === 'y') {
            leftAxisColumns.push(dataset.label);
        } else {
            rightAxisColumns.push(dataset.label);
        }
    });
    
    // Update the axis titles
    if (leftAxisColumns.length > 0) {
        chart.options.scales.y.title.text = leftAxisColumns.join(', ');
    } else {
        chart.options.scales.y.title.text = 'Left Axis';
    }
    
    if (rightAxisColumns.length > 0) {
        chart.options.scales.y1.title.text = rightAxisColumns.join(', ');
    } else {
        chart.options.scales.y1.title.text = 'Right Axis';
    }
}

// Update the chart with dual y-axis support
function updateChart() {
    if (!chart || allData.length === 0) {
        console.log("Chart not initialized or no data available");
        return;
    }
    
    // Get selected columns
    const selectedColumns = Array.from(
        document.querySelectorAll('#columnSelectors input[type="checkbox"]:checked')
    ).map(cb => cb.dataset.column);
    
    // Filter data based on the selected time window
    const windowMinutes = parseInt(timeWindowSelect.value);
    const filteredData = windowMinutes === 'all' ? allData : allData.filter(d => {
        return (new Date() - d.timestamp) <= windowMinutes * 60 * 1000;
    });
    
    if (filteredData.length === 0) {
        console.log("No data after filtering by time window");
        return;
    }
    
    // Get scale types for each axis
    const leftScaleType = document.getElementById('leftAxisScale')?.value || 'linear';
    const rightScaleType = document.getElementById('rightAxisScale')?.value || 'linear';
    
    // Update chart scales
    chart.options.scales.y.type = leftScaleType;
    chart.options.scales.y1.type = rightScaleType;
    
    // Set additional properties for logarithmic scales
    if (leftScaleType === 'logarithmic') {
        chart.options.scales.y.min = 0.1; // Avoid zero which is invalid for log scale
    } else {
        chart.options.scales.y.min = undefined; // Let Chart.js determine appropriate min
    }
    
    if (rightScaleType === 'logarithmic') {
        chart.options.scales.y1.min = 0.1;
    } else {
        chart.options.scales.y1.min = undefined;
    }
    
    // Define colors for each axis
    const leftAxisColors = ['#3182ce', '#805ad5', '#38a169', '#4a5568'];
    const rightAxisColors = ['#ed8936', '#e53e3e', '#d69e2e', '#38b2ac'];
    
    // Track how many series are on each axis for color selection
    let leftAxisCount = 0;
    let rightAxisCount = 0;
    
    // Update datasets
    chart.data.datasets = selectedColumns.map((column) => {
        // Format data points with timestamp and value
        const dataPoints = filteredData.map(d => ({
            x: d.timestamp,
            y: d[column]
        }));
        
        // Store checksum validation status for each point to use in tooltips and styling
        const checksumStatus = filteredData.map(d => d.checksumValid);
        
        // Check axis assignment if we have the controls in place
        let isRightAxis = false;
        const axisElement = document.querySelector(`.axis-variable[data-column="${column}"]`);
        if (axisElement) {
            isRightAxis = axisElement.classList.contains('selected-right');
        } else {
            // Default to alternating left/right
            isRightAxis = (leftAxisCount > rightAxisCount);
        }
        
        // Select color based on axis
        let color;
        if (isRightAxis) {
            color = rightAxisColors[rightAxisCount % rightAxisColors.length];
            rightAxisCount++;
        } else {
            color = leftAxisColors[leftAxisCount % leftAxisColors.length];
            leftAxisCount++;
        }
        
        return {
            label: column,
            data: dataPoints,
            borderColor: color,
            backgroundColor: color + '20',
            tension: 0.1,
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 7,
            yAxisID: isRightAxis ? 'y1' : 'y',
            // Add checksum status for chart to use
            checksumStatus: checksumStatus
        };
    });
    
    // Update axis titles
    updateAxisTitles();
    
    // Enable chart export button if we have data
    if (chart.data.datasets.length > 0 && chart.data.datasets[0].data.length > 0) {
        exportImageButton.disabled = false;
    } else {
        exportImageButton.disabled = true;
    }
    
    chart.update();
    
    // Check for scale conflicts
    checkScaleConflicts();
    
    // Update button states
    updateButtonStates();
}


// Export data as CSV
function exportData(format) {
    if (allData.length === 0) {
        alert('No data to export');
        return;
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Create CSV header row with expanded timestamp columns
    const headers = [
        'timestamp',             // Original timestamp (ISO format)
        'date',                  // Date in DD-MM-YYYY format
        'time',                  // Time in HH:MM:SS format
        'day_of_week',           // Full day name (Monday, Tuesday, etc.)
        'month_of_year',         // Short month name (Jan, Feb, Mar, etc.)
        'hour',                  // Hour of the day (0-23)
        'minute',                // Minute of the hour (0-59)
        ...dataColumns,
        'checksum_valid'         // Add column for checksum validation status
    ];
    
    const csvRows = [headers.join(',')];
    
    // Add data rows with expanded timestamp information
    allData.forEach(data => {
        const dt = new Date(data.timestamp);
        
        // Format date as DD-MM-YYYY
        const day = dt.getDate().toString().padStart(2, '0');
        const month = (dt.getMonth() + 1).toString().padStart(2, '0');
        const year = dt.getFullYear();
        const formattedDate = `${day}-${month}-${year}`;
        
        // Format time as HH:MM:SS
        const hours = dt.getHours().toString().padStart(2, '0');
        const minutes = dt.getMinutes().toString().padStart(2, '0');
        const seconds = dt.getSeconds().toString().padStart(2, '0');
        const formattedTime = `${hours}:${minutes}:${seconds}`;
        
        // Get day of week
        const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayOfWeek = daysOfWeek[dt.getDay()];
        
        // Get month name
        const monthsOfYear = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthOfYear = monthsOfYear[dt.getMonth()];
        
        // Prepare row with expanded timestamp data plus original data columns
        const row = [
            data.timestamp.toISOString(),   // Original timestamp
            formattedDate,                  // Date in DD-MM-YYYY
            formattedTime,                  // Time in HH:MM:SS
            dayOfWeek,                      // Day of week
            monthOfYear,                    // Month of year
            hours,                          // Hour of the day
            minutes,                        // Minute of the hour
            ...dataColumns.map(col => {
                // Handle special characters for CSV (quote fields with commas, etc.)
                let value = data[col];
                if (value === null || value === undefined) {
                    return '';
                }
                
                value = String(value);
                
                // If value contains commas, quotes, or newlines, wrap in quotes and escape internal quotes
                if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                    return '"' + value.replace(/"/g, '""') + '"';
                }
                
                return value;
            }),
            // Add checksum validation status as "valid" or "invalid" text
            data.checksumValid !== undefined ? (data.checksumValid ? 'valid' : 'invalid') : ''
        ];
        
        csvRows.push(row.join(','));
    });
    
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8' });
    
    // Create instance-specific filename if available
    let exportFilename;
    if (instanceName) {
        const sanitizedName = instanceName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        exportFilename = `chronosense-data-${sanitizedName}-${timestamp}.csv`;
    } else {
        exportFilename = `chronosense-data-${timestamp}.csv`;
    }
    
    saveAs(blob, exportFilename);
}

// Export chart as image
function exportChartAsImage() {
    if (!chart) {
        alert('No chart available to export');
        return;
    }
    
    try {
        // Get the canvas element
        const canvas = document.getElementById('dataChart');
        
        // Create a white background (charts with transparency will otherwise have black background)
        const context = canvas.getContext('2d');
        const compositeOperation = context.globalCompositeOperation;
        const originalCanvasData = context.getImageData(0, 0, canvas.width, canvas.height);
        
        // Create a temporary offscreen canvas
        const offscreenCanvas = document.createElement('canvas');
        const offscreenContext = offscreenCanvas.getContext('2d');
        offscreenCanvas.width = canvas.width;
        offscreenCanvas.height = canvas.height;
        
        // Draw white background
        offscreenContext.fillStyle = 'white';
        offscreenContext.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw the original canvas on top
        offscreenContext.drawImage(canvas, 0, 0);
        
        // Restore the original canvas
        context.putImageData(originalCanvasData, 0, 0);
        context.globalCompositeOperation = compositeOperation;
        
        // Convert to image and trigger download
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        
        // Create instance-specific filename if available
        let exportFilename;
        if (instanceName) {
            const sanitizedName = instanceName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            exportFilename = `chronosense-chart-${sanitizedName}-${timestamp}.png`;
        } else {
            exportFilename = `chronosense-chart-${timestamp}.png`;
        }
        
        const dataURL = offscreenCanvas.toDataURL('image/png');
        
        // Create download link
        const link = document.createElement('a');
        link.download = exportFilename;
        link.href = dataURL;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (error) {
        console.error('Error exporting chart:', error);
        alert('Failed to export chart as image. Check console for details.');
    }
}

// Setup auto-export interval
function setupAutoExport() {
    const minutes = parseInt(autoExportInput.value);
    
    // Clear existing interval
    if (autoExportInterval) {
        clearInterval(autoExportInterval);
        autoExportInterval = null;
    }
    
    // Set up new interval if minutes > 0
    if (minutes > 0 && port) {
        autoExportInterval = setInterval(() => {
            exportData('csv');
        }, minutes * 60 * 1000);
    }
}

// Clear all data
function clearData() {
    if (confirm('Are you sure you want to clear all collected data?')) {
        allData = [];
        
        // Clear the table
        const tbody = dataTable.querySelector('tbody');
        tbody.innerHTML = '';
        
        // Update the data count
        dataCount.textContent = '0 records collected';
        
        // Update the chart
        updateChart();
        
        // Update button states
        updateButtonStates();
        
        // Clear local storage
        // Use instance-specific key if available
        const storageKey = instanceId ? `microbitsensordata-${instanceId}` : 'microbitsensordata';
        localStorage.removeItem(storageKey);
    }
}

// Add test data if in development mode
function addTestData() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('debug') === 'true') {
        // Generate test data with three columns including checksum
        dataColumns = ['field1', 'field2', 'field3', 'field4'];
        
        // Update table headers
        const headerRow = dataTable.querySelector('thead tr');
        
        // Clear existing headers
        headerRow.innerHTML = '';
        
        // Add checksum validation status header first
        const validationHeader = document.createElement('th');
        validationHeader.textContent = 'Status';
        validationHeader.className = 'checksum-status-header';
        headerRow.appendChild(validationHeader);
        
        // Add timestamp header
        const timestampHeader = document.createElement('th');
        timestampHeader.textContent = 'Timestamp';
        headerRow.appendChild(timestampHeader);
        
        // Add data column headers, excluding checksum column if configured
        const columnsToDisplay = [...dataColumns];
        if (checksumConfig.enabled && checksumConfig.lastColumnIsChecksum) {
            // Remove the last column (checksum) from display
            columnsToDisplay.pop();
        }
        
        columnsToDisplay.forEach((column, index) => {
            const th = document.createElement('th');
            th.textContent = column;
            headerRow.appendChild(th);
            
            // Make the header editable
            makeHeaderEditable(th, index);
        });
        
        // Create test data
        const now = new Date();
        for (let i = 0; i < 20; i++) {
            const timestamp = new Date(now.getTime() - (i * 5000)); // 5 second intervals
            
            // Random accelerometer-like values
            const x = Math.round(Math.random() * 200 - 100);  // -100 to 100
            const y = Math.round(Math.random() * 600 - 300);  // -300 to 300
            const z = Math.round(Math.random() * 2000 - 1000); // -1000 to 1000
            
            // Calculate checksum based on ones digits
            const checksum = (Math.abs(x) % 10 + Math.abs(y) % 10 + Math.abs(z) % 10) % 10;
            
            // Randomly make some checksums invalid for testing
            const validChecksum = Math.random() > 0.2 ? checksum : (checksum + 1) % 10;
            
            // Create data object
            const dataObj = {
                timestamp: timestamp,
                field1: x,
                field2: y,
                field3: z,
                field4: validChecksum,
                checksumValid: validChecksum === checksum
            };
            
            allData.push(dataObj);
        }
        
        // Sort by timestamp (newest first for the table)
        allData.sort((a, b) => b.timestamp - a.timestamp);
        
        // Update the table
        const tbody = dataTable.querySelector('tbody');
        tbody.innerHTML = '';
        
        // Add the data to the table
        allData.forEach(d => {
            addDataRow(d);
        });
        
        // Update data count
        dataCount.textContent = `${allData.length} records collected`;
        
        // Configure checksum validation
        checksumConfig.enabled = true;
        checksumConfig.lastColumnIsChecksum = true;
        
        // Update column selectors
        updateColumnSelectors();
        
        // Enable export and clear buttons
        exportButton.disabled = false;
        clearButton.disabled = false;
        
        // Update chart
        updateChart();
    }
}

// Initialize chart on page load
initChart();

// Initialize modal interactions
aboutButton.addEventListener('click', () => {
    aboutModal.style.display = 'block';
});

closeModal.addEventListener('click', () => {
    aboutModal.style.display = 'none';
});

window.addEventListener('click', (event) => {
    if (event.target === aboutModal) {
        aboutModal.style.display = 'none';
    }
});

// Initialize calibration modal and load initial data
window.addEventListener('load', () => {
    setupCalibrationModal();
    createYAxisControls(); // Create the Y-Axis controls
    addTestData();
    
    // Check if we have any data and update button states
    updateButtonStates();
});

// Initialize elements based on serial API support
if ('serial' in navigator) {
    connectButton.addEventListener('click', toggleConnection);
    exportButton.addEventListener('click', () => exportData('csv'));
    clearButton.addEventListener('click', clearData);
    autoExportInput.addEventListener('change', setupAutoExport);
    timeWindowSelect.addEventListener('change', updateChart);
    exportImageButton.addEventListener('click', exportChartAsImage);
} else {
    connectButton.disabled = true;
    connectButton.textContent = 'Web Serial API not supported';
    alert('Your browser does not support the Web Serial API. Please use Chrome or Edge.');
}
