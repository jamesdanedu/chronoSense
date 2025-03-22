// ChronoSense Main JavaScript
// --------------------------------------------------------------------------
//  chronosense.js
// 
//  23-Mar-2025   Created after splitting HTML, CSS, JS   James O'Sullivan
//
// -------------------------------------------------------------------------- 

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

// Global variables
let port;
let reader;
let readLoopRunning = false;
let allData = [];
let dataColumns = [];
let chart;
let autoExportInterval;

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

// Initialize Modal
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

// Function to make column header editable
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

// Initialize elements
autoExportInput.disabled = true; // Disabled by default
const settingsRow = autoExportInput.closest('.settings-row');
if (settingsRow) {
    settingsRow.classList.add('disabled');
}

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

// Function to export chart as image
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

// Create a function to add axis selectors
function createImprovedAxisControls() {
    // Create a container for axis selection that will go above the chart
    const axisControlsContainer = document.createElement('div');
    axisControlsContainer.className = 'axis-controls';
    axisControlsContainer.innerHTML = `
        <div class="axis-title">Y-Axis Assignment</div>
        <div id="axis-options" class="axis-options">
            <!-- Variable controls will be added here dynamically -->
        </div>
        <div class="axis-info">
            <div class="axis-info-item">
                <span class="axis-info-color left"></span>
                <span>Left axis</span>
            </div>
            <div class="axis-info-item">
                <span class="axis-info-color right"></span>
                <span>Right axis</span>
            </div>
        </div>
    `;
    
    // Insert before chart container
    const chartContainer = document.querySelector('.chart-container');
    chartContainer.parentNode.insertBefore(axisControlsContainer, chartContainer);
}

// Update the axis controls when data columns change
function updateImprovedAxisControls() {
    const axisOptions = document.getElementById('axis-options');
    if (!axisOptions) return;
    
    // Clear existing controls
    axisOptions.innerHTML = '';
    
    // Get all columns that are currently selected (checked) in the column selectors
    const selectedColumns = Array.from(
        document.querySelectorAll('#columnSelectors input[type="checkbox"]:checked')
    ).map(checkbox => checkbox.dataset.column);
    
    // Only show controls for selected columns
    if (selectedColumns.length === 0) {
        axisOptions.innerHTML = '<div class="no-columns-message">Select columns to visualize first</div>';
        return;
    }
    
    // Add controls for each selected column
    selectedColumns.forEach((column, index) => {
        const varContainer = document.createElement('div');
        varContainer.className = 'axis-variable selected-left'; // Default to left
        varContainer.dataset.column = column;
        
        varContainer.innerHTML = `
            <span class="axis-variable-name">${column}</span>
            <div class="axis-selector">
                <label class="left" title="Plot on left axis">
                    <input type="radio" name="axis-${column}" data-column="${column}" data-axis="left" checked>
                    L
                </label>
                <label class="right" title="Plot on right axis">
                    <input type="radio" name="axis-${column}" data-column="${column}" data-axis="right">
                    R
                </label>
            </div>
        `;
        
        // Add event listeners to update the selected class and chart
        const radioButtons = varContainer.querySelectorAll('input[type="radio"]');
        radioButtons.forEach(radio => {
            radio.addEventListener('change', function() {
                // Update the container class
                if (this.dataset.axis === 'left') {
                    varContainer.className = 'axis-variable selected-left';
                } else {
                    varContainer.className = 'axis-variable selected-right';
                }
                
                // Update the chart
                updateChart();
            });
        });
        
        axisOptions.appendChild(varContainer);
    });
}

// Update checkbox event handlers to ensure axis controls are updated
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
            updateImprovedAxisControls();
            updateChart();
        });
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

