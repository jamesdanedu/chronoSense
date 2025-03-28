// ChronoSense Main JavaScript
// --------------------------------------------------------------------------
//  chronosense.js
// 
//  23-Mar-2025   Created after splitting HTML, CSS, JS     J O'Sullivan
//  28-Mar-2025   Added Advanced Calibration Functionality  J O'Sullivan
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
        
        // Populate column dropdown
        calibrationColumnSelect.innerHTML = dataColumns.map((column, index) => 
            `<option value="${index}">${column}</option>`
        ).join('');
        
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
        const columnIndex = calibrationColumnSelect.value;
        const column = dataColumns[columnIndex];
        const method = document.getElementById('singlePointCalibration').checked ? 
            calibrationMethods.single : 
            calibrationMethods.twoPoint;
        
        // Calculate and store calibration
        calibrationData[column] = method.calculateCalibration();
        
        // Close modal
        calibrationModal.style.display = 'none';
        
        // Optional: Show confirmation
        alert(`Calibration applied for ${column}`);
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

// Make column header editable
function makeHeaderEditable(th, columnIndex) {
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
                            minute: 'HH:mm',
                            hour: 'HH:mm'
                        }
                    },
                    title: {
                        display: true,
                        text: 'Time (HH:MM)'
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
                    intersect: false
                },
                legend: {
                    position: 'top'
                }
            },
            elements: {
                point: {
                    radius: 3,
                    hoverRadius: 7
                },
                line: {
                    tension: 0.2
                }
            }
        }
    });
    
    console.log("Chart initialized with dual y-axis support");
}

// Continue from previous code...

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
        
        // Disable buttons
        exportButton.disabled = true;
        clearButton.disabled = true;
        exportImageButton.disabled = true;
        calibrateButton.disabled = true;
        
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
            
            exportButton.disabled = false;
            clearButton.disabled = false;
            calibrateButton.disabled = false;
            
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
        
        // Add to our data array
        allData.push(dataObj);
        
        // Update the table with the new data
        addDataRow(dataObj);
        
        // Update the data count
        dataCount.textContent = `${allData.length} records collected`;
        
        // Update the chart
        updateChart();
    } catch (error) {
        console.error('Error processing data line:', error, line);
    }
}

// Update the data columns based on the first data line
// Update the data columns based on the first data line
function updateDataColumns(values) {
    // Only generate default column names if no existing columns
    if (dataColumns.length === 0) {
        dataColumns = values.map((_, i) => `field${i+1}`);
    } else if (values.length !== dataColumns.length) {
        // If column count changes, warn user but don't change names
        console.warn('Column count changed. Current column names will be preserved.');
        return;
    }
    
    // Update the table headers
    const headerRow = dataTable.querySelector('thead tr');
    
    // Clear existing headers (except timestamp)
    while (headerRow.children.length > 1) {
        headerRow.removeChild(headerRow.lastChild);
    }
    
    // Add new headers
    dataColumns.forEach((column, index) => {
        const th = document.createElement('th');
        th.textContent = column;
        headerRow.appendChild(th);
        
        // Make the header editable
        makeHeaderEditable(th, index);
    });
    
    // Update column selectors for the chart
    updateColumnSelectors();
}


// Update column selectors for the chart
function updateColumnSelectors() {
    // Clear existing checkboxes
    columnSelectors.innerHTML = '';
    
    // Add new checkboxes
    dataColumns.forEach((column, index) => {
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
            updateChart();
        });
    });
}

// Add a data row to the table
function addDataRow(dataObj) {
    const tbody = dataTable.querySelector('tbody');
    const row = document.createElement('tr');
    
    // Add timestamp cell
    const timestampCell = document.createElement('td');
    timestampCell.textContent = dataObj.timestamp.toLocaleTimeString();
    row.appendChild(timestampCell);
    
    // Add data cells
    dataColumns.forEach(column => {
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
    
    // Define colors for each axis
    const leftAxisColors = ['#3182ce', '#805ad5', '#38a169', '#4a5568'];
    const rightAxisColors = ['#ed8936', '#e53e3e', '#d69e2e', '#38b2ac'];
    
    // Update datasets
    chart.data.datasets = selectedColumns.map((column, index) => {
        const dataPoints = filteredData.map(d => ({
            x: d.timestamp,
            y: d[column]
        }));
        
        const isRightAxis = index % 2 === 1;
        const axisColors = isRightAxis ? rightAxisColors : leftAxisColors;
        
        return {
            label: column,
            data: dataPoints,
            borderColor: axisColors[Math.floor(index/2) % axisColors.length],
            backgroundColor: axisColors[Math.floor(index/2) % axisColors.length] + '20',
            tension: 0.1,
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 7,
            yAxisID: isRightAxis ? 'y1' : 'y'
        };
    });
    
    // Enable chart export button if we have data
    if (chart.data.datasets.length > 0 && chart.data.datasets[0].data.length > 0) {
        exportImageButton.disabled = false;
    } else {
        exportImageButton.disabled = true;
    }
    
    chart.update();
}

// Initialize chart datasets
function updateChartDatasets() {
    if (!chart) return;
    chart.data.datasets = [];
    chart.update();
    updateChart();
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
        ...dataColumns
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
            })
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
        dataColumns = ['Temperature', 'Humidity', 'Pressure'];
        
        // Update table headers
        const headerRow = dataTable.querySelector('thead tr');
        while (headerRow.children.length > 1) {
            headerRow.removeChild(headerRow.lastChild);
        }
        
        dataColumns.forEach((column, index) => {
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
            allData.push({
                timestamp: timestamp,
                Temperature: 20 + Math.random() * 5,
                Humidity: 40 + Math.random() * 10,
                Pressure: 1000 + Math.random() * 20
            });
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
    addTestData();
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