// Initialize chart on page load
initChart();

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
            dataObj[dataColumns[index]] = isNaN(numValue) ? value : numValue;
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
function updateDataColumns(values) {
    // Generate generic column names if not provided
    dataColumns = values.map((_, i) => `field${i+1}`);
    
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
    
    // Create axis selectors if they don't exist yet
    if (!document.querySelector('.axis-controls')) {
        createImprovedAxisControls();
    }
    
    // Update axis selectors
    updateImprovedAxisControls();
    
    // Update the checkbox event handlers
    updateColumnSelectorHandlers();
    
    // Initialize chart datasets
    updateChartDatasets();
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
    
    // Get selected axis for each column using the new UI
    const columnAxes = {};
    selectedColumns.forEach(column => {
        const rightAxisRadio = document.querySelector(
            `.axis-variable[data-column="${column}"] input[data-axis="right"]:checked`
        );
        columnAxes[column] = rightAxisRadio ? 'right' : 'left';
    });
    
    // Define colors for each axis
    const leftAxisColors = ['#3182ce', '#805ad5', '#38a169', '#4a5568'];
    const rightAxisColors = ['#ed8936', '#e53e3e', '#d69e2e', '#38b2ac'];
    
    // Count how many datasets are on each axis
    let leftAxisCount = 0;
    let rightAxisCount = 0;
    
    // Update datasets
    chart.data.datasets = selectedColumns.map((column) => {
        const isRightAxis = columnAxes[column] === 'right';
        const axisColors = isRightAxis ? rightAxisColors : leftAxisColors;
        const colorIndex = isRightAxis ? rightAxisCount++ : leftAxisCount++;
        
        const dataPoints = filteredData.map(d => ({
            x: d.timestamp,
            y: d[column]
        }));
        
        return {
            label: column,
            data: dataPoints,
            borderColor: axisColors[colorIndex % axisColors.length],
            backgroundColor: axisColors[colorIndex % axisColors.length] + '20',
            tension: 0.1,
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 7,
            yAxisID: isRightAxis ? 'y1' : 'y'
        };
    });
    
    // If no datasets selected but we have data, show something by default
    if (chart.data.datasets.length === 0 && dataColumns.length > 0) {
        console.log("No columns selected, defaulting to first column:", dataColumns[0]);
        
        const dataPoints = filteredData.map(d => ({
            x: d.timestamp,
            y: d[dataColumns[0]]
        }));
        
        chart.data.datasets = [{
            label: dataColumns[0],
            data: dataPoints,
            borderColor: leftAxisColors[0],
            backgroundColor: leftAxisColors[0] + '20',
            tension: 0.1,
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 7,
            yAxisID: 'y'
        }];
        
        // Check the first checkbox
        const firstCheckbox = document.getElementById('col-0');
        if (firstCheckbox) firstCheckbox.checked = true;
        
        // Update the axis controls
        updateImprovedAxisControls();
    }
    
    // Update axis titles based on what's selected for each axis
    const leftAxisColumns = selectedColumns.filter(col => columnAxes[col] === 'left');
    const rightAxisColumns = selectedColumns.filter(col => columnAxes[col] === 'right');
    
    chart.options.scales.y.title.text = leftAxisColumns.length > 0 
        ? leftAxisColumns.join(', ') 
        : 'Left Axis';
        
    chart.options.scales.y1.title.text = rightAxisColumns.length > 0 
        ? rightAxisColumns.join(', ') 
        : 'Right Axis';
    
    // Hide right axis if not used
    chart.options.scales.y1.display = rightAxisColumns.length > 0;
    
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

// Save data to local storage function (disabled)
function saveToLocalStorage() {
    // Function intentionally left empty to disable automatic data saving
    console.log("Data saving to localStorage has been disabled");
}

// Try to restore data from local storage function (disabled)
function tryRestoreData() {
    // Function intentionally left empty to disable data restoration
    console.log("Data restoration has been disabled");
}

// Add some test data if in development mode (for testing purposes)
function addTestData() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('debug') === 'true') {
        dataColumns = ['Temperature', 'Humidity', 'Pressure'];
        
        //dataColumns = ['Temperature', 'Humidity', 'Pressure'];
        
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

// Check if we should add test data
addTestData();
